import { t3 } from "lib";
import { For } from "solid-js";

const ROWS: { syntax: string; label: () => string; labelClass: string }[] = [
  {
    syntax: "# Heading",
    label: () => t3({ en: "Heading", fr: "Titre", pt: "Título" }),
    labelClass: "font-700 text-sm text-base-content",
  },
  {
    syntax: "## Subheading",
    label: () => t3({ en: "Subheading", fr: "Sous-titre", pt: "Subtítulo" }),
    labelClass: "font-700 text-base-content",
  },
  {
    syntax: "**bold**",
    label: () => t3({ en: "Bold text", fr: "Texte en gras", pt: "Texto em negrito" }),
    labelClass: "font-700 text-base-content",
  },
  {
    syntax: "*italic*",
    label: () => t3({ en: "Italic text", fr: "Texte en italique", pt: "Texto em itálico" }),
    labelClass: "italic text-base-content-muted",
  },
  {
    syntax: "- item",
    label: () => `• ${t3({ en: "Bulleted list", fr: "Liste à puces" })}`,
    labelClass: "text-base-content-muted",
  },
  {
    syntax: "1. item",
    label: () => t3({ en: "Numbered list", fr: "Liste numérotée", pt: "Lista numerada" }),
    labelClass: "list-item list-decimal list-inside text-base-content-muted",
  },
  {
    syntax: "> quote",
    label: () => t3({ en: "Quote", fr: "Citation", pt: "Citação" }),
    labelClass: "border-l-2 pl-2 italic text-base-content-muted",
  },
  {
    syntax: "[text](https://…)",
    label: () => t3({ en: "Link", fr: "Lien", pt: "Ligação" }),
    labelClass: "text-primary underline",
  },
];

// Compact reference for the markdown subset our text renderer supports, with
// each label rendered in the style it produces. Shared by the slide text-block
// editor and the report embed panel.
export function MarkdownGuide() {
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
          en: "Leave a blank line between paragraphs.",
          fr: "Laissez une ligne vide entre les paragraphes.",
          pt: "Deixe uma linha em branco entre os parágrafos.",
        })}
      </div>
    </div>
  );
}
