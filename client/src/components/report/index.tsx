import { InstanceDetail, ProjectDetail, ReportDetail, t, t2, T } from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  RadioGroup,
  StateHolder,
  StateHolderWrapper,
  getEditorWrapper,
  openComponent,
  timActionButton,
  useSmartNavigate,
} from "panther";
import { For, Show, createEffect, createSignal } from "solid-js";
import { unwrap } from "solid-js/store";
import { ReportItemMiniDisplay } from "~/components/ReportItemMiniDisplay";
import { DownloadReport } from "./download_report";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
  useProjectDirtyStates,
} from "~/components/project_runner/mod";
import { serverActions } from "~/server_actions";
import { getReportDetailFromCacheOrFetch } from "~/state/ri_cache";
import { fitWithin, setFitWithin } from "~/state/ui";
import { DuplicateReport } from "./duplicate_report";
import { ReportItemEditor } from "./report_item";
import { ReportSettings } from "./report_settings";
import { ReorderPages } from "./reorder_pages";

type Props = {
  isGlobalAdmin: boolean;
  projectDetail: ProjectDetail;
  reportId: string;
  backToProject: (withUpdate: boolean) => Promise<void>;
  instanceDetail: InstanceDetail;
};

export function Report(p: Props) {
  // Utils
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();
  const smartNavigate = useSmartNavigate();

  let needToUpdateProject = false;

  const {
    openEditor: openEditorForSettings,
    EditorWrapper: EditorWrapperForSettings,
  } = getEditorWrapper();

  // UI state

  const [selectedReportItemId, setSelectedReportItemId] = createSignal<
    string | undefined
  >(undefined);

  // Query state

  const pds = useProjectDirtyStates();

  const [reportDetail, setReportDetail] = createSignal<
    StateHolder<ReportDetail>
  >({ status: "loading", msg: t2(T.FRENCH_UI_STRINGS.loading_report) });

  async function silentGetReportDetail() {
    const res = await getReportDetailFromCacheOrFetch(
      p.projectDetail.id,
      p.reportId,
    );
    if (res.success === false) {
      setReportDetail({ status: "error", err: res.err });
      return;
    }
    setSelectedReportItemId((prev) => {
      if (prev && res.data.itemIdsInOrder.includes(prev)) {
        return prev;
      }
      return res.data.itemIdsInOrder.at(0);
    });
    setReportDetail({ status: "ready", data: res.data });
  }

  createEffect(() => {
    // Track pds.lastUpdated.reports[p.reportId] for reactivity
    // Cache reads PDS internally, so we don't pass it
    pds.lastUpdated.reports[p.reportId];
    silentGetReportDetail();
  });

  // Actions

  async function download() {
    const unwrappedPDS = unwrap(pds);
    const _res = await openComponent({
      element: DownloadReport,
      props: {
        projectId: p.projectDetail.id,
        reportId: p.reportId,
        unwrappedPDS,
      },
    });
  }

  async function openReportSettings() {
    const rd = reportDetail();
    if (rd.status !== "ready") {
      return;
    }
    needToUpdateProject = true;
    const res = await openEditorForSettings({
      element: ReportSettings,
      props: {
        projectId: p.projectDetail.id,
        reportId: p.reportId,
        reportType: rd.data.reportType,
        reportConfig: rd.data.config,
        silentGetReportDetail: silentGetReportDetail,
      },
    });
    if (res === "AFTER_DELETE_BACK_TO_PROJECT_WITH_PROJECT_UPDATE") {
      p.backToProject(true);
    }
  }

  const addSlide = timActionButton(async () => {
    const res = await serverActions.createReportItem({
      projectId: p.projectDetail.id,
      report_id: p.reportId,
    });
    if (res.success === false) {
      return res;
    }
    // Update PDS - triggers createEffect which starts fetch
    optimisticSetLastUpdated("reports", p.reportId, res.data.lastUpdated);
    // Wait for fetch to complete (deduped with effect's fetch)
    await silentGetReportDetail();
    setSelectedReportItemId(res.data.newReportItemId);
    return res;
  });

  async function duplicate() {
    const res = await openComponent({
      element: DuplicateReport,
      props: {
        projectId: p.projectDetail.id,
        reportId: p.reportId,
        currentReportLabel: reportLabel(),
        reportType: reportType(),
        instanceDetail: p.instanceDetail,
      },
    });
    if (res === undefined) {
      return;
    }
    if (res.newProjectId === "this_project") {
      optimisticSetLastUpdated("reports", res.newReportId, res.lastUpdated);
      for (const reportItemId of res.newReportItemIds) {
        optimisticSetLastUpdated("report_items", reportItemId, res.lastUpdated);
      }
      optimisticSetProjectLastUpdated(res.lastUpdated);
    }
    if (res.postAction === "go_to_new_report") {
      if (res.newProjectId === "this_project") {
        smartNavigate(
          `/?p=${p.projectDetail.id}&r=${res.newReportId}`,
          "force-refresh-if-same-keys",
        );
      } else {
        smartNavigate(
          `/?p=${res.newProjectId}&r=${res.newReportId}`,
          "force-refresh-if-same-keys",
        );
      }
    }
  }

  // Helpers

  const reportLabel = () => {
    const rd = reportDetail();
    if (rd.status === "ready") {
      return rd.data.config.label;
    }
    return "...";
  };

  const reportType = () => {
    const rd = reportDetail();
    if (rd.status === "ready") {
      return rd.data.reportType;
    }
    return undefined;
  };

  return (
    <EditorWrapperForSettings>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap border-base-200 bg-base-100 flex h-full w-full items-center border-b">
            <Button
              iconName="chevronLeft"
              onClick={() => p.backToProject(needToUpdateProject)}
            />
            <div class="font-700 flex-1 truncate text-xl">
              <span class="font-400">{reportLabel()}</span>
            </div>
            <div class="ui-gap-sm flex items-center">
              <Show when={reportType() === "policy_brief"}>
                {/* <div class="pr-4"> */}
                <RadioGroup
                  options={[
                    { value: "fit-within", label: t2(T.FRENCH_UI_STRINGS.fitwithin) },
                    { value: "fit-width", label: t2(T.FRENCH_UI_STRINGS.maxwidth) },
                  ]}
                  value={fitWithin()}
                  onChange={setFitWithin}
                  horizontal
                />
                {/* </div> */}
              </Show>
              <Show when={!p.projectDetail.isLocked}>
                <Button onClick={duplicate} iconName="copy" outline>
                  {t2(T.FRENCH_UI_STRINGS.duplicate_report)}
                </Button>
                <Button
                  onClick={openReportSettings}
                  iconName="settings"
                  outline
                >
                  {t2(T.FRENCH_UI_STRINGS.report_settings)}
                </Button>
              </Show>
              <Button onClick={download} iconName="download">
                {t2(T.FRENCH_UI_STRINGS.download)}
              </Button>
            </div>
          </div>
        }
      >
        <StateHolderWrapper
          state={reportDetail()}
          onErrorButton={{
            label: "Go back",
            onClick: () => p.backToProject(needToUpdateProject),
          }}
        >
          {(keyedReportDetail) => {
            async function attemptMoveReportItem() {
              await openEditorForSettings({
                element: ReorderPages,
                props: {
                  projectId: p.projectDetail.id,
                  reportId: p.reportId,
                  itemIdsInOrder: keyedReportDetail.itemIdsInOrder,
                  reportType: keyedReportDetail.reportType,
                  silentGetReportDetail: silentGetReportDetail,
                },
              });
            }
            return (
              <FrameLeft
                panelChildren={
                  <div class="flex h-full w-48 flex-none flex-col">
                    <Show when={!p.projectDetail.isLocked}>
                      <div class="ui-pad ui-gap-sm border-base-200 flex flex-none flex-col border-b">
                        <Button
                          onClick={addSlide.click}
                          state={addSlide.state()}
                          iconName="plus"
                          fullWidth
                        >
                          {t2(T.FRENCH_UI_STRINGS.add_1)}{" "}
                          {keyedReportDetail.reportType === "slide_deck"
                            ? t2(T.FRENCH_UI_STRINGS.slide)
                            : t2(T.FRENCH_UI_STRINGS.page)}
                        </Button>
                        <Show
                          when={keyedReportDetail.itemIdsInOrder.length > 1}
                        >
                          <Button
                            onClick={attemptMoveReportItem}
                            iconName="move"
                            fullWidth
                          >
                            {keyedReportDetail.reportType === "slide_deck"
                              ? t2(T.Reports.organize_slides)
                              : t("Organize pages")}
                          </Button>
                        </Show>
                      </div>
                    </Show>
                    <div class="ui-pad h-0 flex-1 overflow-auto">
                      <For
                        each={keyedReportDetail.itemIdsInOrder}
                        fallback={
                          <div class="text-neutral text-sm">
                            {keyedReportDetail.reportType === "slide_deck"
                              ? t2(T.FRENCH_UI_STRINGS.no_slides)
                              : t("No pages")}
                          </div>
                        }
                      >
                        {(reportItemId, i_reportItemId) => {
                          return (
                            <div class="ui-gap-sm mb-2 flex">
                              <div class="w-[2ch] flex-none text-right text-xs">
                                {i_reportItemId() + 1}
                              </div>
                              <div
                                class="border-base-300 hover:border-primary data-[selected=true]:border-primary flex-1 cursor-pointer border-2"
                                data-selected={
                                  selectedReportItemId() === reportItemId
                                }
                                onClick={() =>
                                  setSelectedReportItemId(reportItemId)
                                }
                              >
                                <ReportItemMiniDisplay
                                  projectId={p.projectDetail.id}
                                  reportId={p.reportId}
                                  reportItemId={reportItemId}
                                  reportType={keyedReportDetail.reportType}
                                  scalePixelResolution={0.1}
                                />
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                }
              >
                <div class="bg-base-300 h-full w-full">
                  <Show
                    when={keyedReportDetail.itemIdsInOrder.find(
                      (item) => item === selectedReportItemId(),
                    )}
                    keyed
                  >
                    {(keyedReportItemId) => {
                      return (
                        <ReportItemEditor
                          projectDetail={p.projectDetail}
                          reportId={p.reportId}
                          reportItemId={keyedReportItemId}
                          reportItemIndex={keyedReportDetail.itemIdsInOrder.indexOf(
                            keyedReportItemId,
                          )}
                          reportDetail={keyedReportDetail}
                          setSelectedItemId={setSelectedReportItemId}
                        />
                      );
                    }}
                  </Show>
                </div>
              </FrameLeft>
            );
          }}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapperForSettings>
  );
}
