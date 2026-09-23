import {
  FASTR_REPORT_TEMPLATES,
  fastrReportTemplateBody,
  type FastrReportTemplate,
  type FastrReportTheme,
  renderFastrMarkdownToHtml,
  type ReportCustomStyle,
  t3,
} from "lib";
import { type AlertComponentProps, ModalContainer } from "panther";
import { createSignal, For } from "solid-js";
import { sanitizeReportHtml } from "~/generate_report/mod";
import { fastrTemplateCaption, fastrTemplateLabel } from "./fastr_theme_labels";
import {
  fastrMockScopeClass,
  FastrTemplateMock,
  FastrThemeMockStyles,
} from "./fastr_theme_mock";

// The second step of starting a report, after its theme (theme_modal.tsx): a
// template gallery, as a word processor offers. Each tile is the template's
// real first page under the look just chosen. The modal only picks; the
// editor writes the template's body into the document (through CodeMirror,
// so collaboration and undo see it) and stores the choice on the config,
// where the AI reads it. Offered only while the body is still the new
// report's seed: a template never overwrites someone's writing.

export type ReportTemplateModalResult = { template: FastrReportTemplate };

type Props = AlertComponentProps<
  {
    reportLabel: string;
    fastrTheme: FastrReportTheme;
    // A custom style repaints the default sheet with its palette.
    customStyle?: Pick<ReportCustomStyle, "id" | "colors">;
  },
  ReportTemplateModalResult
>;

export function ReportTemplateModal(p: Props) {
  const [selected, setSelected] = createSignal<FastrReportTemplate>("policy_brief");
  const scopeClass = fastrMockScopeClass(p.fastrTheme, p.customStyle?.id);
  const html = (template: FastrReportTemplate) => {
    const body = fastrReportTemplateBody(template, p.reportLabel);
    return body.length === 0
      ? undefined
      : sanitizeReportHtml(renderFastrMarkdownToHtml(body, { lineAnchors: false }));
  };

  return (
    <ModalContainer
      width="2xl"
      title={t3({
        en: `Start “${p.reportLabel}” from a template`,
        fr: `Commencer « ${p.reportLabel} » à partir d'un modèle`,
        pt: `Começar “${p.reportLabel}” a partir de um modelo`,
      })}
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Use template", fr: "Utiliser le modèle", pt: "Usar modelo" }),
        onClick: () => p.close({ template: selected() }),
        iconName: "check" as const,
        intent: "success" as const,
      }]}
    >
      <FastrThemeMockStyles customStyles={p.customStyle ? [p.customStyle] : []} />
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
                  "ring-primary ring-2": selected() === template,
                  "hover:bg-base-200": selected() !== template,
                }}
                onClick={() => setSelected(template)}
                onDblClick={() => p.close({ template })}
              >
                <FastrTemplateMock scopeClass={scopeClass} html={html(template)} />
                <div class="text-base-content mt-1.5 text-sm font-semibold">
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
    </ModalContainer>
  );
}
