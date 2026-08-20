import { t3 } from "lib";
import { For } from "solid-js";

const ROWS: { syntax: string; label: () => string; labelClass: string }[] = [
  {
    syntax: "<h1>Heading</h1>",
    label: () => t3({ en: "Heading", fr: "Titre", pt: "Título" }),
    labelClass: "font-700 text-sm text-base-content",
  },
  {
    syntax: "<h2>Subheading</h2>",
    label: () => t3({ en: "Subheading", fr: "Sous-titre", pt: "Subtítulo" }),
    labelClass: "font-700 text-base-content",
  },
  {
    syntax: "<p>text</p>",
    label: () => t3({ en: "Paragraph", fr: "Paragraphe", pt: "Parágrafo" }),
    labelClass: "text-base-content",
  },
  {
    syntax: "<strong>bold</strong>",
    label: () => t3({ en: "Bold text", fr: "Texte en gras", pt: "Texto em negrito" }),
    labelClass: "font-700 text-base-content",
  },
  {
    syntax: "<em>italic</em>",
    label: () => t3({ en: "Italic text", fr: "Texte en italique", pt: "Texto em itálico" }),
    labelClass: "italic text-base-content-muted",
  },
  {
    syntax: "<ul><li>item</li></ul>",
    label: () => `• ${t3({ en: "Bulleted list", fr: "Liste à puces", pt: "Lista com marcas" })}`,
    labelClass: "text-base-content-muted",
  },
  {
    syntax: "<table>…</table>",
    label: () => t3({ en: "Table", fr: "Tableau", pt: "Tabela" }),
    labelClass: "text-base-content-muted",
  },
  {
    syntax: "<a href=\"https://…\">text</a>",
    label: () => t3({ en: "Link", fr: "Lien", pt: "Ligação" }),
    labelClass: "text-primary underline",
  },
  {
    syntax: "<style>…</style>",
    label: () => t3({ en: "Your own CSS", fr: "Votre propre CSS", pt: "O seu próprio CSS" }),
    labelClass: "text-base-content-muted",
  },
];

// Compact reference for HTML-format reports (the counterpart of MarkdownGuide):
// plain body markup — no <html>/<head>/<body>; scripts and forms are removed.
export function HtmlGuide() {
  return (
    <div class="ui-spy-sm">
      <div class="text-base-content-muted font-700 text-sm">
        {t3({
          en: "Formatting instructions",
          fr: "Instructions de mise en forme",
          pt: "Instruções de formatação",
        })}
      </div>
      <For each={ROWS}>
        {(row) => (
          <div class="flex items-baseline gap-3">
            <code class="bg-base-200 text-base-content shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
              {row.syntax}
            </code>
            <span class={`text-xs ${row.labelClass}`}>{row.label()}</span>
          </div>
        )}
      </For>
      <div class="text-base-content-muted pt-1 text-xs">
        {t3({
          en: "Write the page body only — no <html>, <head> or <body> tags. Scripts and forms are removed.",
          fr: "Écrivez uniquement le corps de la page — sans balises <html>, <head> ni <body>. Les scripts et formulaires sont supprimés.",
          pt: "Escreva apenas o corpo da página — sem etiquetas <html>, <head> ou <body>. Scripts e formulários são removidos.",
        })}
      </div>
    </div>
  );
}
