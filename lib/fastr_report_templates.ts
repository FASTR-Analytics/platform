// =============================================================================
// FASTR Markdown report TEMPLATES: the Google-Docs-style starting points a
// new report is offered right after its theme is picked (theme_modal.tsx →
// template_modal.tsx). A template is a skeleton BODY (real blocks, headings
// in the right order, placeholder guidance in each slot) plus a brief for
// the AI, which is told which template the report was started from so it
// writes to that shape (build_system_prompt.ts, getEditingReportInstructions).
//
// Placeholders are muted role marks, `[What goes here]{.muted}`: they read as
// grey guidance on the page, a user types over them, and the AI brief names
// the convention so the model replaces every one. Attribute values (a
// cover's kicker, a stat's label) cannot carry a mark, so they use square
// brackets alone.
//
// The chosen template is stored on the report's config (`template`); like the
// theme it is metadata, never part of the body.
// =============================================================================

import { t3 } from "./translate/mod.ts";

export const FASTR_REPORT_TEMPLATES = [
  "policy_brief",
  "long_form",
  "empty",
] as const;
export type FastrReportTemplate = (typeof FASTR_REPORT_TEMPLATES)[number];

export function isFastrReportTemplate(v: unknown): v is FastrReportTemplate {
  return typeof v === "string" &&
    (FASTR_REPORT_TEMPLATES as readonly string[]).includes(v);
}

// A placeholder line: grey guidance the user or the AI replaces.
function ph(text: string): string {
  return `[${text.replace(/[\[\]]/g, "")}]{.muted}`;
}

