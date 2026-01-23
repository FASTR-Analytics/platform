import { trackStore } from "@solid-primitives/deep";
import {
  CustomUserSlide,
  MixedSlide,
  ProjectDetail,
  ReportItemConfig,
  ReportItemContentItem,
  getStartingReportItemPlaceholder,
  isSimpleSlide,
  getTextRenderingOptions,
} from "lib";
import {
  addCol,
  addRow,
  AlertComponentProps,
  APIResponseWithData,
  createItemNode,
  deleteNodeWithCleanup,
  EditablePageHolder,
  findById,
  FrameRightResizable,
  getEditorWrapper,
  LayoutNode,
  MenuItem,
  PageHitTarget,
  PageInputs,
  showMenu,
  splitIntoColumns,
  splitIntoRows,
  StateHolder,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
} from "panther";
import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { simpleSlideToCustomUserSlide } from "./conversions";
import { convertReportItemConfigToPageInputs } from "./transform_v2";
import { SlideEditorPanel } from "./slide_editor_panel";

function findFirstItem<U>(node: LayoutNode<U>): LayoutNode<U> & { type: "item" } | undefined {
  if (node.type === "item") return node;
  for (const child of node.children) {
    const found = findFirstItem(child as LayoutNode<U>);
    if (found) return found;
  }
  return undefined;
}

export type SlideEditorInnerProps = {
  projectDetail: ProjectDetail;
  reportId: string;
  slide: MixedSlide;
  slideIndex: number;
  totalSlides: number;
};

type Props = AlertComponentProps<SlideEditorInnerProps, MixedSlide | undefined>;

