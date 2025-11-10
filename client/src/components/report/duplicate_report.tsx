import { InstanceDetail, ReportDetail, ReportType, isFrench, t2, T } from "lib";
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
import { t } from "lib";

export function DuplicateReport(
  p: AlertComponentProps<
    {
      projectId: string;
      reportId: string;
      currentReportLabel: string;
      reportType: ReportType | undefined;
      instanceDetail: InstanceDetail;
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
          err: t("You must enter a name"),
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

  const otherProjects = p.instanceDetail.projects.filter(
    (project) => project.id !== p.projectId,
  );

  return (
    <AlertFormHolder
      formId="duplicate-report"
      header={`${t2(T.FRENCH_UI_STRINGS.duplicate)} ${p.reportType === "slide_deck" ? t("slide deck") : t("policy brief")}`}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <Input
        label={t("New report name")}
        value={tempLabel()}
        onChange={setTempLabel}
        fullWidth
        autoFocus
      />
      <Select
        label={t2(T.FRENCH_UI_STRINGS.which_project_should_this_repo)}
        options={[
          { value: "this_project", label: t2(T.FRENCH_UI_STRINGS.this_project) },
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
        label={t2(T.FRENCH_UI_STRINGS.what_do_you_want_to_do_after_d)}
        options={[
          { value: "go_to_new_report", label: t2(T.FRENCH_UI_STRINGS.go_to_new_report) },
          { value: "stay_here", label: t2(T.FRENCH_UI_STRINGS.stay_on_this_report) },
        ]}
        value={postAction()}
        onChange={setPostAction}
      />
    </AlertFormHolder>
  );
}
