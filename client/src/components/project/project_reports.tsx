import { useNavigate } from "@solidjs/router";
import {
  ProjectDetail,
  ReportDetail,
  ReportItem,
  ReportSummary,
  get_REPORT_TYPE_MAP,
  isFrench,
  parseJsonOrThrow,
  t2,
  T,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openAlert,
  openComponent,
} from "panther";
import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { AddReportForm } from "./add_report";
import { t } from "lib";
import type Uppy from "@uppy/core";
import { createUppyInstance, cleanupUppy } from "~/upload/uppy_file_upload";
import { serverActions } from "~/server_actions";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
} from "~/components/project_runner/mod";

type Props = {
  projectDetail: ProjectDetail;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectReports(p: Props) {
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();
  const navigate = useNavigate();

  const [searchText, setSearchText] = createSignal<string>("");
  const [reportListing, setReportListing] = createSignal<ReportSummary[]>(
    p.projectDetail.reports,
  );

  createEffect(() => {
    updateReportListing(searchText());
  });

  async function updateReportListing(searchText: string) {
    await new Promise((res) => setTimeout(res, 0));
    const searchTextLowerCase = searchText.toLowerCase();
    const newReports =
      searchText.length >= 3
        ? p.projectDetail.reports.filter((reportSummary) =>
            reportSummary.label.toLowerCase().includes(searchTextLowerCase),
          )
        : p.projectDetail.reports;
    setReportListing(newReports);
  }

  async function attemptAddReport() {
    const res = await openComponent({
      element: AddReportForm,
      props: {
        projectId: p.projectDetail.id,
      },
    });
    if (res === undefined) {
      return;
    }
    navigate(`/?p=${p.projectDetail.id}&r=${res.newReportId}`);
  }

  async function attemptImportReport(file: File) {
    let data: { report: ReportDetail; reportItems: ReportItem[] } | undefined =
      undefined;
    try {
      data = parseJsonOrThrow(await file.text());
    } catch {
      await openAlert({
        text: "Could not process file",
        intent: "danger",
      });
      return;
    }
    if (data === undefined) {
      await openAlert({
        text: "Could not process file",
        intent: "danger",
      });
      return;
    }
    const res = await serverActions.restoreReport({
      projectId: p.projectDetail.id,
      report: data.report,
      reportItems: data.reportItems,
    });
    if (res.success === false) {
      await openAlert({
        text: res.err,
        intent: "danger",
      });
      return;
    }
    optimisticSetLastUpdated(
      "reports",
      res.data.newReportId,
      res.data.lastUpdated,
    );
    for (const reportItemId of res.data.newReportItemIds) {
      optimisticSetLastUpdated(
        "report_items",
        reportItemId,
        res.data.lastUpdated,
      );
    }
    optimisticSetProjectLastUpdated(res.data.lastUpdated);
    navigate(`/?p=${p.projectDetail.id}&r=${res.data.newReportId}`);
  }

  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
      autoProceed: true,
      onModalClosed: () => {
        // Just clears, no fetch needed
      },
    });

    // Handle file-added separately since it's unique to this component
    uppy.on("file-added", (file) => {
      if (!file) {
        return;
      }
      uppy?.clear();
      attemptImportReport(file.data as File);
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t2(T.FRENCH_UI_STRINGS.reports)}
          searchText={searchText()}
          setSearchText={setSearchText}
          french={isFrench()}
        >
          <Show
            when={
              !p.projectDetail.isLocked &&
              p.projectDetail.projectModules.length > 0
            }
          >
            <div class="ui-gap-sm flex items-center">
              <Button id="select-file-button" iconName="upload" outline>
                {t2(T.Reports.upload_report)}
              </Button>
              <Button onClick={attemptAddReport} iconName="plus">
                {t2(T.FRENCH_UI_STRINGS.sav)}
              </Button>
            </div>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={p.projectDetail.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t("You need to enable at least one module to create reports")}
          </div>
        }
      >
        <div class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start">
          <For
            each={reportListing()}
            fallback={
              <div class="text-neutral text-sm">
                {searchText().length >= 3
                  ? t2(T.FRENCH_UI_STRINGS.no_matching_reports)
                  : t2(T.FRENCH_UI_STRINGS.no_reports)}
              </div>
            }
          >
            {(report) => {
              return (
                <div
                  class="ui-pad ui-hoverable border-base-300 min-h-[150px] rounded border"
                  onClick={() => {
                    navigate(`/?p=${p.projectDetail.id}&r=${report.id}`);
                  }}
                >
                  <div class="ui-spy-sm col-span-1">
                    <div class="font-700">{report.label}</div>
                    <div class="text-sm">
                      {get_REPORT_TYPE_MAP()[report.reportType]}
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </FrameTop>
  );
}
