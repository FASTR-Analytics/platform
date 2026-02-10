import {
  InstanceDetail,
  LongFormReportConfig,
  ProjectDetail,
  ReportDetail,
  t,
  t2,
  T,
} from "lib";
import {
  Button,
  EditorComponentProps,
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
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { unwrap } from "solid-js/store";
import { ReportItemMiniDisplay } from "~/components/ReportItemMiniDisplay";
import { DownloadReport } from "./download_report";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
  useProjectDirtyStates,
} from "~/components/project_runner/mod";
import { useAIProjectContext } from "~/components/project_ai/context";
import { serverActions } from "~/server_actions";
import { getReportDetailFromCacheOrFetch } from "~/state/ri_cache";
import { fitWithin, setFitWithin } from "~/state/ui";
import { DuplicateReport } from "./duplicate_report";
import { ReportItemEditor } from "./report_item";
import { ReportSettings, type ReportSettingsProps } from "./report_settings";
import { ReorderPages } from "./reorder_pages";
import type { AIContext } from "../project_ai/types";

type ReportModalReturn = { deleted?: boolean } | undefined;

type Props = EditorComponentProps<
  {
    isGlobalAdmin: boolean;
    projectDetail: ProjectDetail;
    reportId: string;
    instanceDetail: InstanceDetail;
    returnToContext?: AIContext;
  },
  ReportModalReturn
>;

export function Report(p: Props) {
  // Utils
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();
  const smartNavigate = useSmartNavigate();
  const { setAIContext } = useAIProjectContext();

  function handleClose(result: ReportModalReturn = undefined) {
    p.close(result);
  }

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

  // For long_form and ai_slide_deck reports: track lastUpdated to detect external changes
  // This mirrors the pattern used in visualization/index.tsx
  let initialLastUpdated = pds.lastUpdated.reports[p.reportId] ?? "unknown";
  let isAiManagedReport = false;

  async function silentGetReportDetail() {
    const res = await getReportDetailFromCacheOrFetch(
      p.projectDetail.id,
      p.reportId,
    );
    if (res.success === false) {
      setReportDetail({ status: "error", err: res.err });
      return;
    }
    // isAiManagedReport = res.data.reportType === "long_form";
    // Update our reference after successful fetch
    initialLastUpdated = pds.lastUpdated.reports[p.reportId] ?? "unknown";
    setSelectedReportItemId((prev) => {
      if (prev && res.data.itemIdsInOrder.includes(prev)) {
        return prev;
      }
      return res.data.itemIdsInOrder.at(0);
    });
    setReportDetail({ status: "ready", data: res.data });

    // Set AI context once report data is loaded
    const report = p.projectDetail.reports.find((r) => r.id === p.reportId);
    if (report) {
      // setAIContext({
      //   mode: "editing_report",
      //   reportId: p.reportId,
      //   reportLabel: report.label,
      // });
    }
  }

  onCleanup(() => {
    // setAIContext(p.returnToContext ?? { mode: "viewing_reports" });
  });

  createEffect(() => {
    // Track pds.lastUpdated.reports[p.reportId] for reactivity
    const currentLastUpdated = pds.lastUpdated.reports[p.reportId] ?? "unknown";

    // For AI-managed reports (long_form, ai_slide_deck) that are already loaded, skip refetch on PDS changes
    // since the AI editors manage their own content state
    if (isAiManagedReport && currentLastUpdated !== initialLastUpdated) {
      // PDS changed but we're an AI-managed report - just update our reference, don't refetch
      initialLastUpdated = currentLastUpdated;
      return;
    }

    // Initial load, or non-AI-managed report, or no PDS change - fetch as normal
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
    const res = await openEditorForSettings<
      ReportSettingsProps,
      "AFTER_DELETE"
    >({
      element: ReportSettings,
      props: {
        projectId: p.projectDetail.id,
        config: rd.data.config,
        heading: t2(T.FRENCH_UI_STRINGS.report_settings),
        nameLabel: t2(T.FRENCH_UI_STRINGS.report_name),
        showPageNumbersSuffix:
          rd.data.reportType === "slide_deck"
            ? t2(T.FRENCH_UI_STRINGS.except_on_cover_and_section_sl)
            : undefined,
        saveConfig: (config) =>
          serverActions.updateReportConfig({
            projectId: p.projectDetail.id,
            report_id: p.reportId,
            config,
          }),
        onSaved: () => silentGetReportDetail(),
        deleteAction: {
          confirmText: t("Are you sure you want to delete this report?"),
          itemLabel: rd.data.config.label,
          deleteButtonLabel: t2(T.FRENCH_UI_STRINGS.delete_report),
          onDelete: () =>
            serverActions.deleteReport({
              projectId: p.projectDetail.id,
              report_id: p.reportId,
            }),
        },
      },
    });
    if (res === "AFTER_DELETE") {
      handleClose({ deleted: true });
    }
  }

  const addSlide = timActionButton(async () => {
    const res = await serverActions.createReportItem({
      projectId: p.projectDetail.id,
      report_id: p.reportId,
      afterItemId: selectedReportItemId() ?? "",
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

  // Reactive check for long_form report type
  // const longFormData = () => {
  //   const rd = reportDetail();
  //   if (rd.status === "ready" && rd.data.reportType === "long_form") {
  //     const config = rd.data.config as unknown as LongFormReportConfig;
  //     return { markdown: config.markdown, label: config.label };
  //   }
  //   return undefined;
  // };

  return (
    <Switch>
      {/* <Match when={longFormData()} keyed>
        {(data) => (
          <ProjectAiReport
            instanceDetail={p.instanceDetail}
            projectDetail={p.projectDetail}
            reportId={p.reportId}
            initialMarkdown={data.markdown}
            reportLabel={data.label}
            backToProject={backToProject}
          />
        )}
      </Match> */}
      <Match when={true}>
        <EditorWrapperForSettings>
          <FrameTop
            panelChildren={
              <div class="ui-pad ui-gap border-base-200 bg-base-100 flex h-full w-full items-center border-b">
                <Button iconName="chevronLeft" onClick={() => handleClose()} />
                <div class="font-700 flex-1 truncate text-xl">
                  <span class="font-400">{reportLabel()}</span>
                </div>
                <div class="ui-gap-sm flex items-center">
                  <Show when={reportType() === "policy_brief"}>
                    <RadioGroup
                      options={[
                        {
                          value: "fit-within",
                          label: t2(T.FRENCH_UI_STRINGS.fitwithin),
                        },
                        {
                          value: "fit-width",
                          label: t2(T.FRENCH_UI_STRINGS.maxwidth),
                        },
                      ]}
                      value={fitWithin()}
                      onChange={setFitWithin}
                      horizontal
                    />
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
                onClick: () => handleClose(),
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
      </Match>
    </Switch>
  );
}
