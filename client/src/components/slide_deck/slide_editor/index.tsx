import { trackStore } from "@solid-primitives/deep";
import type {
  ContentBlock,
  ContentSlide,
  CoverSlide,
  ProjectDetail,
  SectionSlide,
  Slide,
  SlideDeckConfig,
  SlideType,
} from "lib";
import { getSlideTitle, t3, TC } from "lib";
import type {
  DividerDragUpdate,
  LayoutItemSwapUpdate,
  LayoutNode,
} from "panther";
import {
  AlertComponentProps,
  APIResponseWithData,
  Button,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  PageHolder,
  PageInputs,
  Select,
  StateHolder,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  applyDividerDragUpdate,
  findNodeInDraft,
  createItemNode,
  findById,
  getEditorWrapper,
  openAlert,
  openComponent,
  showMenu,
  timActionButton,
} from "panther";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
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
  getFigureInputsFromPresentationObject,
  stripFigureInputsForStorage,
} from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import {
  getPODetailFromCacheorFetch,
  getPOFigureInputsFromCacheOrFetch,
  getPresentationObjectItemsFromCacheOrFetch,
} from "~/state/po_cache";
import { setShowAi, showAi } from "~/state/t4_ui";
import { createIdGeneratorForLayout } from "~/components/slide_deck/_id_generation";
import { snapshotForVizEditor } from "~/components/_editor_snapshot";
import { useOptimisticSetLastUpdated } from "../../project_runner/mod";
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
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  deckConfig: SlideDeckConfig;
  returnToContext?: AIContext;
};

type Props = AlertComponentProps<SlideEditorInnerProps, boolean>;

