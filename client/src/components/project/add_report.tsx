import { type ReportFolder, type ReportFormat, t3, TC } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  Select,
  type StateHolderFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

// Step 1 of the create-report wizard. Markdown creates directly from here; for
// HTML the button becomes "Next" and this closes with a draft — the parent
// (project_reports.tsx) then opens ReportStylePicker, which owns the create
// (style is fixed at creation, and panther has one alert slot, so the picker
// cannot stack on top of this modal). `initial` re-seeds the form when the
// user comes Back from the picker.

export type AddReportFormResult =
  | { created: { newReportId: string } }
  | { next: { label: string; folderId: string | null } };

function formatOption(label: string, caption: string) {
  return (
    <span class="ui-form-text select-none">
      {label}
      <span class="text-base-content-muted"> — {caption}</span>
    </span>
  );
}

export function AddReportForm(
  p: AlertComponentProps<
    {
      projectId: string;
      folders: ReportFolder[];
      currentFolderId: string | null;
      initial?: { label: string; folderId: string | null };
    },
    AddReportFormResult
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>(p.initial?.label ?? "");
  const [tempFolderId, setTempFolderId] = createSignal<string>(
    p.initial ? (p.initial.folderId ?? "_none") : (p.currentFolderId ?? "_none"),
  );
  const [tempFormat, setTempFormat] = createSignal<ReportFormat>(
    p.initial ? "html" : "markdown",
  );
  const [saveState, setSaveState] = createSignal<StateHolderFormAction>({
    status: "ready",
  });

  async function handleSave(e: MouseEvent) {
    e.preventDefault();
    if (saveState().status === "loading") return;
    const label = tempLabel().trim();
    if (!label) {
      setSaveState({
        status: "error",
        err: t3({ en: "You must enter a label", fr: "Vous devez saisir un libellé", pt: "Tem de introduzir um rótulo" }),
      });
      return;
    }
    const folderId = tempFolderId() === "_none" ? null : tempFolderId();
    if (tempFormat() === "html") {
      // Style comes next — nothing is created yet.
      p.close({ next: { label, folderId } });
      return;
    }
    setSaveState({ status: "loading" });
    const res = await serverActions.createReport({
      projectId: p.projectId,
      label,
      folderId,
      format: "markdown",
    });
    if (!res.success) {
      setSaveState({ status: "error", err: res.err });
      return;
    }
    p.close({ created: { newReportId: res.data.reportId } });
  }

  const folderOptions = () => [
    { value: "_none", label: t3(TC.general) },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  return (
    <AlertFormHolder
      formId="add-report"
      header={t3({ en: "Create report", fr: "Créer un rapport", pt: "Criar relatório" })}
      savingState={saveState()}
      saveFunc={handleSave}
      cancelFunc={() => p.close(undefined)}
      saveButtonText={
        tempFormat() === "html"
          ? t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })
          : undefined
      }
      saveButtonIconName={tempFormat() === "html" ? "chevronRight" : undefined}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Report name", fr: "Nom du rapport", pt: "Nome do relatório" })}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <Select
          label={t3(TC.folder)}
          options={folderOptions()}
          value={tempFolderId()}
          onChange={setTempFolderId}
          fullWidth
        />
        <RadioGroup<ReportFormat>
          label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
          value={tempFormat()}
          onChange={setTempFormat}
          options={[
            {
              value: "markdown",
              label: formatOption(
                t3({ en: "Markdown", fr: "Markdown", pt: "Markdown" }),
                t3({
                  en: "simple text formatting; exports to PDF and Word",
                  fr: "mise en forme simple ; export PDF et Word",
                  pt: "formatação simples; exporta para PDF e Word",
                }),
              ),
            },
            {
              value: "html",
              label: formatOption(
                t3({ en: "HTML", fr: "HTML", pt: "HTML" }),
                t3({
                  en: "custom layout and styling; choose a style next",
                  fr: "mise en page et styles personnalisés ; choix du style à l'étape suivante",
                  pt: "layout e estilos personalizados; escolha o estilo a seguir",
                }),
              ),
            },
          ]}
        />
      </div>
    </AlertFormHolder>
  );
}
