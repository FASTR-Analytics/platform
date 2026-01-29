import { trackStore } from "@solid-primitives/deep";
import type { Slide, CoverSlide, SectionSlide, ContentSlide } from "lib";
import { getTextRenderingOptions } from "lib";
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
  MenuItem,
  splitIntoRows,
  splitIntoColumns,
  addRow,
  addCol,
  deleteNodeWithCleanup,
  createItemNode,
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

type SlideEditorInnerProps = {
  projectId: string;
  deckId: string;
  slideId: string;
  slide: Slide;
  lastUpdated: string;
};

type Props = AlertComponentProps<SlideEditorInnerProps, boolean>;

export function SlideEditor(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();

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
        props: {},
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
          </HeadingBar>
        }
      >
        <FrameRightResizable
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
                    onContextMenu={(e, target) => {
                      if (target.type !== "layoutItem") return;
                      if (tempSlide.type !== "content") return;

                      const layout = tempSlide.layout;
                      const root = structuredClone(unwrap(layout));
                      const targetId = target.node.id;
                      const items: MenuItem[] = [];

                      const makeNewBlock = () =>
                        createItemNode<ContentBlock>({ type: "placeholder" });

                      const found = findById(root, targetId);
                      const isOnlyNode = root.type === "item" && root.id === targetId;
                      const parentType = found?.parent?.type;

                      // Split options
                      if (isOnlyNode || parentType === "cols") {
                        items.push({
                          label: "Split into rows",
                          icon: "plus",
                          onClick: () => {
                            const newBlock = makeNewBlock();
                            const result = splitIntoRows(root, targetId, newBlock);
                            setTempSlide(reconcile({ ...unwrap(tempSlide), layout: result }));
                            setSelectedBlockId(newBlock.id);
                          },
                        });
                      }
                      if (isOnlyNode || parentType === "rows") {
                        items.push({
                          label: "Split into columns",
                          icon: "plus",
                          onClick: () => {
                            const newBlock = makeNewBlock();
                            const result = splitIntoColumns(root, targetId, newBlock);
                            const resultWithSpans = ensureExplicitSpans(result);
                            setTempSlide(reconcile({ ...unwrap(tempSlide), layout: resultWithSpans }));
                            setSelectedBlockId(newBlock.id);
                          },
                        });
                      }

                      items.push({ type: "divider" });

                      // Add col left/right
                      items.push({
                        label: "Add col to left",
                        icon: "plus",
                        onClick: () => {
                          const newBlock = makeNewBlock();
                          const result = addCol(root, targetId, newBlock, "left");
                          const resultWithSpans = ensureExplicitSpans(result);
                          setTempSlide(reconcile({ ...unwrap(tempSlide), layout: resultWithSpans }));
                          setSelectedBlockId(newBlock.id);
                        },
                      });
                      items.push({
                        label: "Add col to right",
                        icon: "plus",
                        onClick: () => {
                          const newBlock = makeNewBlock();
                          const result = addCol(root, targetId, newBlock, "right");
                          const resultWithSpans = ensureExplicitSpans(result);
                          setTempSlide(reconcile({ ...unwrap(tempSlide), layout: resultWithSpans }));
                          setSelectedBlockId(newBlock.id);
                        },
                      });

                      items.push({ type: "divider" });

                      // Add row above/below
                      items.push({
                        label: "Add row above",
                        icon: "plus",
                        onClick: () => {
                          const newBlock = makeNewBlock();
                          const result = addRow(root, targetId, newBlock, "above");
                          setTempSlide(reconcile({ ...unwrap(tempSlide), layout: result }));
                          setSelectedBlockId(newBlock.id);
                        },
                      });
                      items.push({
                        label: "Add row below",
                        icon: "plus",
                        onClick: () => {
                          const newBlock = makeNewBlock();
                          const result = addRow(root, targetId, newBlock, "below");
                          setTempSlide(reconcile({ ...unwrap(tempSlide), layout: result }));
                          setSelectedBlockId(newBlock.id);
                        },
                      });

                      // Delete (only if not the only node)
                      if (!isOnlyNode) {
                        items.push({ type: "divider" });
                        items.push({
                          label: "Delete this cell",
                          icon: "trash",
                          intent: "danger",
                          onClick: () => {
                            const result = deleteNodeWithCleanup(root, targetId);
                            if (result) {
                              setTempSlide(reconcile({ ...unwrap(tempSlide), layout: result }));
                              const firstItem = findFirstItem(result);
                              setSelectedBlockId(firstItem?.id);
                            }
                          },
                        });
                      }

                      showMenu({
                        x: e.clientX,
                        y: e.clientY,
                        items,
                      });
                    }}
                  />
                </div>
              )}
            </Show>
          </div>
        </FrameRightResizable>
      </FrameTop>
    </EditorWrapper>
  );
}
