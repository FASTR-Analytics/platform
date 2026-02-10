import { ReportType, get_REPORT_TYPE_SELECT_OPTIONS, isFrench, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function AddReportForm(
  p: AlertComponentProps<
    { projectId: string },
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
        return { success: false, err: t3({ en: "You must enter a label", fr: "Vous devez saisir un libellé" }) };
      }
      return await serverActions.createReport({
        projectId: p.projectId,
        label: tempLabel().trim(),
        reportType: tempReportType(),
      });
    },
    (data) => p.close({ newReportId: data.newReportId }),
  );

  return (
    <AlertFormHolder
      formId="add-report"
      header={t3({ en: "Create new report", fr: "Créer un nouveau rapport" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <Input
        label={t3({ en: "Report name", fr: "Nom du rapport" })}
        value={tempLabel()}
        onChange={setTempLabel}
        fullWidth
        autoFocus
      />
      <RadioGroup
        label={t3({ en: "Report type", fr: "Type de rapport" })}
        options={get_REPORT_TYPE_SELECT_OPTIONS()}
        value={tempReportType()}
        onChange={setTempReportType}
      />
    </AlertFormHolder>
  );
}
