import {
  type FastrBlockName,
  type FastrInkRole,
  type FastrTone,
  t3,
} from "lib";

// Display names for the FASTR Markdown vocabulary — blocks, tones and inline
// roles — shared by the editor toolbar and the sidebar format guide. The
// vocabulary itself (what these names DO) lives in lib/fastr_markdown_blocks.ts;
// this file only says what to call each one in three languages.
//
// Every switch is exhaustive with no `default`, so adding a block, tone or role
// to the lib constants is a compile error until it has been named here.

export function fastrBlockLabel(name: FastrBlockName): string {
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
      return t3({
        en: "Pull quote",
        fr: "Citation en exergue",
        pt: "Citação em destaque",
      });
    case "band":
      return t3({
        en: "Full-width band",
        fr: "Bandeau pleine largeur",
        pt: "Faixa de largura total",
      });
    case "cover":
      return t3({
        en: "Cover page",
        fr: "Page de couverture",
        pt: "Página de capa",
      });
    case "steps":
      return t3({
        en: "Numbered steps",
        fr: "Étapes numérotées",
        pt: "Passos numerados",
      });
    case "report":
      return t3({ en: "Page setup", fr: "Mise en page", pt: "Configuração da página" });
    case "card":
      return t3({ en: "Card", fr: "Carte", pt: "Cartão" });
    case "col":
      return t3({ en: "Column", fr: "Colonne", pt: "Coluna" });
  }
}

export function fastrBlockCaption(name: FastrBlockName): string {
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
    case "steps":
      return t3({
        en: "A process list that numbers itself",
        fr: "Une liste d'étapes qui se numérote seule",
        pt: "Uma lista de passos que se numera sozinha",
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

// Tones name a ROLE. The labels say what the ground is FOR, not what colour it
// comes out — the colour is the theme's business and changes when it does.
export function fastrToneLabel(tone: FastrTone): string {
  switch (tone) {
    case "default":
      return t3({ en: "None", fr: "Aucun", pt: "Nenhum" });
    case "muted":
      return t3({ en: "Muted", fr: "Atténué", pt: "Suave" });
    case "accent":
      return t3({ en: "Accent wash", fr: "Voile d'accent", pt: "Véu de destaque" });
    case "solid":
      return t3({ en: "Solid accent", fr: "Accent plein", pt: "Destaque sólido" });
    case "dark":
      return t3({ en: "Dark", fr: "Sombre", pt: "Escuro" });
    case "inverse":
      return t3({ en: "Inverted", fr: "Inversé", pt: "Invertido" });
    case "gradient":
      return t3({ en: "Gradient", fr: "Dégradé", pt: "Gradiente" });
    case "danger":
      return t3({ en: "Bad news", fr: "Mauvaise nouvelle", pt: "Más notícias" });
    case "warning":
      return t3({ en: "Caution", fr: "Prudence", pt: "Atenção" });
    case "success":
      return t3({ en: "Good news", fr: "Bonne nouvelle", pt: "Boas notícias" });
    case "info":
      return t3({ en: "Note", fr: "Remarque", pt: "Nota" });
  }
}

export function fastrRoleLabel(role: FastrInkRole): string {
  switch (role) {
    case "accent":
      return t3({ en: "Accent", fr: "Accent", pt: "Destaque" });
    case "muted":
      return t3({ en: "Muted", fr: "Atténué", pt: "Suave" });
    case "danger":
      return t3({ en: "Bad news", fr: "Mauvaise nouvelle", pt: "Más notícias" });
    case "warning":
      return t3({ en: "Caution", fr: "Prudence", pt: "Atenção" });
    case "success":
      return t3({ en: "Good news", fr: "Bonne nouvelle", pt: "Boas notícias" });
    case "info":
      return t3({ en: "Note", fr: "Remarque", pt: "Nota" });
  }
}
