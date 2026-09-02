import { FASTR_BLOCK_SNIPPETS, t3 } from "lib";
import { For } from "solid-js";
import { MarkdownGuide } from "~/components/_markdown_guide";
import {
  fastrBlockCaption,
  fastrBlockLabel,
} from "~/components/_shared/fastr_block_labels";

// The FASTR Markdown counterpart of MarkdownGuide / HtmlGuide: everything plain
// markdown offers (reused verbatim) plus the `:::` blocks, which are the whole
// reason the format exists. These rows INSERT — a five-line nested block is not
// something anyone should have to retype from a reference table.

export function FastrMarkdownGuide(p: { onInsert?: (snippet: string) => void }) {
  return (
    <div class="ui-spy-sm">
      <MarkdownGuide />
      <div class="text-base-content-muted font-700 pt-3 text-sm">
        {t3({ en: "Colouring a phrase", fr: "Colorer une expression", pt: "Colorir uma expressão" })}
      </div>
      <div class="text-base-content-muted text-xs">
        <code class="bg-base-200 text-base-content rounded px-1.5 py-0.5 font-mono">
          [fell 12 points]{"{.danger}"}
        </code>
        <div class="pt-1">
          {t3({
            en: "Roles: .accent .muted .danger .warning .success .info — the theme owns the colour, so a marked phrase survives a theme switch. The toolbar has a picker for these.",
            fr: "Rôles : .accent .muted .danger .warning .success .info — le thème définit la couleur, donc une expression marquée survit à un changement de thème. La barre d'outils propose un sélecteur.",
            pt: "Papéis: .accent .muted .danger .warning .success .info — o tema define a cor, por isso uma expressão marcada sobrevive a uma mudança de tema. A barra de ferramentas tem um seletor.",
          })}
        </div>
      </div>
      <div class="text-base-content-muted font-700 pt-3 text-sm">
        {t3({ en: "Blocks", fr: "Blocs", pt: "Blocos" })}
      </div>
      <For each={FASTR_BLOCK_SNIPPETS}>
        {(row) => (
          <button
            type="button"
            class="hover:bg-base-200 -mx-1 flex w-full flex-col items-start gap-0.5 rounded px-1 py-1 text-left disabled:cursor-default disabled:opacity-100"
            disabled={!p.onInsert}
            onClick={() => p.onInsert?.(row.snippet)}
          >
            <div class="flex items-baseline gap-3">
              <code class="bg-base-200 text-base-content shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                :::{row.name}
              </code>
              <span class="text-base-content text-xs font-700">
                {fastrBlockLabel(row.name)}
              </span>
            </div>
            <span class="text-base-content-muted text-xs">
              {fastrBlockCaption(row.name)}
            </span>
          </button>
        )}
      </For>
      <div class="text-base-content-muted pt-1 text-xs">
        {t3({
          en: "Close every block with ::: on its own line (a statistic and page setup are one line and need no close). Add tone=muted, accent, solid, dark, inverse, gradient, danger, warning, success or info to any block for a background that follows the theme.",
          fr: "Fermez chaque bloc par ::: sur sa propre ligne (une statistique et la mise en page tiennent sur une ligne, sans fermeture). Ajoutez tone=muted, accent, solid, dark, inverse, gradient, danger, warning, success ou info à n'importe quel bloc pour un fond qui suit le thème.",
          pt: "Feche cada bloco com ::: numa linha própria (uma estatística e a configuração da página ocupam uma linha e não precisam de fecho). Adicione tone=muted, accent, solid, dark, inverse, gradient, danger, warning, success ou info a qualquer bloco para um fundo que segue o tema.",
        })}
      </div>
    </div>
  );
}
