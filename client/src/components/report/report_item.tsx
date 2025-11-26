import { trackStore } from "@solid-primitives/deep";
import {
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
  FrameRightResizable,
  PageHolder,
  PageInputs,
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
import { fitWithin } from "~/state/ui";
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
            />
          </Show>
        }
      >
        <StateHolderWrapper state={pageInputs()}>
          {(keyedPageInputs) => {
            return (
              <div class="ui-pad bg-base-300 h-full w-full overflow-auto">
                <PageHolder
                  pageInputs={keyedPageInputs}
                  canvasElementId="SLIDE_CANVAS_FOR_DOWNLOADING"
                  fixedCanvasH={
                    p.reportDetail.reportType === "policy_brief"
                      ? Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 297) / 210)
                      : Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16)
                  }
                  fitWithin={fitWithin() === "fit-within"}
                  textRenderingOptions={getTextRenderingOptions()}
                />
              </div>
            );
          }}
        </StateHolderWrapper>
      </FrameRightResizable>
    </EditorWrapper>
  );
}
