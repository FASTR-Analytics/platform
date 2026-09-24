import {
  FASTR_REPORT_TEMPLATES,
  fastrReportTemplateBody,
  type FastrReportTemplate,
  renderFastrMarkdownToHtml,
  t3,
} from "lib";
import { For } from "solid-js";
import { sanitizeReportHtml } from "~/generate_report/mod";
import { fastrTemplateCaption, fastrTemplateLabel } from "./fastr_theme_labels";
import { FastrTemplateMock } from "./fastr_theme_mock";

// Step 2 of starting a report, inside the theme modal (theme_modal.tsx): a
// template gallery, as a word processor offers. Each tile is the template's
// real first page under the look chosen in step 1 (`scopeClass`, a mock
// sheet the modal has mounted). The gallery only picks; the editor writes the
// template's body into the document and stores the choice on the config,
// where the AI reads it.
export function ReportTemplateGallery(p: {
  reportLabel: string;
  scopeClass: string;
  selected: FastrReportTemplate;
  onSelect: (template: FastrReportTemplate) => void;
  // A double-click picks and finishes.
  onPick: (template: FastrReportTemplate) => void;
}) {
  const html = (template: FastrReportTemplate) => {
    const body = fastrReportTemplateBody(template, p.reportLabel);
    return body.length === 0
      ? undefined
      : sanitizeReportHtml(renderFastrMarkdownToHtml(body, { lineAnchors: false }));
  };
  return (
    <div class="ui-spy-sm">
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "A template gives the report its sections and blocks, with grey guidance in each slot to type over. The AI is told which template you chose and writes to its shape.",
          fr: "Un modèle donne au rapport ses sections et ses blocs, avec des indications grises à remplacer dans chaque emplacement. L'IA sait quel modèle vous avez choisi et écrit selon sa forme.",
          pt: "Um modelo dá ao relatório as suas secções e blocos, com indicações a cinzento em cada espaço para substituir. A IA sabe que modelo escolheu e escreve de acordo com a sua forma.",
        })}
      </div>
      <div class="grid grid-cols-3 gap-4">
        <For each={FASTR_REPORT_TEMPLATES}>
          {(template) => (
            <button
              type="button"
              class="ui-focusable flex flex-col rounded-md p-1.5 text-left"
              classList={{
                "ring-primary ring-2": p.selected === template,
                "hover:bg-base-200": p.selected !== template,
              }}
              onClick={() => p.onSelect(template)}
              onDblClick={() => p.onPick(template)}
            >
              <FastrTemplateMock scopeClass={p.scopeClass} html={html(template)} />
              <div class="text-base-content font-700 mt-1.5">
                {fastrTemplateLabel(template)}
              </div>
              <div class="text-base-content-muted text-xs leading-snug">
                {fastrTemplateCaption(template)}
              </div>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
