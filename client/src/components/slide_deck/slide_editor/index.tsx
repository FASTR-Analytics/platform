import { trackStore } from "@solid-primitives/deep";
import type { Slide, CoverSlide, SectionSlide, ContentSlide, InstanceDetail, ProjectDetail } from "lib";
import { getTextRenderingOptions, getMetricStaticData, t } from "lib";
import {
  AlertComponentProps,
  Button,
  EditablePageHolder,
  FrameRightResizable,
  FrameTop,
  getEditorWrapper,
  StateHolder,
  PageInputs,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  HeadingBar,
  findById,
  openComponent,
  showMenu,
  createItemNode,
  openAlert,
  FrameLeftResizable,
} from "panther";
import type { DividerDragUpdate, LayoutNode } from "panther";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { createStore, unwrap, reconcile } from "solid-js/store";
import { convertSlideToPageInputs } from "../utils/convert_slide_to_page_inputs";
import { SlideEditorPanel } from "./editor_panel";
import { convertSlideType } from "./convert_slide_type";
import { serverActions } from "~/server_actions";
import { useOptimisticSetLastUpdated } from "../../project_runner/mod";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { ConflictResolutionModal } from "~/components/forms_editors/conflict_resolution_modal";
import type { ContentBlock } from "lib";
import { VisualizationEditor } from "~/components/visualization";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/po_cache";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";
import { setShowAi, showAi } from "~/state/ui";
import { useAIProjectContext } from "~/components/project_ai/context";
import { buildLayoutContextMenu } from "~/components/layout_editor/build_context_menu";
import { convertBlockType } from "../utils/convert_block_type";