// Attribute text: quotes would end the value.
function attr(text: string): string {
  return text.replace(/"/g, "'");
}

function policyBriefBody(title: string): string {
  return [
    `:::cover{tone=ink layout=poster kicker="${
      attr(t3({ en: "[Organisation · Month Year]", fr: "[Organisation · Mois Année]", pt: "[Organização · Mês Ano]" }))
    }" sub="${
      attr(t3({
        en: "[One sentence: the decision this brief asks for]",
        fr: "[Une phrase : la décision que demande cette note]",
        pt: "[Uma frase: a decisão que esta nota pede]",
      }))
    }"}`,
    `# ${title}`,
    ":::",
    "",
    `## ${t3({ en: "Key messages", fr: "Messages clés", pt: "Mensagens-chave" })}`,
    "",
    ph(t3({
      en: "Two or three sentences a minister could repeat: what is happening, why it matters, and what should be done.",
      fr: "Deux ou trois phrases qu'un ministre pourrait répéter : ce qui se passe, pourquoi c'est important et ce qu'il faut faire.",
      pt: "Duas ou três frases que um ministro poderia repetir: o que está a acontecer, porque importa e o que deve ser feito.",
    })),
    "",
    ":::tiles{cols=3}",
    `:::stat{value="00%" label="${attr(t3({ en: "[Headline indicator]", fr: "[Indicateur principal]", pt: "[Indicador principal]" }))}" delta="${attr(t3({ en: "[change]", fr: "[évolution]", pt: "[variação]" }))}" dir=up tone=accent}`,
    `:::stat{value="00%" label="${attr(t3({ en: "[Second indicator]", fr: "[Deuxième indicateur]", pt: "[Segundo indicador]" }))}" delta="${attr(t3({ en: "[change]", fr: "[évolution]", pt: "[variação]" }))}" dir=down}`,
    `:::stat{value="00" label="${attr(t3({ en: "[Third indicator]", fr: "[Troisième indicateur]", pt: "[Terceiro indicador]" }))}" delta="${attr(t3({ en: "[change]", fr: "[évolution]", pt: "[variação]" }))}" dir=flat}`,
    ":::",
    "",
    `## ${t3({ en: "The problem", fr: "Le problème", pt: "O problema" })}`,
    "",
    ph(t3({
      en: "One paragraph: what is going wrong, for whom, and how we know.",
      fr: "Un paragraphe : ce qui ne va pas, pour qui, et comment on le sait.",
      pt: "Um parágrafo: o que está a correr mal, para quem, e como sabemos.",
    })),
    "",
    ph(t3({
      en: "A second paragraph on the scale and the trend. Insert the one figure that shows it after this paragraph.",
      fr: "Un second paragraphe sur l'ampleur et la tendance. Insérez après lui la figure qui le montre.",
      pt: "Um segundo parágrafo sobre a dimensão e a tendência. Insira depois dele a figura que o mostra.",
    })),
    "",
    `## ${t3({ en: "What the evidence shows", fr: "Ce que montrent les données", pt: "O que mostram os dados" })}`,
    "",
    ph(t3({
      en: "Two or three short paragraphs of findings, each opening with its conclusion.",
      fr: "Deux ou trois courts paragraphes de constats, chacun commençant par sa conclusion.",
      pt: "Dois ou três parágrafos curtos de constatações, cada um a começar pela sua conclusão.",
    })),
    "",
    `:::callout{kind=warning title="${attr(t3({ en: "Caveat", fr: "Réserve", pt: "Ressalva" }))}"}`,
    ph(t3({
      en: "The one limitation in the data a reader must keep in mind.",
      fr: "La limite des données que le lecteur doit garder en tête.",
      pt: "A limitação dos dados que o leitor deve ter presente.",
    })),
    ":::",
    "",
    `## ${t3({ en: "Policy options", fr: "Options politiques", pt: "Opções de política" })}`,
    "",
    ":::columns{cols=2}",
    ":::col{tone=paper}",
    `### ${t3({ en: "[Option A]", fr: "[Option A]", pt: "[Opção A]" })}`,
    ph(t3({
      en: "What it involves, what it costs, and what it would achieve.",
      fr: "Ce qu'elle implique, ce qu'elle coûte et ce qu'elle permettrait.",
      pt: "O que implica, quanto custa e o que alcançaria.",
    })),
    ":::",
    ":::col{tone=accent}",
    `### ${t3({ en: "[Option B]", fr: "[Option B]", pt: "[Opção B]" })}`,
    ph(t3({
      en: "What it involves, what it costs, and what it would achieve.",
      fr: "Ce qu'elle implique, ce qu'elle coûte et ce qu'elle permettrait.",
      pt: "O que implica, quanto custa e o que alcançaria.",
    })),
    ":::",
    ":::",
    "",
    `## ${t3({ en: "Recommendations", fr: "Recommandations", pt: "Recomendações" })}`,
    "",
    ":::steps",
    ph(t3({
      en: "The first action, who takes it, and by when.",
      fr: "La première action, qui la mène et pour quand.",
      pt: "A primeira ação, quem a executa e até quando.",
    })),
    "",
    ph(t3({ en: "The second action.", fr: "La deuxième action.", pt: "A segunda ação." })),
    "",
    ph(t3({ en: "The third action.", fr: "La troisième action.", pt: "A terceira ação." })),
    ":::",
    "",
    ":::band{tone=ink}",
    ph(t3({
      en: "Prepared by … · Data source … · Contact …",
      fr: "Préparé par … · Source des données … · Contact …",
      pt: "Preparado por … · Fonte dos dados … · Contacto …",
    })),
    ":::",
    "",
  ].join("\n");
}

function longFormBody(title: string): string {
  const para = (en: string, fr: string, pt: string) => [ph(t3({ en, fr, pt })), ""];
  return [
    ":::report{numbering=sections}",
    "",
    `:::cover{tone=ink layout=frame fill=page kicker="${
      attr(t3({ en: "[Organisation · Year]", fr: "[Organisation · Année]", pt: "[Organização · Ano]" }))
    }" sub="${
      attr(t3({
        en: "[What this report covers, the period, and who it is for]",
        fr: "[Ce que couvre ce rapport, la période, et à qui il s'adresse]",
        pt: "[O que este relatório cobre, o período, e a quem se destina]",
      }))
    }"}`,
    `# ${title}`,
    ":::",
    "",
    `:::contents{title="${attr(t3({ en: "Contents", fr: "Sommaire", pt: "Índice" }))}" depth=3}`,
    "",
    `## ${t3({ en: "Executive summary", fr: "Résumé", pt: "Sumário executivo" })}`,
    "",
    ...para(
      "The whole report in one paragraph: the question, the answer, and what should happen next.",
      "Tout le rapport en un paragraphe : la question, la réponse et la suite à donner.",
      "Todo o relatório num parágrafo: a pergunta, a resposta e o que deve acontecer a seguir.",
    ),
    ":::tiles{cols=3}",
    `:::stat{value="00%" label="${attr(t3({ en: "[Headline indicator]", fr: "[Indicateur principal]", pt: "[Indicador principal]" }))}" delta="${attr(t3({ en: "[change]", fr: "[évolution]", pt: "[variação]" }))}" dir=up tone=accent}`,
    `:::stat{value="00%" label="${attr(t3({ en: "[Second indicator]", fr: "[Deuxième indicateur]", pt: "[Segundo indicador]" }))}" delta="${attr(t3({ en: "[change]", fr: "[évolution]", pt: "[variação]" }))}" dir=flat}`,
    `:::stat{value="00" label="${attr(t3({ en: "[Third indicator]", fr: "[Troisième indicateur]", pt: "[Terceiro indicador]" }))}" delta="${attr(t3({ en: "[change]", fr: "[évolution]", pt: "[variação]" }))}" dir=down}`,
    ":::",
    "",
    ...para(
      "The three or four findings the rest of the report supports, one sentence each.",
      "Les trois ou quatre constats que le reste du rapport étaye, une phrase chacun.",
      "As três ou quatro constatações que o resto do relatório sustenta, uma frase cada.",
    ),
    `## ${t3({ en: "Introduction", fr: "Introduction", pt: "Introdução" })}`,
    "",
    `### ${t3({ en: "Background", fr: "Contexte", pt: "Contexto" })}`,
    "",
    ...para(
      "Why this report, why now: the programme, the policy, or the question behind it.",
      "Pourquoi ce rapport, pourquoi maintenant : le programme, la politique ou la question qui le motive.",
      "Porquê este relatório, porquê agora: o programa, a política ou a pergunta por detrás dele.",
    ),
    `### ${t3({ en: "Objectives", fr: "Objectifs", pt: "Objetivos" })}`,
    "",
    ...para(
      "What the report sets out to answer, as two or three questions.",
      "Ce que le rapport cherche à établir, en deux ou trois questions.",
      "O que o relatório pretende responder, em duas ou três perguntas.",
    ),
    `## ${t3({ en: "Methods and data", fr: "Méthodes et données", pt: "Métodos e dados" })}`,
    "",
    ...para(
      "The data sources, the period, the indicators, and how they were calculated.",
      "Les sources de données, la période, les indicateurs et leur mode de calcul.",
      "As fontes de dados, o período, os indicadores e como foram calculados.",
    ),
    `:::callout{kind=note title="${attr(t3({ en: "Data quality", fr: "Qualité des données", pt: "Qualidade dos dados" }))}"}`,
    ph(t3({
      en: "Reporting completeness, known gaps, and how they affect what follows.",
      fr: "La complétude des rapports, les lacunes connues et leur effet sur la suite.",
      pt: "A completude dos relatórios, as lacunas conhecidas e o seu efeito no que se segue.",
    })),
    ":::",
    "",
    `## ${t3({ en: "Findings", fr: "Résultats", pt: "Resultados" })}`,
    "",
    `### ${t3({ en: "[First finding]", fr: "[Premier constat]", pt: "[Primeira constatação]" })}`,
    "",
    ...para(
      "Open with the conclusion, then the evidence. Insert the figure that shows it after this paragraph, and a paragraph that reads it.",
      "Commencez par la conclusion, puis les données. Insérez après ce paragraphe la figure qui le montre, et un paragraphe qui la lit.",
      "Comece pela conclusão e depois os dados. Insira depois deste parágrafo a figura que o mostra, e um parágrafo que a lê.",
    ),
    `### ${t3({ en: "[Second finding]", fr: "[Deuxième constat]", pt: "[Segunda constatação]" })}`,
    "",
    ...para(
      "The same shape: conclusion, evidence, figure, reading.",
      "La même forme : conclusion, données, figure, lecture.",
      "A mesma forma: conclusão, dados, figura, leitura.",
    ),
    `### ${t3({ en: "[Third finding]", fr: "[Troisième constat]", pt: "[Terceira constatação]" })}`,
    "",
    ...para(
      "The same shape: conclusion, evidence, figure, reading.",
      "La même forme : conclusion, données, figure, lecture.",
      "A mesma forma: conclusão, dados, figura, leitura.",
    ),
    ":::band{tone=ink}",
    ph(t3({
      en: "The turning point of the argument, in one or two sentences.",
      fr: "Le tournant de l'argument, en une ou deux phrases.",
      pt: "O ponto de viragem do argumento, em uma ou duas frases.",
    })),
    ":::",
    "",
    `## ${t3({ en: "Discussion", fr: "Discussion", pt: "Discussão" })}`,
    "",
    ...para(
      "What the findings mean together, what they do not show, and how they compare with other sources.",
      "Ce que les constats signifient ensemble, ce qu'ils ne montrent pas et comment ils se comparent à d'autres sources.",
      "O que as constatações significam em conjunto, o que não mostram e como se comparam com outras fontes.",
    ),
    `## ${t3({ en: "Recommendations", fr: "Recommandations", pt: "Recomendações" })}`,
    "",
    ":::steps",
    ph(t3({
      en: "The first recommendation, who acts on it, and by when.",
      fr: "La première recommandation, qui la met en œuvre et pour quand.",
      pt: "A primeira recomendação, quem a executa e até quando.",
    })),
    "",
    ph(t3({ en: "The second recommendation.", fr: "La deuxième recommandation.", pt: "A segunda recomendação." })),
    "",
    ph(t3({ en: "The third recommendation.", fr: "La troisième recommandation.", pt: "A terceira recomendação." })),
    ":::",
    "",
    `## ${t3({ en: "Annex", fr: "Annexe", pt: "Anexo" })}`,
    "",
    `### ${t3({ en: "Indicator definitions", fr: "Définitions des indicateurs", pt: "Definições dos indicadores" })}`,
    "",
    ...para(
      "Each indicator's numerator, denominator and source.",
      "Le numérateur, le dénominateur et la source de chaque indicateur.",
      "O numerador, o denominador e a fonte de cada indicador.",
    ),
    ":::band{tone=ink}",
    ph(t3({
      en: "Prepared by … · Data through … · Contact …",
      fr: "Préparé par … · Données jusqu'à … · Contact …",
      pt: "Preparado por … · Dados até … · Contacto …",
    })),
    ":::",
    "",
  ].join("\n");
}

// The body a template starts a report with, titled with the report's label.
// Empty is a blank page, as in a word processor.
export function fastrReportTemplateBody(
  template: FastrReportTemplate,
  title: string,
): string {
  const t = title.replace(/\n/g, " ").trim() || "Report";
  switch (template) {
    case "policy_brief":
      return policyBriefBody(t);
    case "long_form":
      return longFormBody(t);
    case "empty":
      return "";
  }
}

// English, model-facing: what the template MEANS, so the AI writes to its
// shape. Rides the editing view's instructions (getEditingReportInstructions).
export function fastrReportTemplateBrief(template: FastrReportTemplate): string {
  const placeholders =
    "The template's skeleton marks every slot with placeholder guidance written as a muted mark, `[What goes here]{.muted}` (and square-bracketed text in attributes such as a cover's kicker or a stat's label). When you write into the report, REPLACE every placeholder with real content and drop the mark; never leave one behind, and never copy the guidance text itself into the report.";
  switch (template) {
    case "policy_brief":
      return `## This report is a POLICY BRIEF

The user started this report from the **Policy brief** template. A policy brief is written for a decision-maker who will read the first page and perhaps nothing else: it is SHORT (two to four printed pages), leads with its conclusions, and ends in actions.

Keep the template's shape and section order unless the user asks otherwise:
- \`:::cover\` (poster layout, a band at the head of page 1, never \`fill=page\`): the kicker is the organisation and date, the sub states the decision the brief asks for.
- **Key messages**: two or three sentences a minister could repeat, then a \`:::tiles\` row of three \`:::stat\` blocks, the most important one \`tone=accent\`.
- **The problem**: what is going wrong, for whom, how we know; one figure at most.
- **What the evidence shows**: short findings, each opening with its conclusion, and the one caveat in a \`:::callout{kind=warning}\`.
- **Policy options**: a \`:::columns\` pair comparing the options side by side.
- **Recommendations**: a \`:::steps\` block, each step an action with an owner and a date.
- A closing \`:::band{tone=ink}\` colophon: author, data source, contact.

No \`:::contents\` and no \`numbering=sections\`: a brief is not a book. Write in plain, direct sentences; cut anything the decision does not need.

${placeholders}`;
    case "long_form":
      return `## This report is a LONG-FORM REPORT

The user started this report from the **Long-form report** template: a formal, complete document (typically ten pages or more) that a technical reader works through and cites.

Keep the template's shape and section order unless the user asks otherwise:
- \`:::report{numbering=sections}\` stays on the first line: sections are \`##\` headings (numbered 1., 2.) and subsections \`###\` (1.1, 1.2).
- \`:::cover{fill=page}\`: a title page of its own; then the \`:::contents\` line.
- **Executive summary**: the whole report in a paragraph, a \`:::tiles\` row of three \`:::stat\` blocks, then the key findings.
- **Introduction** (background, objectives), **Methods and data** with a data-quality \`:::callout\`, **Findings** as one \`###\` subsection per finding (conclusion, evidence, a figure, a paragraph that reads it), **Discussion**, **Recommendations** as \`:::steps\`, and an **Annex** for definitions.
- Mark the turning point of the argument with a \`:::band\`, and close with a \`:::band{tone=ink}\` colophon.

Add, split or rename findings subsections to fit the evidence; keep every section a page or so, as the page budget in the format guide describes.

${placeholders}`;
    case "empty":
      return `## This report started from a blank page

The user chose the **Empty** template: there is no prescribed structure. Follow the user's lead on what the report is; when you write the whole report, compose it with the format's blocks as the format guide describes.`;
  }
}
