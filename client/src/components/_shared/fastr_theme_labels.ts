import { FASTR_REPORT_THEMES, type FastrReportTheme, t3 } from "lib";

// Display names + one-line characters for the FASTR Markdown themes, shared by
// the creation picker and the report editor's theme switcher. The themes
// themselves (the design tokens) live in lib/types/report_fastr_themes.ts.

export function fastrThemeLabel(theme: FastrReportTheme): string {
  switch (theme) {
    case "default":
      return t3({ en: "Default", fr: "Par défaut", pt: "Predefinido" });
    case "minimal":
      return t3({ en: "Minimal", fr: "Minimal", pt: "Minimal" });
    case "corporate":
      return t3({ en: "Corporate", fr: "Institutionnel", pt: "Corporativo" });
    case "ministry":
      return t3({ en: "Ministry", fr: "Ministère", pt: "Ministério" });
    case "classic":
      return t3({ en: "Classic", fr: "Classique", pt: "Clássico" });
    case "executive":
      return t3({ en: "Executive", fr: "Direction", pt: "Executivo" });
    case "clinical":
      return t3({ en: "Clinical", fr: "Clinique", pt: "Clínico" });
    case "editorial":
      return t3({ en: "Editorial", fr: "Éditorial", pt: "Editorial" });
    case "swiss":
      return t3({ en: "Swiss", fr: "Suisse", pt: "Suíço" });
    case "monochrome":
      return t3({ en: "Monochrome", fr: "Monochrome", pt: "Monocromático" });
    case "bauhaus":
      return t3({ en: "Bauhaus", fr: "Bauhaus", pt: "Bauhaus" });
    case "broadsheet":
      return t3({ en: "Broadsheet", fr: "Grand format", pt: "Formato grande" });
    case "risograph":
      return t3({ en: "Risograph", fr: "Risographie", pt: "Risografia" });
    case "artdeco":
      return t3({ en: "Art Deco", fr: "Art déco", pt: "Art déco" });
    case "japanese":
      return t3({ en: "Japanese", fr: "Japonais", pt: "Japonês" });
    case "terminal":
      return t3({ en: "Terminal", fr: "Terminal", pt: "Terminal" });
    case "brutalist":
      return t3({ en: "Brutalist", fr: "Brutaliste", pt: "Brutalista" });
  }
}

export function fastrThemeCaption(theme: FastrReportTheme): string {
  switch (theme) {
    case "default":
      return t3({
        en: "Neutral system type, blue accent",
        fr: "Typographie système neutre, accent bleu",
        pt: "Tipografia neutra do sistema, destaque azul",
      });
    case "minimal":
      return t3({
        en: "Airy, hairline rules, no fills",
        fr: "Aéré, filets fins, sans aplats",
        pt: "Arejado, filetes finos, sem preenchimentos",
      });
    case "corporate":
      return t3({
        en: "Navy accent, soft cards",
        fr: "Accent bleu marine, cartes douces",
        pt: "Destaque azul-marinho, cartões suaves",
      });
    case "ministry":
      return t3({
        en: "Formal, serif headings, green accent",
        fr: "Formel, titres serif, accent vert",
        pt: "Formal, títulos serifados, destaque verde",
      });
    case "classic":
      return t3({
        en: "Serif text on warm paper",
        fr: "Texte serif sur papier chaud",
        pt: "Texto serifado em papel quente",
      });
    case "executive":
      return t3({
        en: "Display serif, gold accent",
        fr: "Serif de titrage, accent doré",
        pt: "Serifa de destaque, dourado",
      });
    case "clinical":
      return t3({
        en: "Plex Sans, teal accent, strong tables",
        fr: "Plex Sans, accent sarcelle, tableaux marqués",
        pt: "Plex Sans, destaque azul-petróleo, tabelas fortes",
      });
    case "editorial":
      return t3({
        en: "Magazine masthead, red accent",
        fr: "Bandeau de magazine, accent rouge",
        pt: "Cabeçalho de revista, destaque vermelho",
      });
    case "swiss":
      return t3({
        en: "Uppercase grid, heavy rules, red",
        fr: "Grille en capitales, filets épais, rouge",
        pt: "Grelha em maiúsculas, filetes espessos, vermelho",
      });
    case "monochrome":
      return t3({
        en: "Greyscale only",
        fr: "Niveaux de gris uniquement",
        pt: "Apenas escala de cinzentos",
      });
    case "bauhaus":
      return t3({
        en: "Geometric, heavy rules, primary red",
        fr: "Géométrique, filets épais, rouge primaire",
        pt: "Geométrico, filetes espessos, vermelho primário",
      });
    case "broadsheet":
      return t3({
        en: "Newspaper serif, centred masthead",
        fr: "Serif de presse, bandeau centré",
        pt: "Serifa de jornal, cabeçalho centrado",
      });
    case "risograph":
      return t3({
        en: "Offset print, blue and pink",
        fr: "Impression offset, bleu et rose",
        pt: "Impressão offset, azul e rosa",
      });
    case "artdeco":
      return t3({
        en: "Gold rules, wide caps, centred",
        fr: "Filets dorés, capitales espacées, centré",
        pt: "Filetes dourados, maiúsculas espaçadas, centrado",
      });
    case "japanese":
      return t3({
        en: "Airy, mincho headings, narrow column",
        fr: "Aéré, titres mincho, colonne étroite",
        pt: "Arejado, títulos mincho, coluna estreita",
      });
    case "terminal":
      return t3({
        en: "Dark page, green monospace",
        fr: "Page sombre, chasse fixe verte",
        pt: "Página escura, monoespaçada verde",
      });
    case "brutalist":
      return t3({
        en: "System type, hard borders, yellow",
        fr: "Typo système, bordures dures, jaune",
        pt: "Tipografia do sistema, bordas duras, amarelo",
      });
  }
}

export function fastrThemeOptions(): { value: FastrReportTheme; label: string }[] {
  return FASTR_REPORT_THEMES.map((t) => ({
    value: t,
    label: fastrThemeLabel(t),
  }));
}