function findFirstItem(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> & { type: "item" } | undefined {
  if (node.type === "item") return node;
  for (const child of node.children) {
    const found = findFirstItem(child as LayoutNode<ContentBlock>);
    if (found) return found;
  }
  return undefined;
}

function ensureExplicitSpans(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
  if (node.type === "item") {
    return node;
  }

  // Recursively process children first
  let children = node.children.map(ensureExplicitSpans);

  // If this is a cols node and any children lack explicit spans, set equal spans
  if (node.type === "cols") {
    const hasAnyMissingSpans = children.some(c => c.span === undefined);
    if (hasAnyMissingSpans) {
      const spanPerChild = Math.floor(12 / children.length);
      children = children.map((child, i) => ({
        ...child,
        span: i === children.length - 1
          ? 12 - (spanPerChild * (children.length - 1))
          : spanPerChild
      }));
    }
  }

  return { ...node, children };
}

function updateBlockInLayout(
  layout: LayoutNode<ContentBlock>,
  targetId: string,
  updater: (block: ContentBlock) => ContentBlock
): LayoutNode<ContentBlock> {
  if (layout.type === "item") {
    if (layout.id === targetId) {
      return { ...layout, data: updater(layout.data) };
    }
    return layout;
  }

  return {
    ...layout,
    children: layout.children.map(child =>
      updateBlockInLayout(child as LayoutNode<ContentBlock>, targetId, updater)
    ),
  };
}

type SlideEditorInnerProps = {
  projectId: string;
  deckId: string;
  slideId: string;
  slide: Slide;
  lastUpdated: string;
  instanceDetail: InstanceDetail;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
};

type Props = AlertComponentProps<SlideEditorInnerProps, boolean>;

export function SlideEditor(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const { aiContext } = useAIProjectContext();

  // Normalize slide on open: ensure all cols have explicit spans for divider drag
  const normalizedSlide = p.slide.type === "content"
    ? { ...p.slide, layout: ensureExplicitSpans(p.slide.layout) }
    : p.slide;

  const [needsSave, setNeedsSave] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [tempSlide, setTempSlide] = createStore<Slide>(structuredClone(normalizedSlide));

  // Cache each type's state for restoration when switching back
  const typeCache = {
    cover: p.slide.type === "cover" ? structuredClone(p.slide) : undefined,
    section: p.slide.type === "section" ? structuredClone(p.slide) : undefined,
    content: p.slide.type === "content" ? structuredClone(p.slide) : undefined,
  } as {
    cover?: CoverSlide;
    section?: SectionSlide;
    content?: ContentSlide;
  };
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Rendering...",
  });
  const [selectedBlockId, setSelectedBlockId] = createSignal<string | undefined>();

  // Render slide preview
  function attemptGetPageInputs(slide: Slide) {
    const res = convertSlideToPageInputs(p.projectId, slide);
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
  });

  onCleanup(() => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
  });

  async function handleSave(overwriteIfConflict?: boolean) {
    if (!needsSave()) {
      p.close(false);
      return;
    }

    setIsSaving(true);

    const updateRes = await serverActions.updateSlide({
      projectId: p.projectId,
      slide_id: p.slideId,
      slide: unwrap(tempSlide),
      expectedLastUpdated: p.lastUpdated,
      overwrite: overwriteIfConflict,
    });

    if (updateRes.success === false && updateRes.err === "CONFLICT") {
      setIsSaving(false);

      // Show modal with options
      const userChoice = await openComponent({
        element: ConflictResolutionModal,
        props: {
          itemName: "slide"
        },
      });

      if (userChoice === "view_theirs") {
        // Close editor, parent will show their changes
        p.close(false);
        return;
      }

      if (userChoice === "overwrite") {
        // Retry with overwrite flag
        return handleSave(true);
      }

      if (userChoice === "save_as_new") {
        // Create new slide with user's edited content
        const createRes = await serverActions.createSlide({
          projectId: p.projectId,
          deck_id: p.deckId,
          position: { after: p.slideId },
          slide: unwrap(tempSlide),
        });

        if (createRes.success === false) {
          setIsSaving(false);
          return;
        }

        optimisticSetLastUpdated("slides", createRes.data.slideId, createRes.data.lastUpdated);

        p.close(true);
        return;
      }

      // userChoice === "cancel" - stay in editor
      return;
    }

    if (updateRes.success) {
      optimisticSetLastUpdated("slides", p.slideId, updateRes.data.lastUpdated);

      // Immediate cache update for instant thumbnail refresh
      const cached = await _SLIDE_CACHE.get({ projectId: p.projectId, slideId: p.slideId });
      const promise = serverActions.getSlide({ projectId: p.projectId, slide_id: p.slideId });
      await _SLIDE_CACHE.setPromise(promise, { projectId: p.projectId, slideId: p.slideId }, cached.version);
      await promise;

      p.close(true);
    } else {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    p.close(false);
  }

  function handleDividerDrag(update: DividerDragUpdate) {
    if (tempSlide.type !== "content") return;

    const slide = structuredClone(unwrap(tempSlide)) as ContentSlide;

    const leftResult = findById(slide.layout, update.leftNodeId);
    if (leftResult) {
      leftResult.node.span = update.suggestedSpans.left;
    }

    const rightResult = findById(slide.layout, update.rightNodeId);
    if (rightResult) {
      rightResult.node.span = update.suggestedSpans.right;
    }

    setTempSlide(reconcile(slide));
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

    setTempSlide(reconcile(converted));
    setNeedsSave(true);
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading="Edit Slide"
            leftChildren={<Show
              when={needsSave()}
              fallback={
                <Button
                  iconName="chevronLeft"
                  onClick={handleCancel}
                />
              }
            >
              <div class="flex items-center ui-gap-sm">
                <Button
                  intent="success"
                  onClick={() => handleSave()}
                  disabled={isSaving()}
                  loading={isSaving()}
                >
                  Save
                </Button>
                <Button
                  outline
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </div>
            </Show>}
          >
            <Show when={!showAi()}>
              <Button
                onClick={() => setShowAi(true)}
                iconName="chevronLeft"
                outline
              >
                {t("AI")}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <FrameLeftResizable
          startingWidth={400}
          minWidth={300}
          maxWidth={600}
          panelChildren={
            <SlideEditorPanel
              projectId={p.projectId}
              tempSlide={tempSlide}
              setTempSlide={setTempSlide}
              selectedBlockId={selectedBlockId()}
              setSelectedBlockId={setSelectedBlockId}
              openEditor={openEditor}
              onTypeChange={handleTypeChange}
            />
          }
        >
          <div class="h-full w-full overflow-auto ui-pad bg-base-200">
            <Show when={pageInputs().status === "loading"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-base-content/70">Rendering slide...</div>
              </div>
            </Show>
            <Show when={pageInputs().status === "error"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-error">Error: {(pageInputs() as any).err}</div>
              </div>
            </Show>
            <Show when={pageInputs().status === "ready" ? (pageInputs() as { status: "ready"; data: PageInputs }).data : undefined} keyed>
              {(keyedPageInputs) => (
                <div class="h-full w-full overflow-auto ui-pad bg-base-200">
                  <EditablePageHolder
                    pageInputs={keyedPageInputs}
                    canvasElementId="SLIDE_EDITOR_CANVAS"
                    fixedCanvasH={Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16)}
                    fitWithin={true}
                    textRenderingOptions={getTextRenderingOptions()}
                    hoverStyle={{
                      fillColor: "rgba(0, 112, 243, 0.1)",
                      strokeColor: "rgba(0, 112, 243, 0.8)",
                      strokeWidth: 2,
                      showLayoutBoundaries: true,
                    }}
                    onClick={(target) => {
                      if (target.type === "layoutItem") {
                        setSelectedBlockId(target.node.id);
                      }
                    }}
                    onDividerDrag={handleDividerDrag}
                    onContextMenu={async (e, target) => {
                      if (target.type !== "layoutItem") return;
                      if (tempSlide.type !== "content") return;

                      const items = buildLayoutContextMenu(
                        tempSlide.layout,
                        target.node.id,
                        {
                          onLayoutChange: (newLayout) => {
                            setTempSlide(reconcile({ ...unwrap(tempSlide), layout: newLayout }));
                          },
                          onSelectionChange: setSelectedBlockId,
                          createNewBlock: () => createItemNode<ContentBlock>({ type: "placeholder" }),

                          getBlockType: (block) => block.type,
                          isFigureWithSource: (block) =>
                            block.type === "figure" && block.source?.type === "from_data",

                          onEditVisualization: async (blockId) => {
                            const found = findById(tempSlide.layout, blockId);
                            if (!found || found.node.type !== "item") return;

                            const block = found.node.data;
                            if (block.type !== "figure" || block.source?.type !== "from_data") return;

                            const source = block.source;

                            try {
                              const metricStaticData = getMetricStaticData(source.metricId);
                              const resultsValue = p.projectDetail.metrics.find(m => m.id === source.metricId);

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
                                  label: metricStaticData.label,
                                  resultsValue: resultsValue,
                                  config: source.config,
                                  projectId: p.projectId,
                                  instanceDetail: p.instanceDetail,
                                  projectDetail: p.projectDetail,
                                  isGlobalAdmin: p.isGlobalAdmin,
                                  returnToContext: aiContext(),
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

                                if (newItemsRes.success === false || newItemsRes.data.ih.status !== "ok") {
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

                                const newFigureInputs = getFigureInputsFromPresentationObject(
                                  resultsValueForViz,
                                  newItemsRes.data.ih,
                                  newConfig,
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
                                      figureInputs: { ...newFigureInputs.data, style: undefined },
                                      source: {
                                        type: "from_data",
                                        metricId: source.metricId,
                                        config: newConfig,
                                        snapshotAt: new Date().toISOString(),
                                      },
                                    };
                                  }
                                );

                                setTempSlide(reconcile({ ...unwrap(tempSlide), layout: updatedLayout }));
                              }
                            } catch (err) {
                              await openAlert({
                                text: err instanceof Error ? err.message : "Failed to edit visualization",
                                intent: "danger",
                              });
                            }
                          },

                          onConvertToText: (blockId) => {
                            const newLayout = convertBlockType(tempSlide.layout, blockId, "text");
                            setTempSlide(reconcile({ ...unwrap(tempSlide), layout: newLayout }));
                          },

                          onConvertToFigure: (blockId) => {
                            const newLayout = convertBlockType(tempSlide.layout, blockId, "figure");
                            setTempSlide(reconcile({ ...unwrap(tempSlide), layout: newLayout }));
                          },

                          onConvertToPlaceholder: (blockId) => {
                            const newLayout = convertBlockType(tempSlide.layout, blockId, "placeholder");
                            setTempSlide(reconcile({ ...unwrap(tempSlide), layout: newLayout }));
                          },

                          onConvertToImage: (blockId) => {
                            const newLayout = convertBlockType(tempSlide.layout, blockId, "image");
                            setTempSlide(reconcile({ ...unwrap(tempSlide), layout: newLayout }));
                          },

                          ensureExplicitSpans,
                          findFirstItem,
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
