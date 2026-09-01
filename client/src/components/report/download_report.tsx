import { type ReportFormat, reportRendersAsHtml, t3, TC } from "lib";
import {
  Button,
  EditorComponentProps,
  ModalContainer,
  RadioGroup,
  StateHolderFormError,
  toPct0,
  toPct1,
} from "panther";
import { Show, createSignal } from "solid-js";
import { exportReportAsPdf } from "~/exports/export_report_as_pdf";
import { exportReportAsWord } from "~/exports/export_report_as_word";
import {
  exportReportAsHtml,
  printReportHtml,
} from "~/exports/export_report_as_html";

type ExportKind = "pdf" | "word" | "html" | "print";

export function DownloadReport(
  p: EditorComponentProps<
    {
      projectId: string;
      reportId: string;
      // Absent ⇒ markdown (PDF / Word). html and fastr both render through the
      // html funnel, so they get the .html / print options instead — panther's
      // markdown IR cannot represent either one's markup.
      format?: ReportFormat;
    },
    undefined
  >,
) {
  const rendersAsHtml = reportRendersAsHtml(p.format ?? "markdown");
  const [pct, setPct] = createSignal<number>(0);
  const [err, setErr] = createSignal<string>("");
  const [exportFormat, setExportFormat] = createSignal<ExportKind>(
    rendersAsHtml ? "html" : "pdf",
  );

  function progress(pct: number) {
    setPct(pct);
  }

  async function attemptExport() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));
    const format = exportFormat();

    const res = format === "word"
      ? await exportReportAsWord(p.projectId, p.reportId, progress)
      : format === "html"
      ? await exportReportAsHtml(p.projectId, p.reportId, progress)
      : format === "print"
      ? await printReportHtml(p.projectId, p.reportId, progress)
      : await exportReportAsPdf(p.projectId, p.reportId, progress);
    if (res.success === false) {
      setErr(res.err);
      setPct(0);
      return;
    }
    p.close(undefined);
  }

  const options = rendersAsHtml
    ? [
      {
        value: "html" as const,
        label: t3({ en: "HTML file (.html)", fr: "Fichier HTML (.html)", pt: "Ficheiro HTML (.html)" }),
      },
      {
        value: "print" as const,
        label: t3({ en: "Print / save as PDF", fr: "Imprimer / enregistrer en PDF", pt: "Imprimir / guardar como PDF" }),
      },
    ]
    : [
      { value: "pdf" as const, label: t3({ en: "PDF", fr: "PDF", pt: "PDF" }) },
      { value: "word" as const, label: t3({ en: "Word (.docx)", fr: "Word (.docx)", pt: "Word (.docx)" }) },
    ];

  return (
    <ModalContainer
      title={t3({ en: "Download report", fr: "Télécharger le rapport", pt: "Transferir relatório" })}
      width="sm"
      leftButtons={
        pct() > 0
          ? undefined
          : // eslint-disable-next-line jsx-key
            [
              <Button
                onClick={attemptExport}
                intent="success"
                iconName="download"
              >
                {t3(TC.download)}
              </Button>,
              <Button
                onClick={() => p.close(undefined)}
                intent="neutral"
                iconName="x"
              >
                {t3(TC.done)}
              </Button>,
            ]
      }
    >
      <div class="ui-spy-sm">
        <RadioGroup<ExportKind>
          options={options}
          value={exportFormat()}
          onChange={setExportFormat}
        />
        <Show when={rendersAsHtml}>
          <div class="text-base-content-muted text-xs">
            {t3({
              en: "The HTML file is self-contained (figures embedded as images). Print opens your browser's print dialog, where you can save as PDF.",
              fr: "Le fichier HTML est autonome (figures intégrées en images). Imprimer ouvre la boîte de dialogue d'impression du navigateur, où vous pouvez enregistrer en PDF.",
              pt: "O ficheiro HTML é autónomo (figuras incorporadas como imagens). Imprimir abre a caixa de diálogo de impressão do navegador, onde pode guardar como PDF.",
            })}
          </div>
        </Show>
      </div>
      <Show when={pct() > 0}>
        <div class="ui-spy-sm">
          <div class="bg-base-300 h-8 w-full">
            <div
              class="bg-primary h-full"
              style={{ width: toPct1(pct()) }}
            ></div>
          </div>
          <div class="text-center">{toPct0(pct())}</div>
        </div>
      </Show>
      <Show when={pct() === 0 && err()}>
        <StateHolderFormError state={{ status: "error", err: err() }} />
      </Show>
    </ModalContainer>
  );
}
