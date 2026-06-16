import { t3 } from "lib";
import { For } from "solid-js";

const ROWS: { syntax: string; label: () => string; labelClass: string }[] = [
  {
    syntax: "# Heading",
    label: () => t3({ en: "Heading", fr: "Titre" }),
    labelClass: "font-700 text-sm text-base-content",
  },
  {
    syntax: "## Subheading",
    label: () => t3({ en: "Subheading", fr: "Sous-titre" }),
    labelClass: "font-700 text-base-content",
  },
  {
    syntax: "**bold**",
    label: () => t3({ en: "Bold text", fr: "Texte en gras" }),
    labelClass: "font-700 text-base-content",
  },
  {
    syntax: "*italic*",
    label: () => t3({ en: "Italic text", fr: "Texte en italique" }),
    labelClass: "italic text-base-content/70",
  },
  {
    syntax: "- item",
    label: () => `• ${t3({ en: "Bulleted list", fr: "Liste à puces" })}`,
    labelClass: "text-base-content/70",
  },
  {
    syntax: "1. item",
    label: () => t3({ en: "Numbered list", fr: "Liste numérotée" }),
    labelClass: "list-item list-decimal list-inside text-base-content/70",
  },
  {
    syntax: "> quote",
    label: () => t3({ en: "Quote", fr: "Citation" }),
    labelClass: "border-base-300 border-l-2 pl-2 italic text-base-content/60",
  },
  {
    syntax: "[text](https://…)",
    label: () => t3({ en: "Link", fr: "Lien" }),
    labelClass: "text-primary underline",
  },
];

// Compact reference for the markdown subset our text renderer supports, with
// each label rendered in the style it produces. Shared by the slide text-block
// editor and the report embed panel.
export function MarkdownGuide() {
  return (
    <div class="ui-spy-sm">
      <div class="text-base-content/70 font-700 text-sm">
        {t3({
          en: "Formatting instructions",
          fr: "Instructions de mise en forme",
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
      <div class="text-base-content/60 pt-1 text-xs">
        {t3({
          en: "Leave a blank line between paragraphs.",
          fr: "Laissez une ligne vide entre les paragraphes.",
        })}
      </div>
    </div>
  );
}
