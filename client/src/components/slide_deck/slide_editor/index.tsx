import { trackStore } from "@solid-primitives/deep";
import type {
  ContentBlock,
  ContentSlide,
  CoverSlide,
  ProjectState,
  SectionSlide,
  Slide,
  SlideDeckConfig,
  SlideType,
} from "lib";
import { getSlideTitle, materializeSlide, t3, PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import type {
  DividerDragUpdate,
  LayoutItemSwapUpdate,
  LayoutNode,
  MeasuredPage,
} from "panther";
import {
  AlertComponentProps,
  APIResponseWithData,
  Button,
  FrameLeftResizable,
  FrameTop,
  getQueryStateFromApiResponse,
  HeadingBar,
  PageHolder,
  PageInputs,
  Select,
  StateHolder,
  applyDividerDragUpdate,
  findNodeInDraft,
  createItemNode,
  findById,
  getEditorWrapper,
  openAlert,
  openComponent,
  showMenu,
} from "panther";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import {
  createStore,
  produce,
  reconcile,
  unwrap,
  type SetStoreFunction,
} from "solid-js/store";
import { ConflictResolutionModal } from "~/components/forms_editors/conflict_resolution_modal";
import { buildLayoutContextMenu } from "~/components/layout_editor/build_context_menu";
import { AddVisualization } from "~/components/project/add_visualization";
import { useAIProjectContext } from "~/components/project_ai/context";
import type { AIContext } from "~/components/project_ai/types";
import { VisualizationEditor } from "~/components/visualization";
import {
  makeFigureBundleFromFetchedData,
  resolveFigureBundleFromVisualization,
} from "~/generate_visualization/mod";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/project/t2_slides";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/project/t2_presentation_objects";
import { setShowAi, showAi } from "~/state/t4_ui";
import {
  openSlideSession,
  otherPeers,
  setCollabView,
  type SlideSession,
} from "~/state/project/collab";
import { addLastUpdatedListener } from "~/state/project/t1_sse";
import { createIdGeneratorForLayout } from "~/components/slide_deck/_id_generation";
import { snapshotForVizEditor } from "~/components/_editor_snapshot";
import { SelectVisualizationForSlide } from "../select_visualization_for_slide";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { convertBlockType } from "../slide_transforms/convert_block_type";
import { convertSlideType } from "../slide_transforms/convert_slide_type";
import { SlideEditorPanel } from "./editor_panel";

function updateBlockInLayout(
  layout: LayoutNode<ContentBlock>,
  targetId: string,
  updater: (block: ContentBlock) => ContentBlock,
): LayoutNode<ContentBlock> {
  if (layout.type === "item") {
    if (layout.id === targetId) {
      return { ...layout, data: updater(layout.data) };
    }
    return layout;
  }

  return {
    ...layout,
    children: layout.children.map((child) =>
      updateBlockInLayout(child as LayoutNode<ContentBlock>, targetId, updater),
    ),
  };
}

type SlideEditorInnerProps = {
  projectId: string;
  deckId: string;
  deckLabel: string;
  slideId: string;
  slide: Slide;
  lastUpdated: string;
  projectStateSnapshot: ProjectState;
  deckConfigSnapshot: SlideDeckConfig;
  returnToContext?: AIContext;
};

type Props = AlertComponentProps<SlideEditorInnerProps, boolean>;

export function SlideEditor(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
  const { aiContext, setAIContext, notifyAI } = useAIProjectContext();

  // No normalization needed - panther operations produce valid output
  const normalizedSlide = p.slide;

  const [needsSave, setNeedsSave] = createSignal(false);
  const [lastKnownServerTimestamp, setLastKnownServerTimestamp] = createSignal(
    p.lastUpdated,
  );
  const [tempSlide, setTempSlide] = createStore<Slide>(
    structuredClone(normalizedSlide),
  );

  const manuallyUpdateTempSlide: SetStoreFunction<Slide> = (...args: any[]) => {
    (setTempSlide as any)(...args);
    notifyAI({ type: "edited_slide_locally" });
  };

  // Cache each type's state for restoration when switching back
  const typeCache: {
    cover?: CoverSlide;
    section?: SectionSlide;
    content?: ContentSlide;
  } = {};
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Rendering...",
  });
  const [selectedBlockId, setSelectedBlockId] = createSignal<
    string | undefined
  >();
  const [contentTab, setContentTab] = createSignal<"slide" | "block">("slide");
  const [measuredPage, setMeasuredPage] = createSignal<MeasuredPage>();

  // Live co-editing (Milestone 3). The editor keeps mutating `tempSlide`; a
  // bridge syncs it to a shared CRDT doc. Degrades gracefully: if the collab
  // socket/room is unavailable, the session never becomes ready, pushLocal is a
  // no-op, and editing behaves exactly as before (tempSlide + explicit Save).
  const [collabReady, setCollabReady] = createSignal(false);
  // Signal (not a bare let) so the panel reactively picks up the session once it
  // opens — needed to bind the CodeMirror text editor to the block's Y.Text.
  const [session, setSession] = createSignal<SlideSession | null>(null);
  let removeLastUpdatedListener: (() => void) | null = null;
  // Set when a remote update drove the next tempSlide change, so the tracking
  // effect doesn't ship it straight back (syncSlideToDoc is also idempotent, a
  // belt-and-suspenders backstop against echo loops).
  let skipNextPush = false;
  // Count of sub-editors/modals (e.g. the visualization editor) currently open
  // over the slide canvas. While > 0 the peer-selection overlay is suppressed so
  // its body-portaled boxes don't float on top of that modal.
  const [subEditorOpen, setSubEditorOpen] = createSignal(0);
  async function withCanvasCovered<T>(opening: Promise<T>): Promise<T> {
    setSubEditorOpen((n) => n + 1);
    try {
      return await opening;
    } finally {
      setSubEditorOpen((n) => n - 1);
    }
  }

  // Render slide preview
  async function attemptGetPageInputs(slide: Slide) {
    const res = await convertSlideToPageInputs(
      p.projectId,
      slide,
      undefined,
      p.deckConfigSnapshot,
    );
    setPageInputs(getQueryStateFromApiResponse(res));
  }

  // Debounced re-render on changes (100ms)
  let renderTimeout: ReturnType<typeof setTimeout> | null = null;
  let firstRun = true;

  createEffect(() => {
    trackStore(tempSlide);
    if (firstRun) {
      firstRun = false;
      return;
    }

    const fromRemote = skipNextPush;
    skipNextPush = false;

    if (!fromRemote) {
      // Local edit: mark dirty (for the explicit Save fallback) and push the
      // change onto the shared doc as mergeable ops (no-op until the session
      // is ready).
      setNeedsSave(true);
      session()?.pushLocal(unwrap(tempSlide));
    }

    // Re-render the preview for both local and remote changes.
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = setTimeout(() => {
      attemptGetPageInputs(unwrap(tempSlide));
    }, 100);
  });

  onMount(() => {
    attemptGetPageInputs(unwrap(tempSlide));
    setAIContext({
      mode: "editing_slide",
      slideId: p.slideId,
      slideLabel: getSlideTitle(normalizedSlide),
      slideType: normalizedSlide.type as SlideType,
      deckId: p.deckId,
      deckLabel: p.deckLabel,
      getTempSlide: () => tempSlide,
      setTempSlide,
    });

    // Bind this slide to a shared CRDT document for live co-editing.
    const s = openSlideSession(
      p.slideId,
      () => {
        const docSlide = materializeSlide(s.doc) as Slide;
        if (!collabReady()) {
          setCollabReady(true);
          // Local edits made before the first sync arrived: merge them into the
          // doc rather than discarding them by adopting the server state.
          if (needsSave()) {
            s.pushLocal(unwrap(tempSlide));
            return;
          }
        }
        // Adopt the doc state only when it actually differs, so skipNextPush is
        // armed exactly when a store change will fire the tracking effect (a
        // no-op reconcile would otherwise leave the flag stuck and swallow the
        // next local edit).
        if (JSON.stringify(docSlide) !== JSON.stringify(unwrap(tempSlide))) {
          skipNextPush = true;
          setTempSlide(reconcile(docSlide));
        }
      },
      (errMsg) => console.warn("Slide collab error:", errMsg),
    );
    setSession(s);

    // Keep the optimistic-save timestamp fresh as server-side checkpoints (or
    // other users' saves) bump last_updated, so the explicit Save fallback
    // won't raise a spurious conflict while co-editing.
    removeLastUpdatedListener = addLastUpdatedListener((tableName, ids, ts) => {
      if (tableName === "slides" && ids.includes(p.slideId)) {
        setLastKnownServerTimestamp(ts);
      }
    });
  });

  // Advertise which slide/block this user is editing so collaborators see it.
  createEffect(() => {
    setCollabView({
      deckId: p.deckId,
      slideId: p.slideId,
      selectedBlockId: selectedBlockId(),
    });
  });

  onCleanup(() => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    if (p.returnToContext) {
      setAIContext(p.returnToContext);
    }
    // Revert presence to deck-level (no slide) when the editor closes.
    setCollabView({ deckId: p.deckId });
    // Tear down the collab session for this slide.
    session()?.close();
    setSession(null);
    removeLastUpdatedListener?.();
    removeLastUpdatedListener = null;
  });

  type SaveFuncData = {
    lastUpdated: string;
    conflictResolutionDecision?:
      | "user_chose_view_theirs"
      | "user_chose_cancel"
      | "user_chose_save_as_new";
  };

  async function saveFunc(
    overwriteIfConflict?: boolean,
  ): Promise<APIResponseWithData<SaveFuncData>> {
    if (!needsSave()) {
      return {
        success: true,
        data: { lastUpdated: lastKnownServerTimestamp() },
      };
    }

    const updateRes = await serverActions.updateSlide({
      projectId: p.projectId,
      slide_id: p.slideId,
      slide: unwrap(tempSlide),
      expectedLastUpdated: lastKnownServerTimestamp(),
      overwrite: overwriteIfConflict,
    });

    if (updateRes.success === false && updateRes.err === "CONFLICT") {
      const userChoice = await openComponent({
        element: ConflictResolutionModal,
        props: {
          itemName: "slide",
        },
      });

      if (userChoice === "view_theirs") {
        return {
          success: true,
          data: {
            lastUpdated: lastKnownServerTimestamp(),
            conflictResolutionDecision: "user_chose_view_theirs",
          },
        };
      }

      if (userChoice === "overwrite") {
        return saveFunc(true);
      }

      if (userChoice === "save_as_new") {
        const createRes = await serverActions.createSlide({
          projectId: p.projectId,
          deck_id: p.deckId,
          position: { after: p.slideId },
          slide: unwrap(tempSlide),
        });

        if (createRes.success === false) {
          return createRes;
        }

        return {
          success: true,
          data: {
            lastUpdated: createRes.data.lastUpdated,
            conflictResolutionDecision: "user_chose_save_as_new",
          },
        };
      }

      return {
        success: true,
        data: {
          lastUpdated: lastKnownServerTimestamp(),
          conflictResolutionDecision: "user_chose_cancel",
        },
      };
    }

    if (updateRes.success === false) {
      return updateRes;
    }

    const promise = serverActions.getSlide({
      projectId: p.projectId,
      slide_id: p.slideId,
    });
    await _SLIDE_CACHE.setPromise(
      promise,
      { projectId: p.projectId, slideId: p.slideId },
      updateRes.data.lastUpdated,
    );
    await promise;

    setNeedsSave(false);
    setLastKnownServerTimestamp(updateRes.data.lastUpdated);

    return { success: true, data: { lastUpdated: updateRes.data.lastUpdated } };
  }

  async function handleCancel() {
    // Edits autosave via the collab checkpoint; only flush explicitly when
    // collab isn't the one saving (WS down / before first sync) so closing in
    // that fallback state doesn't lose work.
    if (needsSave() && !collabReady()) await saveFunc();
    p.close(false);
  }

  function handleDividerDrag(update: DividerDragUpdate) {
    if (tempSlide.type !== "content") return;

    const currentSlide = unwrap(tempSlide) as ContentSlide;
    const updatedLayout = applyDividerDragUpdate(currentSlide.layout, update);

    manuallyUpdateTempSlide(
      reconcile({ ...currentSlide, layout: updatedLayout }),
    );
  }

  // Uses produce (not reconcile) because swapping exchanges data references
  // between two nodes. reconcile mutates the first node's data in-place,
  // which corrupts the second node's "new" value since it was the same
  // reference. produce just swaps the pointers without walking into objects.
  function handleLayoutItemSwap(update: LayoutItemSwapUpdate) {
    manuallyUpdateTempSlide(
      produce((draft) => {
        if (draft.type !== "content") return;
        const nodeA = findNodeInDraft(draft.layout, update.sourceNodeId);
        const nodeB = findNodeInDraft(draft.layout, update.targetNodeId);
        if (!nodeA || !nodeB) return;
        if (nodeA.type !== "item" || nodeB.type !== "item") return;
        const tmpData = nodeA.data;
        const tmpStyle = nodeA.style;
        nodeA.data = nodeB.data;
        nodeA.style = nodeB.style;
        nodeB.data = tmpData;
        nodeB.style = tmpStyle;
      }),
    );
  }

  function handleTypeChange(newType: "cover" | "section" | "content") {
    const currentSlide = unwrap(tempSlide);

    // Save current state before switching
    if (currentSlide.type === "cover") {
      typeCache.cover = structuredClone(currentSlide);
    } else if (currentSlide.type === "section") {
      typeCache.section = structuredClone(currentSlide);
    } else if (currentSlide.type === "content") {
      typeCache.content = structuredClone(currentSlide);
    }

    // Check if we have a cached version of the target type
    let converted: Slide;
    if (newType === "cover" && typeCache.cover) {
      converted = typeCache.cover;
    } else if (newType === "section" && typeCache.section) {
      converted = typeCache.section;
    } else if (newType === "content" && typeCache.content) {
      converted = typeCache.content;
    } else {
      // No cache - convert from current slide
      converted = convertSlideType(currentSlide, newType);
    }

    manuallyUpdateTempSlide(reconcile(converted));
    setNeedsSave(true);
  }

  function getLayoutCallbacks() {
    if (tempSlide.type !== "content") return undefined;
    const contentSlide = unwrap(tempSlide) as ContentSlide;
    const idGenerator = createIdGeneratorForLayout(contentSlide.layout);
    return {
      onLayoutChange: (newLayout: LayoutNode<ContentBlock>) => {
        manuallyUpdateTempSlide(
          reconcile({ ...unwrap(tempSlide), layout: newLayout }),
        );
      },
      onSelectionChange: setSelectedBlockId,
      createNewBlock: () =>
        createItemNode<ContentBlock>(
          { type: "text", markdown: "" },
          undefined,
          idGenerator,
        ),
      idGenerator,
      getBlockType: (block: ContentBlock) => block.type,
      isFigureWithSource: (block: ContentBlock) =>
        block.type === "figure" && block.bundle !== undefined,
      isEmptyFigure: (block: ContentBlock) =>
        block.type === "figure" && block.bundle === undefined,
      onEditVisualization: async (blockId: string) => {
        setSelectedBlockId(blockId);
        await handleEditVisualization();
      },
      onSelectVisualization: async (blockId: string) => {
        await handleSelectVisualization(blockId);
      },
      onReplaceVisualization: async (blockId: string) => {
        await handleSelectVisualization(blockId);
      },
      onCreateVisualization: async (blockId: string) => {
        setSelectedBlockId(blockId);
        await handleCreateVisualization();
      },
      onRemoveVisualization: (blockId: string) => {
        if (tempSlide.type !== "content") return;
        const updatedLayout = updateBlockInLayout(
          tempSlide.layout,
          blockId,
          () => ({ type: "figure" as const }),
        );
        manuallyUpdateTempSlide(
          reconcile({ ...unwrap(tempSlide), layout: updatedLayout }),
        );
      },
    };
  }

  function handleShowLayoutMenu(x: number, y: number) {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;
    const callbacks = getLayoutCallbacks();
    if (!callbacks) return;
    const items = buildLayoutContextMenu(tempSlide.layout, blockId, callbacks);
    showMenu({ anchor: { x, y, width: 0, height: 0 }, items });
  }

  async function handleEditVisualization() {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;

    const found = findById(tempSlide.layout, blockId);
    if (!found || found.node.type !== "item") return;

    const block = found.node.data;
    if (block.type !== "figure" || !block.bundle) return;

    const { metricId, config: bundleConfig } = block.bundle;

    try {
      const resultsValue = p.projectStateSnapshot.metrics.find(
        (m) => m.id === metricId,
      );

      if (!resultsValue) {
        await openAlert({
          text: "Metric not found in project",
          intent: "danger",
        });
        return;
      }

      const result = await withCanvasCovered(openEditor({
        element: VisualizationEditor,
        props: {
          mode: "ephemeral" as const,
          label: resultsValue.label,
          projectId: p.projectId,
          returnToContext: aiContext(),
          ...snapshotForVizEditor({
            projectState: p.projectStateSnapshot,
            resultsValue,
            config: bundleConfig,
          }),
        },
      }));

      if (result?.updated) {
        const newConfig = result.updated.config;

        const newItemsRes = await getPresentationObjectItemsFromCacheOrFetch(
          p.projectId,
          {
            id: "",
            projectId: p.projectId,
            lastUpdated: "",
            label: "Ephemeral",
            resultsValue: resultsValue,
            config: newConfig,
            isDefault: false,
            folderId: null,
          },
          newConfig,
        );

        if (
          newItemsRes.success === false ||
          newItemsRes.data.ih.status !== "ok"
        ) {
          await openAlert({
            text: "Failed to regenerate visualization",
            intent: "danger",
          });
          return;
        }

        const newBundle = makeFigureBundleFromFetchedData({
          resultsValue,
          ih: newItemsRes.data.ih as Parameters<
            typeof makeFigureBundleFromFetchedData
          >[0]["ih"],
          effectiveConfig: newItemsRes.data.config,
        });

        const updatedLayout = updateBlockInLayout(
          tempSlide.layout,
          blockId,
          (b: ContentBlock) => {
            if (b.type !== "figure") return b;
            return { type: "figure" as const, bundle: newBundle };
          },
        );

        manuallyUpdateTempSlide(
          reconcile({ ...unwrap(tempSlide), layout: updatedLayout }),
        );
      }
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error ? err.message : "Failed to edit visualization",
        intent: "danger",
      });
    }
  }

  async function handleSelectVisualization(blockIdOverride?: string) {
    const blockId = blockIdOverride ?? selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;

    const result = await withCanvasCovered(openEditor({
      element: SelectVisualizationForSlide,
      props: { projectState: p.projectStateSnapshot },
    }));

    if (!result) return;

    try {
      const bundle = await resolveFigureBundleFromVisualization(p.projectId, {
        visualizationId: result.visualizationId,
        replicant: result.replicant,
      });

      const updatedLayout = updateBlockInLayout(
        tempSlide.layout,
        blockId,
        () => ({ type: "figure" as const, bundle }),
      );

      manuallyUpdateTempSlide(
        reconcile({ ...unwrap(tempSlide), layout: updatedLayout }),
      );
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error ? err.message : "Failed to select visualization",
        intent: "danger",
      });
    }
  }

  async function handleCreateVisualization() {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;

    const result = await withCanvasCovered(openComponent({
      element: AddVisualization,
      props: {
        projectId: p.projectId,
        metrics: p.projectStateSnapshot.metrics,
        modules: p.projectStateSnapshot.projectModules,
      },
    }));

    if (!result) return;

    try {
      const { resultsValue, config } = result;

      const newItemsRes = await getPresentationObjectItemsFromCacheOrFetch(
        p.projectId,
        {
          id: "",
          projectId: p.projectId,
          lastUpdated: "",
          label: "Ephemeral",
          resultsValue,
          config,
          isDefault: false,
          folderId: null,
        },
        config,
      );

      if (
        newItemsRes.success === false ||
        newItemsRes.data.ih.status !== "ok"
      ) {
        await openAlert({
          text: "Failed to generate visualization",
          intent: "danger",
        });
        return;
      }

      const bundle = makeFigureBundleFromFetchedData({
        resultsValue,
        ih: newItemsRes.data.ih as Parameters<
          typeof makeFigureBundleFromFetchedData
        >[0]["ih"],
        effectiveConfig: newItemsRes.data.config,
      });

      const updatedLayout = updateBlockInLayout(
        tempSlide.layout,
        blockId,
        () => ({ type: "figure" as const, bundle }),
      );

      manuallyUpdateTempSlide(
        reconcile({ ...unwrap(tempSlide), layout: updatedLayout }),
      );
    } catch (err) {
      await openAlert({
        text:
          err instanceof Error ? err.message : "Failed to create visualization",
        intent: "danger",
      });
    }
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={t3({
              en: "Edit Slide",
              fr: "Modifier la diapositive",
              pt: "Editar diapositivo",
            })}
            leftChildren={
              <Button iconName="chevronLeft" onClick={handleCancel} />
            }
          >
            <div class="ui-gap-sm flex items-center">
              <Select
                options={[
                  {
                    value: "cover",
                    label: t3({ en: "Cover", fr: "Couverture", pt: "Capa" }),
                  },
                  {
                    value: "section",
                    label: t3({ en: "Section", fr: "Section", pt: "Secção" }),
                  },
                  {
                    value: "content",
                    label: t3({ en: "Content", fr: "Contenu", pt: "Conteúdo" }),
                  },
                ]}
                value={tempSlide.type}
                onChange={(v: string) =>
                  handleTypeChange(v as "cover" | "section" | "content")
                }
              />
              <Show when={!showAi()}>
                <Button
                  onClick={() => setShowAi(true)}
                  iconName="chevronLeft"
                  outline
                >
                  {t3({ en: "AI", fr: "IA", pt: "IA" })}
                </Button>
              </Show>
            </div>
          </HeadingBar>
        }
      >
        <FrameLeftResizable
          startingWidth={400}
          minWidth={300}
          maxWidth={600}
          hoverOffset="offset-for-border-1-on-left"
          panelChildren={
            <SlideEditorPanel
              projectId={p.projectId}
              tempSlide={tempSlide}
              setTempSlide={manuallyUpdateTempSlide}
              selectedBlockId={selectedBlockId()}
              setSelectedBlockId={setSelectedBlockId}
              session={session()}
              collabReady={collabReady()}
              openEditor={openEditor}
              contentTab={contentTab()}
              setContentTab={setContentTab}
              onShowLayoutMenu={handleShowLayoutMenu}
              onEditVisualization={handleEditVisualization}
              onSelectVisualization={() => handleSelectVisualization()}
              onCreateVisualization={handleCreateVisualization}
              showCoverLogosByDefault={
                p.deckConfigSnapshot.logos.cover.showByDefault
              }
              showHeaderLogosByDefault={
                p.deckConfigSnapshot.logos.header.showByDefault
              }
              showFooterLogosByDefault={
                p.deckConfigSnapshot.logos.footer.showByDefault
              }
              hasGlobalFooterText={
                p.deckConfigSnapshot.globalFooterText !== undefined
              }
            />
          }
        >
          <div class="bg-base-200 h-full w-full overflow-auto">
            <Show when={pageInputs().status === "loading"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-base-content/70">
                  {t3({
                    en: "Rendering slide...",
                    fr: "Rendu de la diapositive...",
                    pt: "A renderizar diapositivo...",
                  })}
                </div>
              </div>
            </Show>
            <Show when={pageInputs().status === "error"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-error">Error: {(pageInputs() as any).err}</div>
              </div>
            </Show>
            <Show
              when={
                pageInputs().status === "ready"
                  ? (pageInputs() as { status: "ready"; data: PageInputs }).data
                  : undefined
              }
              keyed
            >
              {(keyedPageInputs) => (
                <div class="ui-pad-lg bg-base-200 h-full w-full overflow-auto">
                  <PageHolder
                    pageInputs={keyedPageInputs}
                    canvasElementId="SLIDE_EDITOR_CANVAS"
                    pageWidthDu={PAGE_WIDTH_DU}
                    pageHeightDu={PAGE_HEIGHT_DU}
                    fitWithin={true}
                    onMeasured={(m) => setMeasuredPage(m)}
                    hoverStyle={{
                      fillColor: "rgba(0, 112, 243, 0.1)",
                      strokeColor: "rgba(0, 112, 243, 0.8)",
                      strokeWidth: 2,
                      showLayoutBoundaries: true,
                    }}
                    onClick={(target) => {
                      if (target.type === "layoutItem") {
                        setSelectedBlockId(target.node.id);
                        setContentTab("block");
                      } else if (
                        target.type === "headerText" ||
                        target.type === "subHeaderText" ||
                        target.type === "dateText" ||
                        target.type === "footerText" ||
                        target.type === "coverTitle" ||
                        target.type === "coverSubTitle" ||
                        target.type === "coverAuthor" ||
                        target.type === "coverDate" ||
                        target.type === "sectionTitle" ||
                        target.type === "sectionSubTitle"
                      ) {
                        setSelectedBlockId(undefined);
                        setContentTab("slide");
                      }
                    }}
                    onDividerDrag={handleDividerDrag}
                    onLayoutItemSwap={handleLayoutItemSwap}
                    onContextMenu={(e, target) => {
                      if (target.type !== "layoutItem") return;
                      const callbacks = getLayoutCallbacks();
                      if (!callbacks) return;
                      const items = buildLayoutContextMenu(
                        (tempSlide as ContentSlide).layout,
                        target.node.id,
                        {
                          ...callbacks,
                          onEditVisualization: async (blockId) => {
                            setSelectedBlockId(blockId);
                            await handleEditVisualization();
                          },
                          onSelectVisualization: async (blockId) => {
                            await handleSelectVisualization(blockId);
                          },
                          onReplaceVisualization: async (blockId) => {
                            await handleSelectVisualization(blockId);
                          },
                          onConvertToText: (blockId) => {
                            const newLayout = convertBlockType(
                              (tempSlide as ContentSlide).layout,
                              blockId,
                              "text",
                            );
                            manuallyUpdateTempSlide(
                              reconcile({
                                ...unwrap(tempSlide),
                                layout: newLayout,
                              }),
                            );
                            setSelectedBlockId(blockId);
                            setContentTab("block");
                          },
                          onConvertToFigure: (blockId) => {
                            const newLayout = convertBlockType(
                              (tempSlide as ContentSlide).layout,
                              blockId,
                              "figure",
                            );
                            manuallyUpdateTempSlide(
                              reconcile({
                                ...unwrap(tempSlide),
                                layout: newLayout,
                              }),
                            );
                            setSelectedBlockId(blockId);
                            setContentTab("block");
                          },
                          onConvertToImage: (blockId) => {
                            const newLayout = convertBlockType(
                              (tempSlide as ContentSlide).layout,
                              blockId,
                              "image",
                            );
                            manuallyUpdateTempSlide(
                              reconcile({
                                ...unwrap(tempSlide),
                                layout: newLayout,
                              }),
                            );
                            setSelectedBlockId(blockId);
                            setContentTab("block");
                          },
                        },
                      );
                      showMenu({
                        anchor: {
                          x: e.clientX,
                          y: e.clientY,
                          width: 0,
                          height: 0,
                        },
                        items,
                      });
                    }}
                  />
                  <PeerSelectionOverlay
                    measured={measuredPage()}
                    slideId={p.slideId}
                    suppressed={subEditorOpen() > 0}
                  />
                </div>
              )}
            </Show>
          </div>
        </FrameLeftResizable>
      </FrameTop>
    </EditorWrapper>
  );
}

