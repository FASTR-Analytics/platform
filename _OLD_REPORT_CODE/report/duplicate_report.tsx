import { ReportDetail, ReportType } from "lib";
import { instanceState } from "~/state/instance/t1_store";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  Select,
  timActionForm,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function DuplicateReport(
  p: AlertComponentProps<
    {
      projectId: string;
      reportId: string;
      currentReportLabel: string;
      reportType: ReportType | undefined;
    },
    {
      newReportId: string;
      newReportItemIds: string[];
      lastUpdated: string;
      newProjectId: string | "this_project";
      postAction: "stay_here" | "go_to_new_report";
    }
  >,
) {
  // Temp state

  const [tempLabel, setTempLabel] = createSignal<string>(p.currentReportLabel);
  const [tempNewProjectId, setTempNewProjectId] = createSignal<
    string | "this_project"
  >("this_project");
  const [postAction, setPostAction] = createSignal<
    "stay_here" | "go_to_new_report"
  >("go_to_new_report");

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const label = tempLabel().trim();
      if (!label) {
        return {
          success: false,
          err: "You must enter a name",
        };
      }

      return serverActions.duplicateReport({
        projectId: p.projectId,
        report_id: p.reportId,
        label: tempLabel(),
        newProjectId: tempNewProjectId(),
      });
    },
    (res) => {
      if (res) {
        p.close({
          newReportId: res.newReportId,
          newReportItemIds: res.newReportItemIds,
          lastUpdated: res.lastUpdated,
          newProjectId: tempNewProjectId(),
          postAction: postAction(),
        });
      }
    },
  );

  const otherProjects = instanceState.projects.filter(
    (project) => project.id !== p.projectId,
  );

  return (
    <AlertFormHolder
      formId="duplicate-report"
      header={`Duplicate ${p.reportType === "slide_deck" ? "slide deck" : "policy brief"}`}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <Input
        label="New report name"
        value={tempLabel()}
        onChange={setTempLabel}
        fullWidth
        autoFocus
      />
      <Select
        label="Which project should this report be duplicated into?"
        options={[
          { value: "this_project", label: "This project" },
          ...otherProjects.map((project) => {
            return {
              value: project.id,
              label: project.label,
            };
          }),
        ]}
        fullWidth
        value={tempNewProjectId()}
        onChange={setTempNewProjectId}
      />
      <RadioGroup
        label="What do you want to do after duplicating?"
        options={[
          { value: "go_to_new_report", label: "Go to new report" },
          { value: "stay_here", label: "Stay on this report" },
        ]}
        value={postAction()}
        onChange={setPostAction}
      />
    </AlertFormHolder>
  );
}
