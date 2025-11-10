import { ReportType, get_REPORT_TYPE_SELECT_OPTIONS, isFrench, t2, T } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { t } from "lib";

export function AddReportForm(
  p: AlertComponentProps<
    { projectId: string; silentRefreshProject: () => Promise<void> },
    { newReportId: string }
  >,
) {
  // Temp state

  const [tempLabel, setTempLabel] = createSignal<string>("");
  const [tempReportType, setTempReportType] =
    createSignal<ReportType>("slide_deck");

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!tempLabel().trim()) {
        return { success: false, err: t("You must enter a label") };
      }
      return await serverActions.createReport({
        projectId: p.projectId,
        label: tempLabel().trim(),
        reportType: tempReportType(),
      });
    },
    p.silentRefreshProject,
    (data) => p.close({ newReportId: data.newReportId }),
  );

  return (
    <AlertFormHolder
      formId="add-report"
      header={t2(T.Reports.create_report)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <Input
        label={t2(T.FRENCH_UI_STRINGS.report_name)}
        value={tempLabel()}
        onChange={setTempLabel}
        fullWidth
        autoFocus
      />
      <RadioGroup
        label={t2(T.Reports.report_type)}
        options={get_REPORT_TYPE_SELECT_OPTIONS()}
        value={tempReportType()}
        onChange={setTempReportType}
      />
    </AlertFormHolder>
  );
}
