import {
  InstanceDetail,
  ProjectDetail,
  ReportDetail,
  ReportItem,
  ReportSummary,
  get_REPORT_TYPE_MAP,
  isFrench,
  parseJsonOrThrow,
  t3,
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
import type Uppy from "@uppy/core";
import { createUppyInstance, cleanupUppy } from "~/upload/uppy_file_upload";
import { serverActions } from "~/server_actions";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
  useProjectDetail,
} from "~/components/project_runner/mod";
import { Report } from "../report";
import { useAIProjectContext } from "~/components/project_ai/context";

type Props = {
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

type ExtendedProps = Props & {
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
};

export function ProjectReports(p: ExtendedProps) {
  const projectDetail = useProjectDetail();
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();
  const { aiContext } = useAIProjectContext();

  async function openReport(reportId: string) {
    await p.openProjectEditor({
      element: Report,
      props: {
        reportId,
        projectDetail: projectDetail,
        instanceDetail: p.instanceDetail,
        isGlobalAdmin: p.isGlobalAdmin,
        returnToContext: aiContext(),
      },
    });
  }

  const [searchText, setSearchText] = createSignal<string>("");
  const [reportListing, setReportListing] = createSignal<ReportSummary[]>(
    projectDetail.reports,
  );

  createEffect(() => {
    updateReportListing(searchText());
  });

  async function updateReportListing(searchText: string) {
    await new Promise((res) => setTimeout(res, 0));
    const searchTextLowerCase = searchText.toLowerCase();
    const newReports =
      searchText.length >= 3
        ? projectDetail.reports.filter((reportSummary) =>
          reportSummary.label.toLowerCase().includes(searchTextLowerCase),
        )
        : projectDetail.reports;
    setReportListing(newReports);
  }

  async function attemptAddReport() {
    const res = await openComponent({
      element: AddReportForm,
      props: {
        projectId: projectDetail.id,
      },
    });
    if (res === undefined) {
      return;
    }
    await openReport(res.newReportId);
  }

  async function attemptImportReport(file: File) {
    let data: { report: ReportDetail; reportItems: ReportItem[] } | undefined =
      undefined;
    try {
      data = parseJsonOrThrow(await file.text());
    } catch {
      await openAlert({
        text: t3({ en: "Could not process file", fr: "Impossible de traiter le fichier" }),
        intent: "danger",
      });
      return;
    }
    if (data === undefined) {
      await openAlert({
        text: t3({ en: "Could not process file", fr: "Impossible de traiter le fichier" }),
        intent: "danger",
      });
      return;
    }
    const res = await serverActions.restoreReport({
      projectId: projectDetail.id,
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
    await openReport(res.data.newReportId);
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
          heading={t3({ en: "Reports", fr: "Rapports" })}
          searchText={searchText()}
          setSearchText={setSearchText}
          french={isFrench()}
          class="border-base-300"
        >
          <Show
            when={
              !projectDetail.isLocked &&
              projectDetail.projectModules.length > 0
            }
          >
            <div class="ui-gap-sm flex items-center">
              <Button id="select-file-button" iconName="upload" outline>
                {t3({ en: "Upload report", fr: "Téléverser un rapport" })}
              </Button>
              <Button onClick={attemptAddReport} iconName="plus">
                {t3({ en: "Create report", fr: "Créer un rapport" })}
              </Button>
            </div>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={projectDetail.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t3({ en: "You need to enable at least one module to create reports", fr: "Vous devez activer au moins un module pour créer des rapports" })}
          </div>
        }
      >
        <div class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start">
          <For
            each={reportListing()}
            fallback={
              <div class="text-neutral text-sm">
                {searchText().length >= 3
                  ? t3({ en: "No matching reports", fr: "Aucun rapport correspondant" })
                  : t3({ en: "No reports", fr: "Aucun rapport" })}
              </div>
            }
          >
            {(report) => {
              return (
                <div
                  class="ui-pad ui-hoverable border-base-300 min-h-[150px] rounded border"
                  onClick={() => {
                    openReport(report.id);
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