type MeasuredNodeLike = {
  type: "item" | "rows" | "cols";
  id: string;
  rpd: { x(): number; y(): number; w(): number; h(): number };
  children?: MeasuredNodeLike[];
};

// Map each block's layout-node id to its rectangle in page (DU) coordinates.
// Mirrors panther's collectItemHitRegions (cols children take the parent column
// height) so highlight boxes line up exactly with the canvas hit regions.
function buildIdRectMap(
  root: MeasuredNodeLike,
): Map<string, { x: number; y: number; w: number; h: number }> {
  const map = new Map<string, { x: number; y: number; w: number; h: number }>();
  function walk(node: MeasuredNodeLike) {
    if (node.type === "item") {
      map.set(node.id, {
        x: node.rpd.x(),
        y: node.rpd.y(),
        w: node.rpd.w(),
        h: node.rpd.h(),
      });
    } else if (node.type === "cols") {
      for (const child of node.children ?? []) {
        if (child.type === "item") {
          map.set(child.id, {
            x: child.rpd.x(),
            y: child.rpd.y(),
            w: child.rpd.w(),
            h: node.rpd.h(),
          });
        } else {
          walk(child);
        }
      }
    } else {
      for (const child of node.children ?? []) walk(child);
    }
  }
  walk(root);
  return map;
}

