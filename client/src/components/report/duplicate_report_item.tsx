import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  Select,
  timActionForm,
} from "panther";
import { Show, createSignal } from "solid-js";
import { ProjectDetail, ReportType, isFrench } from "lib";
import { serverActions } from "~/server_actions";

export function DuplicateReportItem(
  p: AlertComponentProps<
    {
      projectDetail: ProjectDetail;
      reportId: string;
      reportItemId: string;
      reportType: ReportType;
    },
    {
      newReportItemId: string;
      thisOrOtherReport: "this_report" | "other_report";
    }
  >,
) {
  // Temp state

  const [tempNextOrEnd, setTempNextOrEnd] = createSignal<"next" | "end">(
    "next",
  );
  const [tempNewReportId, setTempNewReportId] = createSignal<
    string | "this_report"
  >("this_report");

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      return serverActions.duplicateReportItem({
        projectId: p.projectDetail.id,
        report_id: p.reportId,
        item_id: p.reportItemId,
        nextOrEnd: tempNextOrEnd(),
        newReportId: tempNewReportId(),
      });
    },
    (res) => {
      p.close({
        newReportItemId: res!.newReportItemId,
        thisOrOtherReport:
          tempNewReportId() === "this_report" ? "this_report" : "other_report",
      });
    },
  );

  return (
    <AlertFormHolder
      formId="duplicate-report-item"
      header={`Duplicate ${p.reportType === "slide_deck" ? "slide" : "page"}`}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <Select
        label={
          p.reportType === "slide_deck"
            ? "Which report should this slide be duplicated into?"
            : "Which report should this page be duplicated into?"
        }
        options={[
          { value: "this_report", label: "This report" },
          ...p.projectDetail.reports
            .filter(
              (report) =>
                report.id !== p.reportId && report.reportType === p.reportType,
            )
            .map((report) => {
              return {
                value: report.id,
                label: report.label,
              };
            }),
        ]}
        value={tempNewReportId()}
        onChange={setTempNewReportId}
        fullWidth
      />
      <Show when={tempNewReportId() === "this_report"}>
        <RadioGroup
          options={[
            {
              value: "next",
              label: `Add immediately after this ${p.reportType === "slide_deck" ? "slide" : "page"}`,
            },
            { value: "end", label: "Add to end" },
          ]}
          value={tempNextOrEnd()}
          onChange={setTempNextOrEnd}
        />
      </Show>
    </AlertFormHolder>
  );
}