export function SlideEditor(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const { aiContext, setAIContext, notifyAI } = useAIProjectContext();

  // No normalization needed - panther operations produce valid output
  const normalizedSlide = p.slide;

  const [needsSave, setNeedsSave] = createSignal(false);
  const [lastKnownServerTimestamp, setLastKnownServerTimestamp] = createSignal(p.lastUpdated);
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

  // Render slide preview
  async function attemptGetPageInputs(slide: Slide) {
    const res = await convertSlideToPageInputs(
      p.projectId,
      slide,
      undefined,
      p.deckConfig,
    );
    if (res.success) {
      setPageInputs({ status: "ready", data: res.data });
    } else {
      setPageInputs({ status: "error", err: res.err });
    }
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

    setNeedsSave(true);

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
  });

  onCleanup(() => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    if (p.returnToContext) {
      setAIContext(p.returnToContext);
    }
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
      return { success: true, data: { lastUpdated: lastKnownServerTimestamp() } };
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
          data: { lastUpdated: lastKnownServerTimestamp(), conflictResolutionDecision: "user_chose_view_theirs" },
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

        optimisticSetLastUpdated(
          "slides",
          createRes.data.slideId,
          createRes.data.lastUpdated,
        );

        return {
          success: true,
          data: { lastUpdated: createRes.data.lastUpdated, conflictResolutionDecision: "user_chose_save_as_new" },
        };
      }

      return {
        success: true,
        data: { lastUpdated: lastKnownServerTimestamp(), conflictResolutionDecision: "user_chose_cancel" },
      };
    }

    if (updateRes.success === false) {
      return updateRes;
    }

    optimisticSetLastUpdated("slides", p.slideId, updateRes.data.lastUpdated);

    const cached = await _SLIDE_CACHE.get({
      projectId: p.projectId,
      slideId: p.slideId,
    });
    const promise = serverActions.getSlide({
      projectId: p.projectId,
      slide_id: p.slideId,
    });
    await _SLIDE_CACHE.setPromise(
      promise,
      { projectId: p.projectId, slideId: p.slideId },
      cached.version,
    );
    await promise;

    setNeedsSave(false);
    setLastKnownServerTimestamp(updateRes.data.lastUpdated);

    return { success: true, data: { lastUpdated: updateRes.data.lastUpdated } };
  }

  const saveAndClose = timActionButton(
    () => saveFunc(),
    (data) => {
      if (data.conflictResolutionDecision === "user_chose_cancel") return;
      p.close(data.conflictResolutionDecision === "user_chose_view_theirs" ? false : true);
    },
  );

  const save = timActionButton(
    () => saveFunc(),
    (data) => {
      if (data.conflictResolutionDecision === "user_chose_view_theirs") p.close(false);
    },
  );

  function handleCancel() {
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
        block.type === "figure" && block.source?.type === "from_data",
      isEmptyFigure: (block: ContentBlock) =>
        block.type === "figure" && !block.figureInputs,
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
    showMenu({ x, y, items });
  }

  async function handleEditVisualization() {
    const blockId = selectedBlockId();
    if (!blockId || tempSlide.type !== "content") return;

    const found = findById(tempSlide.layout, blockId);
    if (!found || found.node.type !== "item") return;

    const block = found.node.data;
    if (block.type !== "figure" || block.source?.type !== "from_data") return;

    const source = block.source;

    try {
      const resultsValue = p.projectDetail.metrics.find(
        (m) => m.id === source.metricId,
      );

      if (!resultsValue) {
        await openAlert({
          text: "Metric not found in project",
          intent: "danger",
        });
        return;
      }

      const result = await openEditor({
        element: VisualizationEditor,
        props: {
          mode: "ephemeral" as const,
          label: resultsValue.label,
          projectId: p.projectId,
          isGlobalAdmin: p.isGlobalAdmin,
          returnToContext: aiContext(),
          ...snapshotForVizEditor({
            projectDetail: p.projectDetail,
            resultsValue,
            config: source.config,
          }),
        },
      });

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

        const resultsValueForViz = {
          formatAs: resultsValue.formatAs,
          valueProps: resultsValue.valueProps,
          valueLabelReplacements: resultsValue.valueLabelReplacements,
        };

        let geoJson;
        const mapLevel = getAdminAreaLevelFromMapConfig(newConfig);
        if (mapLevel) {
          geoJson = getGeoJsonSync(mapLevel);
        }

        const newFigureInputs = getFigureInputsFromPresentationObject(
          resultsValueForViz,
          newItemsRes.data.ih,
          newConfig,
          geoJson,
        );

        if (newFigureInputs.status !== "ready") {
          await openAlert({
            text: "Failed to generate figure",
            intent: "danger",
          });
          return;
        }

        const updatedLayout = updateBlockInLayout(
          tempSlide.layout,
          blockId,
          (b: ContentBlock) => {
            if (b.type !== "figure") return b;
            return {
              type: "figure",
              figureInputs: stripFigureInputsForStorage(newFigureInputs.data),
              source: {
                type: "from_data",
                metricId: source.metricId,
                config: newConfig,
                snapshotAt: new Date().toISOString(),
              },
            };
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

    const result = await openEditor({
      element: SelectVisualizationForSlide,
      props: { projectDetail: p.projectDetail },
    });

    if (!result) return;

    try {
      const replicateOverride = result.replicant
        ? { selectedReplicantValue: result.replicant, _forOptimizer: true }
        : { _forOptimizer: true };

      const poDetailRes = await getPODetailFromCacheorFetch(
        p.projectId,
        result.visualizationId,
      );
      if (!poDetailRes.success) {
        await openAlert({ text: poDetailRes.err, intent: "danger" });
        return;
      }

      const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
        p.projectId,
        result.visualizationId,
        replicateOverride as any,
      );
      if (!figureInputsRes.success) {
        await openAlert({ text: figureInputsRes.err, intent: "danger" });
        return;
      }

      const updatedLayout = updateBlockInLayout(
        tempSlide.layout,
        blockId,
        () => ({
          type: "figure" as const,
          figureInputs: structuredClone(
            stripFigureInputsForStorage(figureInputsRes.data),
          ),
          source: {
            type: "from_data" as const,
            metricId: poDetailRes.data.resultsValue.id,
            config: structuredClone(poDetailRes.data.config),
            snapshotAt: new Date().toISOString(),
          },
        }),
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

    const result = await openComponent({
      element: AddVisualization,
      props: {
        projectId: p.projectId,
        isGlobalAdmin: p.isGlobalAdmin,
        metrics: p.projectDetail.metrics,
        modules: p.projectDetail.projectModules,
      },
    });

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

      const resultsValueForViz = {
        formatAs: resultsValue.formatAs,
        valueProps: resultsValue.valueProps,
        valueLabelReplacements: resultsValue.valueLabelReplacements,
      };

      let geoJson2;
      const mapLevel2 = getAdminAreaLevelFromMapConfig(config);
      if (mapLevel2) {
        geoJson2 = getGeoJsonSync(mapLevel2);
      }

      const newFigureInputs = getFigureInputsFromPresentationObject(
        resultsValueForViz,
        newItemsRes.data.ih,
        config,
        geoJson2,
      );

      if (newFigureInputs.status !== "ready") {
        await openAlert({
          text: "Failed to generate figure",
          intent: "danger",
        });
        return;
      }

      const updatedLayout = updateBlockInLayout(
        tempSlide.layout,
        blockId,
        () => ({
          type: "figure" as const,
          figureInputs: stripFigureInputsForStorage(newFigureInputs.data),
          source: {
            type: "from_data" as const,
            metricId: resultsValue.id,
            config,
            snapshotAt: new Date().toISOString(),
          },
        }),
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
            heading={t3({ en: "Edit Slide", fr: "Modifier la diapositive" })}
            leftChildren={
              <Show
                when={needsSave()}
                fallback={
                  <Button iconName="chevronLeft" onClick={handleCancel} />
                }
              >
                <div class="ui-gap-sm flex items-center">
                  <Button
                    intent="success"
                    onClick={saveAndClose.click}
                    state={saveAndClose.state()}
                    iconName="save"
                  >
                    {t3({ en: "Save and close", fr: "Sauvegarder et quitter" })}
                  </Button>
                  <Button
                    intent="success"
                    onClick={save.click}
                    state={save.state()}
                    iconName="save"
                  >
                    {t3(TC.save)}
                  </Button>
                  <Button outline onClick={handleCancel} iconName="x">
                    {t3(TC.cancel)}
                  </Button>
                </div>
              </Show>
            }
          >
            <div class="ui-gap-sm flex items-center">
              <Select
                options={[
                  {
                    value: "cover",
                    label: t3({ en: "Cover", fr: "Couverture" }),
                  },
                  {
                    value: "section",
                    label: t3({ en: "Section", fr: "Section" }),
                  },
                  {
                    value: "content",
                    label: t3({ en: "Content", fr: "Contenu" }),
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
                  {t3({ en: "AI", fr: "IA" })}
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
              openEditor={openEditor}
              contentTab={contentTab()}
              setContentTab={setContentTab}
              onShowLayoutMenu={handleShowLayoutMenu}
              onEditVisualization={handleEditVisualization}
              onSelectVisualization={() => handleSelectVisualization()}
              onCreateVisualization={handleCreateVisualization}
              deckLogos={p.deckConfig.logos ?? []}
              deckFooter={p.deckConfig.deckFooter}
            />
          }
        >
          <div class="ui-pad bg-base-200 h-full w-full overflow-auto">
            <Show when={pageInputs().status === "loading"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-base-content/70">
                  {t3({
                    en: "Rendering slide...",
                    fr: "Rendu de la diapositive...",
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
                <div class="ui-pad bg-base-200 h-full w-full overflow-auto">
                  <PageHolder
                    pageInputs={keyedPageInputs}
                    canvasElementId="SLIDE_EDITOR_CANVAS"
                    fixedCanvasH={Math.round(
                      (_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16,
                    )}
                    fitWithin={true}
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
                    onMeasured={(mPage) => {
                      const mLayout = (mPage as any).mLayout;
                      if (!mLayout) return;
                      console.log("=== LAYOUT TREE ===");
                      const printNode = (node: any, depth = 0) => {
                        const indent = "  ".repeat(depth);
                        console.log(
                          `${indent}${node.type} id=${node.id} absCol=${node.absoluteStartColumn} span=${node.span ?? "none"}`,
                        );
                        if (node.children) {
                          node.children.forEach((child: any) =>
                            printNode(child, depth + 1),
                          );
                        }
                      };
                      printNode(mLayout);

                      const dividerGaps =
                        (mPage as any).gaps?.filter(
                          (g: any) => g.type === "col-divider",
                        ) || [];
                      if (dividerGaps.length > 0) {
                        console.log("=== COL DIVIDER GAPS ===");
                        dividerGaps.forEach((gap: any, i: number) => {
                          console.log(`Divider ${i}:`, gap);
                        });
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
                      showMenu({ x: e.clientX, y: e.clientY, items });
                    }}
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
