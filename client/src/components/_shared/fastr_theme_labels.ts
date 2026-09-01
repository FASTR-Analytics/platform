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
  }
}

export function fastrThemeOptions(): { value: FastrReportTheme; label: string }[] {
  return FASTR_REPORT_THEMES.map((t) => ({
    value: t,
    label: fastrThemeLabel(t),
  }));
}
