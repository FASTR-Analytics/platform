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

// Step 1 of the create-report wizard. Markdown creates directly from here; the
// two styled formats (HTML, FASTR Markdown) turn the button into "Next" and
// close with a draft — the parent (project_reports.tsx) then opens
// ReportStylePicker, which owns the create (panther has one alert slot, so the
// picker cannot stack on top of this modal). `initial` re-seeds the form when
// the user comes Back from the picker.

export type AddReportFormResult =
  | { created: { newReportId: string } }
  | {
    next: {
      label: string;
      folderId: string | null;
      format: Exclude<ReportFormat, "markdown">;
    };
  };

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
      initial?: {
        label: string;
        folderId: string | null;
        format: Exclude<ReportFormat, "markdown">;
      };
    },
    AddReportFormResult
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>(p.initial?.label ?? "");
  const [tempFolderId, setTempFolderId] = createSignal<string>(
    p.initial ? (p.initial.folderId ?? "_none") : (p.currentFolderId ?? "_none"),
  );
  const [tempFormat, setTempFormat] = createSignal<ReportFormat>(
    // Markdown stays the default — adding a format changes nothing for anyone
    // who was already creating reports. (One line to flip if that changes.)
    p.initial?.format ?? "markdown",
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
    const format = tempFormat();
    if (format !== "markdown") {
      // Style/theme comes next — nothing is created yet.
      p.close({ next: { label, folderId, format } });
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
        tempFormat() === "markdown"
          ? undefined
          : t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })
      }
      saveButtonIconName={
        tempFormat() === "markdown" ? undefined : "chevronRight"
      }
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
              value: "fastr",
              label: formatOption(
                t3({ en: "FASTR Markdown", fr: "Markdown FASTR", pt: "Markdown FASTR" }),
                t3({
                  en: "simple text plus callouts, tiles and columns, in a designed theme you pick next",
                  fr: "texte simple plus encadrés, tuiles et colonnes, dans un thème choisi à l'étape suivante",
                  pt: "texto simples mais destaques, mosaicos e colunas, num tema escolhido a seguir",
                }),
              ),
            },
            {
              value: "html",
              label: formatOption(
                t3({ en: "HTML", fr: "HTML", pt: "HTML" }),
                t3({
                  en: "written by the AI; the most freedom, the least hand-editable",
                  fr: "rédigé par l'IA ; le plus de liberté, le moins modifiable à la main",
                  pt: "escrito pela IA; mais liberdade, menos editável à mão",
                }),
              ),
            },
          ]}
        />
      </div>
    </AlertFormHolder>
  );
}
