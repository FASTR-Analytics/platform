import { t3, TC } from "lib";
import {
  EditorComponentProps,
  ModalContainer,
  RadioGroup,
  StateHolderFormError,
  toPct0,
  toPct1,
} from "panther";
import { createSignal, Show } from "solid-js";
import { exportReportAsPagedPdf } from "~/exports/export_report_as_paged_pdf";
import { exportFastrReportAsWord } from "~/exports/export_report_as_fastr_word";
import { exportReportAsHtml } from "~/exports/export_report_as_html";

type ExportKind = "pdf" | "word" | "html";

export function DownloadReport(
  p: EditorComponentProps<
    {
      productId: string;
    },
    undefined
  >,
) {
  const [pct, setPct] = createSignal<number>(0);
  const [err, setErr] = createSignal<string>("");
  const [exportFormat, setExportFormat] = createSignal<ExportKind>("pdf");

  function progress(pct: number) {
    setPct(pct);
  }

  async function attemptExport() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));
    const kind = exportFormat();

    const res = kind === "word"
      ? await exportFastrReportAsWord(p.productId, progress)
      : kind === "html"
      ? await exportReportAsHtml(p.productId, progress)
      : await exportReportAsPagedPdf(p.productId, progress);
    if (res.success === false) {
      setErr(res.err);
      setPct(0);
      return;
    }
    p.close(undefined);
  }

  const pdfOption = {
    value: "pdf" as const,
    label: t3({ en: "PDF", fr: "PDF", pt: "PDF" }),
  };
  const htmlOption = {
    value: "html" as const,
    label: t3({
      en: "HTML file (.html)",
      fr: "Fichier HTML (.html)",
      pt: "Ficheiro HTML (.html)",
    }),
  };
  const wordOption = {
    value: "word" as const,
    label: t3({ en: "Word (.docx)", fr: "Word (.docx)", pt: "Word (.docx)" }),
  };
  // The paged PDF (the pages the editor shows, printed by the server), a
  // plain Word file built in the browser, and the .html file.
  const options = [pdfOption, wordOption, htmlOption];

  return (
    <ModalContainer
      title={t3({
        en: "Download report",
        fr: "Télécharger le rapport",
        pt: "Transferir relatório",
      })}
      width="sm"
      onCancel={pct() > 0 ? undefined : () => p.close(undefined)}
      actions={[
        ...(pct() > 0 ? [] : [
          {
            label: t3(TC.download),
            onClick: attemptExport,
            iconName: "download" as const,
          },
        ]),
      ]}
    >
      <div class="ui-spy-sm">
        <RadioGroup<ExportKind>
          options={options}
          value={exportFormat()}
          onChange={setExportFormat}
        />
        <div class="text-base-content-muted text-xs">
          {t3({
            en:
              "The PDF has exactly the pages the editor shows. The Word file is a plain, editable document: headings, text, tables and visualizations are kept, while covers, bands, tiles, cards and stats become the text they hold (Word asks to update fields on opening when the report has a contents page, and a coloured page ground prints only with Word's 'Print background colours' on). The HTML file is self-contained (visualizations embedded as images) and reads as one continuous page.",
            fr:
              "Le PDF contient exactement les pages affichées dans l'éditeur. Le fichier Word est un document simple et modifiable : les titres, le texte, les tableaux et les visualisations sont conservés, tandis que les couvertures, bandeaux, tuiles, cartes et chiffres deviennent le texte qu'ils contiennent (Word propose de mettre à jour les champs à l'ouverture si le rapport a une table des matières, et un fond de page coloré ne s'imprime qu'avec l'option « Imprimer les couleurs d'arrière-plan » de Word). Le fichier HTML est autonome (visualisations intégrées en images) et se lit comme une seule page continue.",
            pt:
              "O PDF tem exatamente as páginas que o editor mostra. O ficheiro Word é um documento simples e editável: os títulos, o texto, as tabelas e as visualizações são mantidos, enquanto as capas, faixas, mosaicos, cartões e indicadores passam a ser o texto que contêm (o Word pede para atualizar os campos ao abrir quando o relatório tem um índice, e um fundo de página colorido só é impresso com a opção 'Imprimir cores de fundo' do Word). O ficheiro HTML é autónomo (visualizações incorporadas como imagens) e lê-se como uma única página contínua.",
          })}
        </div>
      </div>
      <Show when={pct() > 0}>
        <div class="ui-spy-sm">
          <div class="bg-base-300 h-8 w-full">
            <div
              class="bg-primary h-full"
              style={{ width: toPct1(pct()) }}
            >
            </div>
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
