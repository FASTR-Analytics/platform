import { trackStore } from "@solid-primitives/deep";
import {
  getStartingReportItemPlaceholder,
  ProjectDetail,
  ReportDetail,
  ReportItem,
  ReportItemConfig,
  ReportItemContentItem,
  getTextRenderingOptions,
  t2,
  T,
} from "lib";
import {
  APIResponseWithData,
  createItemNode,
  findFirstItem,
  PageHolder,
  FrameRightResizable,
  LayoutNode,
  PageHitTarget,
  PageInputs,
  showMenu,
  StateHolder,
  StateHolderWrapper,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  getEditorWrapper,
  timActionButton,
} from "panther";
import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getPageInputsFromReportItem } from "~/generate_report/mod";
import { serverActions } from "~/server_actions";
import { getReportItemFromCacheOrFetch } from "~/state/ri_cache";
import { buildLayoutContextMenu } from "~/components/layout_editor/build_context_menu";
import { convertReportItemType } from "./utils/convert_report_item_type";
import {
  fitWithin,
  setHeaderOrContent,
  setPolicyHeaderOrContent,
} from "~/state/ui";
import { ReportItemEditorPanel } from "./report_item_editor_panel";

type ReportItemEditorProps = {
  projectDetail: ProjectDetail;
  reportId: string;
  reportItemId: string;
  reportItemIndex: number;
  reportDetail: ReportDetail;
  setSelectedItemId: (id: string | undefined) => void;
};

export function ReportItemEditor(p: ReportItemEditorProps) {
  const pds = useProjectDirtyStates();

  // const reportItem = timQuery(() => {
  //   const lastUpdated = lus[p.reportItemId] ?? "unknown";
  //   return getReportItemFromCacheOrFetch(
  //     p.projectId,
  //     p.reportId,
  //     p.reportItemId,
  //     lastUpdated,
  //   );
  // }, "Loading report item...");

  // const reportDetail = timQuery(() => {
  //   const lastUpdated = lus[p.reportId] ?? "unknown";
  //   return getReportDetailFromCacheOrFetch(
  //     p.projectId,
  //     p.reportId,
  //     lastUpdated,
  //   );
  // }, "Loading report detail...");

  // createEffect(() => {
  //   // Automatically update reportDetail on change (but do not update for item)
  //   const _lastUpdated = lus[p.reportId] ?? "unknown";
  //   reportDetail.silentFetch();
  // });

  // return (
  //   <Show
  //     when={pds.lastUpdated.report_items[p.reportItemId] ?? "unknwon"}
  //     keyed
  //   >
  //     {(keyedLastUpate) => {
  const [reportItem, setReportItem] = createSignal<StateHolder<ReportItem>>({
    status: "loading",
    msg: t2(T.FRENCH_UI_STRINGS.loading_report_item),
  });

  async function silentFetchReportItem() {
    const res = await getReportItemFromCacheOrFetch(
      p.projectDetail.id,
      p.reportId,
      p.reportItemId,
    );
    if (res.success === false) {
      setReportItem({ status: "error", err: res.err });
      return;
    }
    setReportItem({ status: "ready", data: res.data });
  }

  onMount(() => {
    pds.lastUpdated.report_items[p.reportItemId];
    silentFetchReportItem();
  });

  return (
    <StateHolderWrapper
      state={reportItem()}
    // onErrorButton={{
    //   label: "Go back",
    //   // onClick: () => p.close(undefined),
    // }}
    >
      {(keyedReportItem) => {
        return (
          <ReportItemEditorInner
            projectDetail={p.projectDetail}
            reportDetail={p.reportDetail}
            reportItem={keyedReportItem}
            silentFetchReportItem={silentFetchReportItem}
            reportItemIndex={p.reportItemIndex}
            setSelectedItemId={p.setSelectedItemId}
          />
        );
      }}
    </StateHolderWrapper>
  );
  //     }}
  //   </Show>
  // );
}

type Props = {
  projectDetail: ProjectDetail;
  reportDetail: ReportDetail;
  reportItem: ReportItem;
  silentFetchReportItem: () => Promise<void>;
  reportItemIndex: number;
  setSelectedItemId: (id: string | undefined) => void;
};

