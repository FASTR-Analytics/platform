import { trackStore } from "@solid-primitives/deep";
import {
  getStartingReportItemPlaceholder,
  ProjectDetail,
  ReportDetail,
  ReportItem,
  ReportItemConfig,
  getTextRenderingOptions,
  t,
  t2,
  T,
} from "lib";
import {
  APIResponseWithData,
  EditablePageHolder,
  FrameRightResizable,
  MenuItem,
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
import { createStore, unwrap } from "solid-js/store";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getPageInputsFromReportItem } from "~/generate_report/mod";
import { serverActions } from "~/server_actions";
import { getReportItemFromCacheOrFetch } from "~/state/ri_cache";
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

  async function attemptGetPageInputs(reportItemConfig: ReportItemConfig) {
    const res = await getPageInputsFromReportItem(
      p.projectDetail.id,
      p.reportDetail.reportType,
      p.reportDetail.config,
      reportItemConfig,
      p.reportItemIndex,
    );
    if (res.success === false) {
      setPageInputs({ status: "error", err: res.err });
      return;
    }
    setPageInputs({ status: "ready", data: res.data });
  }

  // Save status: 'saved' | 'pending' | 'saving' | 'error'
  const [saveStatus, setSaveStatus] = createSignal<
    "saved" | "pending" | "saving" | "error"
  >("saved");
  const [saveError, setSaveError] = createSignal<string>("");
  const [selectedRowCol, setSelectedRowCol] = createSignal<number[]>([0, 0]);
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
              selectedRowCol={selectedRowCol()}
              setSelectedRowCol={setSelectedRowCol}
            />
          </Show>
        }
      >
        <StateHolderWrapper state={pageInputs()}>
          {(keyedPageInputs) => {
            return (
              <div class="ui-pad bg-base-300 h-full w-full overflow-auto">
                <EditablePageHolder
                  pageInputs={keyedPageInputs}
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
                  }}
                  onClick={(target: PageHitTarget) => {
                    if (target.type === "layoutItem") {
                      const parts = target.node.id.split("-");
                      if (parts.length === 3 && parts[0] === "item") {
                        const row = parseInt(parts[1], 10);
                        const col = parseInt(parts[2], 10);
                        if (!isNaN(row) && !isNaN(col)) {
                          if (p.reportDetail.reportType === "policy_brief") {
                            setPolicyHeaderOrContent("content");
                          } else {
                            setHeaderOrContent("content");
                          }
                          setSelectedRowCol([row, col]);
                        }
                      }
                    } else if (
                      target.type === "header" ||
                      target.type === "footer"
                    ) {
                      if (p.reportDetail.reportType === "policy_brief") {
                        setPolicyHeaderOrContent("policyHeaderFooter");
                      } else {
                        setHeaderOrContent("slideHeader");
                      }
                    } else if (target.type === "rowGap") {
                      // Add a new row after the gap, matching the row above
                      const afterRowIndex = target.gap.afterRowIndex;
                      const currentContent = tempReportItemConfig.freeform.content;
                      const numCols = currentContent[afterRowIndex]?.length ?? 1;
                      const newRow = Array.from({ length: numCols }, () =>
                        getStartingReportItemPlaceholder()
                      );
                      const newContent = [
                        ...currentContent.slice(0, afterRowIndex + 1),
                        newRow,
                        ...currentContent.slice(afterRowIndex + 1),
                      ];
                      setTempReportItemConfig("freeform", "content", newContent);
                      setSelectedRowCol([afterRowIndex + 1, 0]);
                    } else if (target.type === "colGap") {
                      // Add a new column after the gap
                      const afterColIndex = target.gap.afterColIndex;
                      const currentContent = tempReportItemConfig.freeform.content;
                      const newContent = currentContent.map((row) => [
                        ...row.slice(0, afterColIndex + 1),
                        getStartingReportItemPlaceholder(),
                        ...row.slice(afterColIndex + 1),
                      ]);
                      setTempReportItemConfig("freeform", "content", newContent);
                      setSelectedRowCol([0, afterColIndex + 1]);
                    }
                  }}
                  onContextMenu={(e, target) => {
                    const currentContent = tempReportItemConfig.freeform.content;
                    const numRows = currentContent.length;
                    const items: MenuItem[] = [];

                    if (target.type === "layoutItem") {
                      const parts = target.node.id.split("-");
                      if (parts.length === 3 && parts[0] === "item") {
                        const rowIdx = parseInt(parts[1], 10);
                        const colIdx = parseInt(parts[2], 10);
                        const numColsInRow = currentContent[rowIdx]?.length ?? 1;

                        items.push({
                          label: "Add row above",
                          icon: "plus",
                          onClick: () => {
                            const numCols = currentContent[rowIdx]?.length ?? 1;
                            const newRow = Array.from({ length: numCols }, () =>
                              getStartingReportItemPlaceholder()
                            );
                            const newContent = [
                              ...currentContent.slice(0, rowIdx),
                              newRow,
                              ...currentContent.slice(rowIdx),
                            ];
                            setTempReportItemConfig("freeform", "content", newContent);
                            setSelectedRowCol([rowIdx, 0]);
                          },
                        });
                        items.push({
                          label: "Add row below",
                          icon: "plus",
                          onClick: () => {
                            const numCols = currentContent[rowIdx]?.length ?? 1;
                            const newRow = Array.from({ length: numCols }, () =>
                              getStartingReportItemPlaceholder()
                            );
                            const newContent = [
                              ...currentContent.slice(0, rowIdx + 1),
                              newRow,
                              ...currentContent.slice(rowIdx + 1),
                            ];
                            setTempReportItemConfig("freeform", "content", newContent);
                            setSelectedRowCol([rowIdx + 1, 0]);
                          },
                        });

                        if (numColsInRow === 1) {
                          items.push({ type: "divider" });
                          items.push({
                            label: "Split into columns",
                            icon: "plus",
                            onClick: () => {
                              const newContent = currentContent.map((row, rIdx) => {
                                if (rIdx === rowIdx) {
                                  return [...row, getStartingReportItemPlaceholder()];
                                }
                                return row;
                              });
                              setTempReportItemConfig("freeform", "content", newContent);
                              setSelectedRowCol([rowIdx, 1]);
                            },
                          });
                        } else {
                          items.push({ type: "divider" });
                          items.push({
                            label: "Split into rows",
                            icon: "plus",
                            onClick: () => {
                              const currentRow = currentContent[rowIdx];
                              const newRows = currentRow.map((cell) => [cell]);
                              const newContent = [
                                ...currentContent.slice(0, rowIdx),
                                ...newRows,
                                ...currentContent.slice(rowIdx + 1),
                              ];
                              setTempReportItemConfig("freeform", "content", newContent);
                              setSelectedRowCol([rowIdx, 0]);
                            },
                          });
                        }

                        if (numRows > 1) {
                          items.push({ type: "divider" });
                          items.push({
                            label: "Delete row",
                            icon: "trash",
                            intent: "danger",
                            onClick: () => {
                              const newContent = currentContent.filter((_, i) => i !== rowIdx);
                              setTempReportItemConfig("freeform", "content", newContent);
                              setSelectedRowCol([Math.max(0, rowIdx - 1), 0]);
                            },
                          });
                        }

                        if (numColsInRow > 1) {
                          if (items[items.length - 1]?.type !== "divider") {
                            items.push({ type: "divider" });
                          }
                          items.push({
                            label: "Delete column",
                            icon: "trash",
                            intent: "danger",
                            onClick: () => {
                              const newContent = currentContent.map((row, rIdx) => {
                                if (rIdx === rowIdx) {
                                  return row.filter((_, cIdx) => cIdx !== colIdx);
                                }
                                return row;
                              });
                              setTempReportItemConfig("freeform", "content", newContent);
                              setSelectedRowCol([rowIdx, Math.max(0, colIdx - 1)]);
                            },
                          });
                        }
                      }
                    } else if (target.type === "rowGap") {
                      const afterRowIndex = target.gap.afterRowIndex;
                      items.push({
                        label: "Add row here",
                        icon: "plus",
                        onClick: () => {
                          const numCols = currentContent[afterRowIndex]?.length ?? 1;
                          const newRow = Array.from({ length: numCols }, () =>
                            getStartingReportItemPlaceholder()
                          );
                          const newContent = [
                            ...currentContent.slice(0, afterRowIndex + 1),
                            newRow,
                            ...currentContent.slice(afterRowIndex + 1),
                          ];
                          setTempReportItemConfig("freeform", "content", newContent);
                          setSelectedRowCol([afterRowIndex + 1, 0]);
                        },
                      });
                    } else if (target.type === "colGap") {
                      const afterColIndex = target.gap.afterColIndex;
                      items.push({
                        label: "Add column here",
                        icon: "plus",
                        onClick: () => {
                          const newContent = currentContent.map((row) => [
                            ...row.slice(0, afterColIndex + 1),
                            getStartingReportItemPlaceholder(),
                            ...row.slice(afterColIndex + 1),
                          ]);
                          setTempReportItemConfig("freeform", "content", newContent);
                          setSelectedRowCol([0, afterColIndex + 1]);
                        },
                      });
                    }

                    if (items.length > 0) {
                      showMenu({
                        x: e.clientX,
                        y: e.clientY,
                        items,
                      });
                    }
                  }}
                />
              </div>
            );
          }}
        </StateHolderWrapper>
      </FrameRightResizable>
    </EditorWrapper>
  );
}
