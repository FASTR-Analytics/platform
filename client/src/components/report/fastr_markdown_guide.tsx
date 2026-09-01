import { FASTR_BLOCK_SNIPPETS, type FastrBlockName, t3 } from "lib";
import { For } from "solid-js";
import { MarkdownGuide } from "~/components/_markdown_guide";

// The FASTR Markdown counterpart of MarkdownGuide / HtmlGuide: everything plain
// markdown offers (reused verbatim) plus the `:::` blocks, which are the whole
// reason the format exists. These rows INSERT — a five-line nested block is not
// something anyone should have to retype from a reference table.

function blockLabel(name: FastrBlockName): string {
  switch (name) {
    case "callout":
      return t3({ en: "Callout", fr: "Encadré", pt: "Destaque" });
    case "tiles":
      return t3({ en: "Tiles", fr: "Tuiles", pt: "Mosaicos" });
    case "stat":
      return t3({ en: "Statistic", fr: "Statistique", pt: "Estatística" });
    case "columns":
      return t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" });
    case "quote":
      return t3({ en: "Pull quote", fr: "Citation en exergue", pt: "Citação em destaque" });
    case "band":
      return t3({ en: "Full-width band", fr: "Bandeau pleine largeur", pt: "Faixa de largura total" });
    case "cover":
      return t3({ en: "Cover page", fr: "Page de couverture", pt: "Página de capa" });
    case "report":
      return t3({ en: "Page setup", fr: "Mise en page", pt: "Configuração da página" });
    case "card":
    case "col":
      return name;
  }
}

function blockCaption(name: FastrBlockName): string {
  switch (name) {
    case "callout":
      return t3({
        en: "A coloured box for caveats and key findings",
        fr: "Un encadré coloré pour les réserves et constats",
        pt: "Uma caixa colorida para ressalvas e conclusões",
      });
    case "tiles":
      return t3({
        en: "A row of equal cards",
        fr: "Une rangée de cartes égales",
        pt: "Uma linha de cartões iguais",
      });
    case "stat":
      return t3({
        en: "A big number with a label and change",
        fr: "Un grand chiffre avec libellé et évolution",
        pt: "Um número grande com rótulo e variação",
      });
    case "columns":
      return t3({
        en: "Side-by-side content",
        fr: "Contenu côte à côte",
        pt: "Conteúdo lado a lado",
      });
    case "quote":
      return t3({
        en: "A quotation set apart from the text",
        fr: "Une citation détachée du texte",
        pt: "Uma citação destacada do texto",
      });
    case "band":
      return t3({
        en: "A coloured section running edge to edge",
        fr: "Une section colorée d'un bord à l'autre",
        pt: "Uma secção colorida de bordo a bordo",
      });
    case "cover":
      return t3({
        en: "A full-height title page",
        fr: "Une page de titre pleine hauteur",
        pt: "Uma página de título de altura total",
      });
    case "report":
      return t3({
        en: "Page background and column width, set once at the top",
        fr: "Fond de page et largeur de colonne, définis une fois en haut",
        pt: "Fundo da página e largura da coluna, definidos uma vez no topo",
      });
    case "card":
    case "col":
      return "";
  }
}

export function FastrMarkdownGuide(p: { onInsert?: (snippet: string) => void }) {
  return (
    <div class="ui-spy-sm">
      <MarkdownGuide />
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
                {blockLabel(row.name)}
              </span>
            </div>
            <span class="text-base-content-muted text-xs">
              {blockCaption(row.name)}
            </span>
          </button>
        )}
      </For>
      <div class="text-base-content-muted pt-1 text-xs">
        {t3({
          en: "Close every block with ::: on its own line (a statistic and page setup are one line and need no close). Add tone=muted, accent, solid, dark, inverse or gradient to any block for a background that follows the theme.",
          fr: "Fermez chaque bloc par ::: sur sa propre ligne (une statistique et la mise en page tiennent sur une ligne, sans fermeture). Ajoutez tone=muted, accent, solid, dark, inverse ou gradient à n'importe quel bloc pour un fond qui suit le thème.",
          pt: "Feche cada bloco com ::: numa linha própria (uma estatística e a configuração da página ocupam uma linha e não precisam de fecho). Adicione tone=muted, accent, solid, dark, inverse ou gradient a qualquer bloco para um fundo que segue o tema.",
        })}
      </div>
    </div>
  );
}