export function SlideEditor(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  // Convert SimpleSlide to CustomUserSlide if needed
  const initialSlide = isSimpleSlide(p.slide)
    ? simpleSlideToCustomUserSlide(p.slide)
    : p.slide;

  // Track if user made any changes
  const [needsSave, setNeedsSave] = createSignal(false);

  // Temp state
  const [tempReportItemConfig, setTempReportItemConfig] =
    createStore<ReportItemConfig>(structuredClone(initialSlide.config));

  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Rendering...",
  });

  // Selected item
  const getFirstItemId = (node: LayoutNode<ReportItemContentItem>): string => {
    if (node.type === "item") return node.id;
    if (node.children.length > 0) return getFirstItemId(node.children[0]);
    return node.id;
  };
  const initContent = initialSlide.config.freeform.content;
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>(
    getFirstItemId(initContent)
  );

  // Render slide
  let lastPageInputsRef: any = null;
  async function attemptGetPageInputs(reportItemConfig: ReportItemConfig) {
    const res = await convertReportItemConfigToPageInputs(
      p.projectDetail.id,
      reportItemConfig,
      p.slideIndex,
    );
    if (res.success === false) {
      console.log("convertReportItemConfigToPageInputs FAILED:", res.err);
      setPageInputs({ status: "error", err: res.err });
      return;
    }
    console.log("Same reference as last?", res.data === lastPageInputsRef);
    lastPageInputsRef = res.data;
    setPageInputs({ status: "ready", data: res.data });
  }

  // Debounce re-render on config changes
  let renderTimeout: ReturnType<typeof setTimeout> | null = null;
  let firstRunConfigChange = true;

  createEffect(() => {
    trackStore(tempReportItemConfig);
    if (firstRunConfigChange) {
      firstRunConfigChange = false;
      return;
    }

    setNeedsSave(true);

    // Clear existing timeout
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }

    // Debounce re-render by 300ms
    renderTimeout = setTimeout(() => {
      console.log("Re-running slide inputs because of config change");
      const unwrappedTempReportItemConfig = unwrap(tempReportItemConfig);
      attemptGetPageInputs(unwrappedTempReportItemConfig);
    }, 300);
  });

  onMount(() => {
    const unwrappedTempReportItemConfig = unwrap(tempReportItemConfig);
    attemptGetPageInputs(unwrappedTempReportItemConfig);
  });

  onCleanup(() => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
  });

  // Save function
  function handleSave() {
    if (!needsSave()) {
      // No changes - treat as cancel, return undefined
      p.close(undefined);
      return;
    }

    const unwrappedTempConfig = unwrap(tempReportItemConfig);

    // Create CustomUserSlide
    const customSlide: CustomUserSlide = {
      type: "custom",
      slideType: unwrappedTempConfig.type === "freeform" ? "freeform" : unwrappedTempConfig.type,
      config: unwrappedTempConfig,
      _originalSimpleSlide: isSimpleSlide(p.slide) ? p.slide : undefined,
    };

    // Return the updated slide via close
    p.close(customSlide);
  }

  // Cancel function
  function handleCancel() {
    // Return undefined to indicate cancel
    p.close(undefined);
  }

  return (
    <EditorWrapper>
      <FrameRightResizable
        startingWidth={400}
        minWidth={300}
        maxWidth={800}
        panelChildren={
          <SlideEditorPanel
            projectDetail={p.projectDetail}
            reportId={p.reportId}
            tempReportItemConfig={tempReportItemConfig}
            setTempReportItemConfig={setTempReportItemConfig}
            selectedItemId={selectedItemId()}
            setSelectedItemId={setSelectedItemId}
            onSave={handleSave}
            onCancel={handleCancel}
            hasUnsavedChanges={needsSave()}
            openEditor={openEditor}
          />
        }
      >
        <Show when={pageInputs().status === "ready" ? (pageInputs() as { status: "ready"; data: PageInputs }).data : undefined} keyed>
          {(keyedPageInputs) => {
            return (
              <div class="h-full w-full overflow-auto ui-pad bg-base-200">
                <EditablePageHolder
                  pageInputs={keyedPageInputs}
                  canvasElementId="SLIDE_EDITOR_CANVAS"
                  fixedCanvasH={Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16)}
                  textRenderingOptions={getTextRenderingOptions()}
                  hoverStyle={{
                    fillColor: "rgba(0, 112, 243, 0.1)",
                    strokeColor: "rgba(0, 112, 243, 0.8)",
                    strokeWidth: 2,
                    showLayoutBoundaries: true,
                  }}
                  onClick={(target: PageHitTarget) => {
                    if (target.type === "layoutItem") {
                      setSelectedItemId(target.node.id);
                    }
                  }}
                  onContextMenu={(e, target) => {
                    if (target.type !== "layoutItem") return;

                    const content = tempReportItemConfig.freeform.content;
                    const root = structuredClone(unwrap(content));
                    const targetId = target.node.id;
                    const items: MenuItem[] = [];

                    const makeNewItem = () =>
                      createItemNode<ReportItemContentItem>(getStartingReportItemPlaceholder());

                    const found = findById(root, targetId);
                    const isOnlyNode = root.type === "item" && root.id === targetId;
                    const parentType = found?.parent?.type;

                    // Split options
                    if (isOnlyNode || parentType === "cols") {
                      items.push({
                        label: "Split into rows",
                        icon: "plus",
                        onClick: () => {
                          const newItem = makeNewItem();
                          const result = splitIntoRows(root, targetId, newItem);
                          setTempReportItemConfig("freeform", "content", result);
                          setSelectedItemId(newItem.id);
                        },
                      });
                    }
                    if (isOnlyNode || parentType === "rows") {
                      items.push({
                        label: "Split into columns",
                        icon: "plus",
                        onClick: () => {
                          const newItem = makeNewItem();
                          const result = splitIntoColumns(root, targetId, newItem);
                          setTempReportItemConfig("freeform", "content", result);
                          setSelectedItemId(newItem.id);
                        },
                      });
                    }

                    items.push({ type: "divider" });

                    // Add col left/right
                    items.push({
                      label: "Add col to left",
                      icon: "plus",
                      onClick: () => {
                        const newItem = makeNewItem();
                        const result = addCol(root, targetId, newItem, "left");
                        setTempReportItemConfig("freeform", "content", result);
                        setSelectedItemId(newItem.id);
                      },
                    });
                    items.push({
                      label: "Add col to right",
                      icon: "plus",
                      onClick: () => {
                        const newItem = makeNewItem();
                        const result = addCol(root, targetId, newItem, "right");
                        setTempReportItemConfig("freeform", "content", result);
                        setSelectedItemId(newItem.id);
                      },
                    });

                    items.push({ type: "divider" });

                    // Add row above/below
                    items.push({
                      label: "Add row above",
                      icon: "plus",
                      onClick: () => {
                        const newItem = makeNewItem();
                        const result = addRow(root, targetId, newItem, "above");
                        setTempReportItemConfig("freeform", "content", result);
                        setSelectedItemId(newItem.id);
                      },
                    });
                    items.push({
                      label: "Add row below",
                      icon: "plus",
                      onClick: () => {
                        const newItem = makeNewItem();
                        const result = addRow(root, targetId, newItem, "below");
                        setTempReportItemConfig("freeform", "content", result);
                        setSelectedItemId(newItem.id);
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
                            setTempReportItemConfig("freeform", "content", result);
                            const firstItem = findFirstItem(result);
                            setSelectedItemId(firstItem?.id);
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
            );
          }}
        </Show>
      </FrameRightResizable>
    </EditorWrapper>
  );
}