export function ReportItemEditorInner(p: Props) {
  const pds = useProjectDirtyStates();
  // const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  let initialLastUpdated =
    pds.lastUpdated.report_items[p.reportItem.id] ?? "unknown";
  let isCurrentlySaving = false;

  const { openEditor, EditorWrapper } = getEditorWrapper();

  // Temp state

  const [tempReportItemConfig, setTempReportItemConfig] =
    createStore<ReportItemConfig>(structuredClone(p.reportItem.config));

  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: t2(T.FRENCH_UI_STRINGS.loading_1),
  });

  // Sub-state updater

  let lastPageInputsRef: any = null;
  async function attemptGetPageInputs(reportItemConfig: ReportItemConfig) {
    const res = await getPageInputsFromReportItem(
      p.projectDetail.id,
      p.reportDetail.reportType,
      p.reportDetail.config,
      reportItemConfig,
      p.reportItemIndex,
    );
    if (res.success === false) {
      console.log("getPageInputsFromReportItem FAILED:", res.err);
      setPageInputs({ status: "error", err: res.err });
      return;
    }
    console.log("pageInputs.content:", JSON.stringify((res.data as any).content, null, 2));
    console.log("Same reference as last?", res.data === lastPageInputsRef);
    lastPageInputsRef = res.data;
    setPageInputs({ status: "ready", data: res.data });
  }

  // Save status: 'saved' | 'pending' | 'saving' | 'error'
  const [saveStatus, setSaveStatus] = createSignal<
    "saved" | "pending" | "saving" | "error"
  >("saved");
  const [saveError, setSaveError] = createSignal<string>("");
  // Initialize to the root content item ID
  const getFirstItemId = (node: LayoutNode<ReportItemContentItem>): string => {
    if (node.type === "item") return node.id;
    if (node.children.length > 0) return getFirstItemId(node.children[0]);
    return node.id;
  };
  const initContent = p.reportItem.config.freeform.content;
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>(
    getFirstItemId(initContent)
  );
  let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    const unwrappedtempReportItemConfig = unwrap(tempReportItemConfig);
    attemptGetPageInputs(unwrappedtempReportItemConfig);
  });

  onCleanup(() => {
    // Clear any pending auto-save when component unmounts
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
  });

  // Auto-save with debouncing
  async function debouncedAutoSave() {
    // Clear any existing timeout
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    // Set status to pending immediately for UI feedback
    setSaveStatus("pending");
    setSaveError("");

    // Debounce the actual save by 2 seconds
    autoSaveTimeout = setTimeout(async () => {
      // Only auto-save if not already saving
      if (!isCurrentlySaving) {
        setSaveStatus("saving");
        const result = await saveFunc();
        if (result.success) {
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
          setSaveError(result.err || "Failed to save");
        }
      }
    }, 2000);
  }

  let firstRunConfigChange = true;
  createEffect(() => {
    trackStore(tempReportItemConfig);
    if (firstRunConfigChange) {
      firstRunConfigChange = false;
      return;
    }
    console.log("Re-running slide inputs because of config change");
    const unwrappedtempReportItemConfig = unwrap(tempReportItemConfig);
    console.log("Effect sees content:", JSON.stringify(unwrappedtempReportItemConfig.freeform.content, null, 2));
    attemptGetPageInputs(unwrappedtempReportItemConfig);

    // Trigger auto-save instead of just setting needsSave
    debouncedAutoSave();
  });

  // Handle when someone else saves

  createEffect(() => {
    const lastUpdated =
      pds.lastUpdated.report_items[p.reportItem.id] ?? "unknown";
    const _saveStatus = untrack(() => saveStatus());
    if (!isCurrentlySaving && lastUpdated !== initialLastUpdated) {
      // Cancel any pending auto-save since there's a conflict
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
      }

      // Always refresh to get the latest version
      // With auto-save, we don't want to interrupt the user's flow with dialogs
      p.silentFetchReportItem();

      // If user had unsaved changes, they're now lost but that's the nature of auto-save
      // The alternative would be to show a non-blocking notification
      if (_saveStatus === "pending") {
        console.warn(
          "Report item was updated by another user, local changes were discarded",
        );
        setSaveStatus("saved"); // Reset status since we're loading fresh data
      }
    }
  });

  // Actions

  async function saveFunc(): Promise<
    APIResponseWithData<{ lastUpdated: string }>
  > {
    isCurrentlySaving = true;
    const unwrappedTempConfig = unwrap(tempReportItemConfig);
    const res = await serverActions.updateReportItemConfig({
      projectId: p.projectDetail.id,
      report_id: p.reportDetail.id,
      item_id: p.reportItem.id,
      config: unwrappedTempConfig,
    });
    if (res.success === false) {
      isCurrentlySaving = false;
      return res;
    }
    // await p.silentFetchReportItem(res.data.lastUpdated);
    // optimisticSetLastUpdated(p.reportItem.id, res.data.lastUpdated);
    initialLastUpdated = res.data.lastUpdated;
    isCurrentlySaving = false;
    return res;
  }

  // const saveAndClose = timActionButton(
  //   () => saveFunc(),
  //   () => p.close(undefined),
  // );

  const save = timActionButton(() => saveFunc());

  return (
    <EditorWrapper>
      <FrameRightResizable
        startingWidth={p.projectDetail.isLocked ? 20 : 400}
        minWidth={p.projectDetail.isLocked ? 20 : 300}
        maxWidth={p.projectDetail.isLocked ? 20 : 800}
        panelChildren={
          <Show when={!p.projectDetail.isLocked}>
            <ReportItemEditorPanel
              projectDetail={p.projectDetail}
              tempReportItemConfig={tempReportItemConfig}
              setTempReportItemConfig={setTempReportItemConfig}
              reportDetail={p.reportDetail}
              save={save}
              saveStatus={saveStatus()}
              saveError={saveError()}
              setSelectedItemId={p.setSelectedItemId}
              reportItemId={p.reportItem.id}
              openEditor={openEditor}
              selectedItemId={selectedItemId()}
              setSelectedItemId2={setSelectedItemId}
            />
          </Show>
        }
      >
        <Show when={pageInputs().status === "ready" ? (pageInputs() as { status: "ready"; data: PageInputs }).data : undefined} keyed>
          {(keyedPageInputs) => {
            console.log("Show re-rendering, creating NEW PageHolder, content type:", (keyedPageInputs as any).content?.type);
            return (
              <div class="ui-pad bg-[pink] h-full w-full overflow-auto">
                <PageHolder
                  pageInputs={keyedPageInputs}
                  onMeasured={(m) => {
                    console.log("mLayout type:", (m as any).mLayout?.type, "children:", (m as any).mLayout?.children?.length);
                    if ((m as any).mLayout && 'children' in (m as any).mLayout) {
                      (m as any).mLayout?.children?.forEach((child: any, i: number) => {
                        const coords = child.rpd || child.rcd;
                        console.log(`  child ${i}: type=${child.type}, id=${child.id}, y=${coords?.y()}, h=${coords?.h()}`);
                      });
                    }
                  }}
                  canvasElementId="SLIDE_CANVAS_FOR_DOWNLOADING"
                  fixedCanvasH={
                    p.reportDetail.reportType === "policy_brief"
                      ? Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 297) / 210)
                      : Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16)
                  }
                  fitWithin={fitWithin() === "fit-within"}
                  textRenderingOptions={getTextRenderingOptions()}
                  hoverStyle={{
                    fillColor: "rgba(0, 112, 243, 0.1)",
                    strokeColor: "rgba(0, 112, 243, 0.8)",
                    strokeWidth: 2,
                    showLayoutBoundaries: true,
                  }}
                  onClick={(target: PageHitTarget) => {
                    if (target.type === "layoutItem") {
                      if (p.reportDetail.reportType === "policy_brief") {
                        setPolicyHeaderOrContent("content");
                      } else {
                        setHeaderOrContent("content");
                      }
                      setSelectedItemId(target.node.id);
                    } else if (
                      target.type === "headerText" ||
                      target.type === "footerText"
                    ) {
                      if (p.reportDetail.reportType === "policy_brief") {
                        setPolicyHeaderOrContent("policyHeaderFooter");
                      } else {
                        setHeaderOrContent("slideHeader");
                      }
                    }
                  }}
                  onContextMenu={(e, target) => {
                    if (target.type !== "layoutItem") return;

                    const items = buildLayoutContextMenu(
                      tempReportItemConfig.freeform.content,
                      target.node.id,
                      {
                        onLayoutChange: (newLayout) => {
                          setTempReportItemConfig("freeform", "content", newLayout);
                        },
                        onSelectionChange: setSelectedItemId,
                        createNewBlock: () =>
                          createItemNode<ReportItemContentItem>(getStartingReportItemPlaceholder()),

                        getBlockType: (item) => item.type,
                        isFigureWithSource: (item) =>
                          item.type === "figure" && !!item.presentationObjectInReportInfo,

                        onConvertToText: (itemId) => {
                          const newLayout = convertReportItemType(
                            tempReportItemConfig.freeform.content,
                            itemId,
                            "text"
                          );
                          setTempReportItemConfig("freeform", "content", newLayout);
                        },

                        onConvertToFigure: (itemId) => {
                          const newLayout = convertReportItemType(
                            tempReportItemConfig.freeform.content,
                            itemId,
                            "figure"
                          );
                          setTempReportItemConfig("freeform", "content", newLayout);
                        },

                        onConvertToImage: (itemId) => {
                          const newLayout = convertReportItemType(
                            tempReportItemConfig.freeform.content,
                            itemId,
                            "image"
                          );
                          setTempReportItemConfig("freeform", "content", newLayout);
                        },
                      },
                    );

                    showMenu({ x: e.clientX, y: e.clientY, items });
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