// Draws a colored border around the block each remote peer has selected on the
// slide currently being edited. A DOM overlay is required because panther's
// canvas (PageHolder) is unmodifiable and exposes no highlight-by-id API. The
// boxes are positioned in viewport coordinates inside a Portal so a transformed
// modal ancestor cannot offset them, and recompute on resize/scroll.
function PeerSelectionOverlay(p: {
  measured: MeasuredPage | undefined;
  slideId: string;
  suppressed: boolean;
}) {
  const [tick, setTick] = createSignal(0);
  const bump = () => setTick((t) => t + 1);

  onMount(() => {
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
  });
  onCleanup(() => {
    window.removeEventListener("resize", bump);
    window.removeEventListener("scroll", bump, true);
  });

  const boxes = () => {
    tick(); // recompute when the canvas moves (resize/scroll)
    if (p.suppressed) return []; // a sub-editor/modal is open over the canvas
    const m = p.measured;
    if (!m || m.type !== "freeform") return [];
    const peers = otherPeers().filter(
      (peer) => peer.slideId === p.slideId && peer.selectedBlockId,
    );
    if (peers.length === 0) return [];
    const canvas = document.getElementById("SLIDE_EDITOR_CANVAS");
    if (!canvas) return [];
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return [];
    // Backstop for any other covering modal: if the slide canvas isn't the
    // topmost element at its own center, something is over it — suppress.
    const topEl = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    if (topEl && topEl !== canvas && !topEl.contains(canvas)) return [];
    const sx = r.width / PAGE_WIDTH_DU;
    const sy = r.height / PAGE_HEIGHT_DU;
    const rects = buildIdRectMap(
      (m as unknown as { mLayout: MeasuredNodeLike }).mLayout,
    );
    const out: {
      key: string;
      color: string;
      name: string;
      left: number;
      top: number;
      width: number;
      height: number;
    }[] = [];
    for (const peer of peers) {
      const rcd = rects.get(peer.selectedBlockId!);
      if (!rcd) continue;
      out.push({
        key: peer.connectionId,
        color: peer.color,
        name: peer.name,
        left: r.left + rcd.x * sx,
        top: r.top + rcd.y * sy,
        width: rcd.w * sx,
        height: rcd.h * sy,
      });
    }
    return out;
  };

  return (
    <Portal mount={document.body}>
      <div class="pointer-events-none fixed inset-0 z-[80]">
        <For each={boxes()}>
          {(b) => (
            <div
              class="pointer-events-none absolute rounded-sm"
              style={{
                left: `${b.left}px`,
                top: `${b.top}px`,
                width: `${b.width}px`,
                height: `${b.height}px`,
                border: `2px solid ${b.color}`,
              }}
            >
              <div
                class="absolute -top-[18px] left-0 whitespace-nowrap rounded px-1 text-[10px] font-semibold text-white"
                style={{ "background-color": b.color }}
              >
                {b.name}
              </div>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}
