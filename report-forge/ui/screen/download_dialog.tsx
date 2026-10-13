import { createSignal, Show } from "solid-js";
import { t3 } from "../../engine/i18n.ts";
import { FormError, Modal, type ModalProps, RadioGroup } from "../kit/mod.ts";
import {
  buildReportPdf,
  type RenderReportPdf,
  type ReportPageLayout,
} from "../exports/paged_pdf.ts";
import { saveBlob } from "../exports/save.ts";
import {
  buildStandaloneReportHtml,
  type ReportDocument,
  type ReportExportHost,
} from "../exports/standalone_html.ts";
import { buildReportWordBlob } from "../exports/word.ts";

type ExportKind = "pdf" | "word" | "html";

// The Download dialog: the paged PDF (the pages the editor shows, printed by
// the host's renderer, so offered only where there is one), a plain Word
// file built in the browser, and the self-contained .html file. Exports the
// document as it stands in the editor.
export function DownloadDialog(
  p: ModalProps<
    {
      document: () => ReportDocument;
      host: ReportExportHost;
      pageLayout: () => ReportPageLayout | undefined;
      renderPdf: RenderReportPdf | undefined;
    },
    undefined
  >,
) {
  const [pct, setPct] = createSignal<number>(0);
  const [err, setErr] = createSignal<string>("");
  const [exportFormat, setExportFormat] = createSignal<ExportKind>(
    p.renderPdf ? "pdf" : "word",
  );

  async function attemptExport() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));
    const kind = exportFormat();
    const doc = p.document();
    try {
      if (kind === "word") {
        saveBlob(
          await buildReportWordBlob(doc, p.host, setPct),
          `${doc.title}.docx`,
        );
      } else if (kind === "html") {
        const html = await buildStandaloneReportHtml(doc, p.host, setPct);
        saveBlob(
          new Blob([html], { type: "text/html;charset=utf-8" }),
          `${doc.title}.html`,
        );
      } else if (p.renderPdf) {
        saveBlob(
          await buildReportPdf(
            doc,
            p.host,
            p.pageLayout(),
            p.renderPdf,
            setPct,
          ),
          `${doc.title}.pdf`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPct(0);
      return;
    }
    p.close(undefined);
  }

  const options = () => [
    ...(p.renderPdf
      ? [{
        value: "pdf" as const,
        label: t3({ en: "PDF", fr: "PDF", pt: "PDF" }),
      }]
      : []),
    {
      value: "word" as const,
      label: t3({ en: "Word (.docx)", fr: "Word (.docx)", pt: "Word (.docx)" }),
    },
    {
      value: "html" as const,
      label: t3({
        en: "HTML file (.html)",
        fr: "Fichier HTML (.html)",
        pt: "Ficheiro HTML (.html)",
      }),
    },
  ];

  const percent = (digits: number) => `${(pct() * 100).toFixed(digits)}%`;

  return (
    <Modal
      title={t3({
        en: "Download report",
        fr: "Télécharger le rapport",
        pt: "Transferir relatório",
      })}
      width="sm"
      onCancel={pct() > 0 ? undefined : () => p.close(undefined)}
      actions={pct() > 0 ? [] : [
        {
          label: t3({ en: "Download", fr: "Télécharger", pt: "Transferir" }),
          onClick: () => void attemptExport(),
          iconName: "download" as const,
        },
      ]}
    >
      <div class="rf:ui-spy-sm">
        <RadioGroup<ExportKind>
          options={options()}
          value={exportFormat()}
          onChange={setExportFormat}
        />
        <div class="rf:text-base-content-muted rf:text-xs">
          <Show when={p.renderPdf}>
            {t3({
              en: "The PDF has exactly the pages the editor shows. ",
              fr:
                "Le PDF contient exactement les pages affichées dans l'éditeur. ",
              pt: "O PDF tem exatamente as páginas que o editor mostra. ",
            })}
          </Show>
          {t3({
            en:
              "The Word file is a plain, editable document: headings, text, tables and visualizations are kept, while covers, bands, tiles, cards and stats become the text they hold (Word asks to update fields on opening when the report has a contents page, and a coloured page ground prints only with Word's 'Print background colours' on). The HTML file is self-contained (visualizations embedded as images) and reads as one continuous page.",
            fr:
              "Le fichier Word est un document simple et modifiable : les titres, le texte, les tableaux et les visualisations sont conservés, tandis que les couvertures, bandeaux, tuiles, cartes et chiffres deviennent le texte qu'ils contiennent (Word propose de mettre à jour les champs à l'ouverture si le rapport a une table des matières, et un fond de page coloré ne s'imprime qu'avec l'option « Imprimer les couleurs d'arrière-plan » de Word). Le fichier HTML est autonome (visualisations intégrées en images) et se lit comme une seule page continue.",
            pt:
              "O ficheiro Word é um documento simples e editável: os títulos, o texto, as tabelas e as visualizações são mantidos, enquanto as capas, faixas, mosaicos, cartões e indicadores passam a ser o texto que contêm (o Word pede para atualizar os campos ao abrir quando o relatório tem um índice, e um fundo de página colorido só é impresso com a opção 'Imprimir cores de fundo' do Word). O ficheiro HTML é autónomo (visualizações incorporadas como imagens) e lê-se como uma única página contínua.",
          })}
        </div>
      </div>
      <Show when={pct() > 0}>
        <div class="rf:ui-spy-sm">
          <div class="rf:bg-base-300 rf:h-8 rf:w-full">
            <div
              class="rf:bg-primary rf:h-full"
              style={{ width: percent(1) }}
            />
          </div>
          <div class="rf:text-center">{percent(0)}</div>
        </div>
      </Show>
      <Show when={pct() === 0}>
        <FormError error={err() || undefined} />
      </Show>
    </Modal>
  );
}
