import {
  type ReportFolder,
  type ReportFormat,
  type ReportHtmlStyle,
  t3,
  TC,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  Select,
  createFormAction,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

// Format is fixed at creation (no later switch), so the choice lives here.
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
    { projectId: string; folders: ReportFolder[]; currentFolderId: string | null },
    { newReportId: string }
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>("");
  const [tempFolderId, setTempFolderId] = createSignal<string>(
    p.currentFolderId ?? "_none",
  );
  const [tempFormat, setTempFormat] = createSignal<ReportFormat>("markdown");
  const [tempHtmlStyle, setTempHtmlStyle] = createSignal<ReportHtmlStyle>("default");

  const folderOptions = () => [
    { value: "_none", label: t3(TC.general) },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!tempLabel().trim()) {
        return { success: false, err: t3({ en: "You must enter a label", fr: "Vous devez saisir un libellé", pt: "Tem de introduzir um rótulo" }) };
      }
      const folderId = tempFolderId() === "_none" ? null : tempFolderId();
      return await serverActions.createReport({
        projectId: p.projectId,
        label: tempLabel().trim(),
        folderId,
        format: tempFormat(),
        htmlStyle: tempFormat() === "html" ? tempHtmlStyle() : undefined,
      });
    },
    (data) => p.close({ newReportId: data.reportId }),
  );

  return (
    <AlertFormHolder
      formId="add-report"
      header={t3({ en: "Create report", fr: "Créer un rapport", pt: "Criar relatório" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
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
                  en: "custom layout and styling; exports to HTML and print/PDF",
                  fr: "mise en page et styles personnalisés ; export HTML et impression/PDF",
                  pt: "layout e estilos personalizados; exporta para HTML e impressão/PDF",
                }),
              ),
            },
          ]}
        />
        <Show when={tempFormat() === "html"}>
          <RadioGroup<ReportHtmlStyle>
            label={t3({ en: "Style", fr: "Style", pt: "Estilo" })}
            value={tempHtmlStyle()}
            onChange={setTempHtmlStyle}
            options={[
              {
                value: "default",
                label: formatOption(
                  t3({ en: "Platform default", fr: "Style par défaut", pt: "Estilo padrão" }),
                  t3({
                    en: "plain white page; the AI keeps styling minimal",
                    fr: "page blanche sobre ; l'IA garde une mise en forme minimale",
                    pt: "página branca simples; a IA mantém a formatação mínima",
                  }),
                ),
              },
              {
                value: "editorial",
                label: formatOption(
                  t3({ en: "Editorial", fr: "Éditorial", pt: "Editorial" }),
                  t3({
                    en: "magazine-style layout — fonts, cards, badges; the AI designs the report",
                    fr: "mise en page magazine — polices, cartes, badges ; l'IA conçoit le rapport",
                    pt: "layout de revista — tipos de letra, cartões, distintivos; a IA desenha o relatório",
                  }),
                ),
              },
            ]}
          />
        </Show>
      </div>
    </AlertFormHolder>
  );
}
