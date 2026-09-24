import { SLIDE_DECK_THEMES, t3, type SlideDeckTheme } from "lib";

// Display names and one-line characters for the slide deck themes. The themes
// themselves (which palette, face, layout and treatments each name means) live
// in lib/types/_slide_deck_themes.ts.
//
// The names match the FASTR Markdown themes one for one, so these labels are
// deliberately the same words as report/fastr_theme_labels.ts. The CAPTIONS
// are not: they describe what the name does to a slide, not to a page.

export function slideDeckThemeLabel(theme: SlideDeckTheme): string {
  switch (theme) {
    case "default":
      return t3({ en: "Default", fr: "Par défaut", pt: "Predefinido" });
    case "minimal":
      return t3({ en: "Minimal", fr: "Minimal", pt: "Minimal" });
    case "corporate":
      return t3({ en: "Corporate", fr: "Institutionnel", pt: "Corporativo" });
    case "ministry":
      return t3({ en: "Ministry", fr: "Ministère", pt: "Ministério" });
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
  }
}

export function slideDeckThemeCaption(theme: SlideDeckTheme): string {
  switch (theme) {
    case "default":
      return t3({
        en: "GFF green, Inter, bold cover",
        fr: "Vert GFF, Inter, couverture pleine",
        pt: "Verde GFF, Inter, capa sólida",
      });
    case "minimal":
      return t3({
        en: "White cover, hairline rules, no fills",
        fr: "Couverture blanche, filets fins, sans aplats",
        pt: "Capa branca, filetes finos, sem preenchimentos",
      });
    case "corporate":
      return t3({
        en: "Navy, bordered headers, logos in the corner",
        fr: "Bleu marine, en-têtes encadrés, logos en coin",
        pt: "Azul-marinho, cabeçalhos com moldura, logótipos ao canto",
      });
    case "ministry":
      return t3({
        en: "Serif headings, institutional green, muted cover",
        fr: "Titres serif, vert institutionnel, couverture sourde",
        pt: "Títulos serifados, verde institucional, capa suave",
      });
    case "executive":
      return t3({
        en: "Slate, serif, split accent panel",
        fr: "Ardoise, serif, panneau d'accent latéral",
        pt: "Ardósia, serifa, painel de destaque lateral",
      });
    case "clinical":
      return t3({
        en: "Pale cyan, soft headers, built for numbers",
        fr: "Cyan pâle, en-têtes doux, pensé pour les chiffres",
        pt: "Ciano pálido, cabeçalhos suaves, pensado para números",
      });
    case "editorial":
      return t3({
        en: "Ochre, serif, header-only furniture",
        fr: "Ocre, serif, en-tête seul",
        pt: "Ocre, serifa, apenas cabeçalho",
      });
    case "swiss":
      return t3({
        en: "Red, grotesque, nothing but information",
        fr: "Rouge, grotesque, rien que l'information",
        pt: "Vermelho, grotesca, apenas informação",
      });
    case "monochrome":
      return t3({
        en: "Greyscale only",
        fr: "Niveaux de gris uniquement",
        pt: "Apenas escala de cinzentos",
      });
    case "bauhaus":
      return t3({
        en: "Primary red, geometric, circle pattern",
        fr: "Rouge primaire, géométrique, motif de cercles",
        pt: "Vermelho primário, geométrico, padrão de círculos",
      });
    case "broadsheet":
      return t3({
        en: "Newsprint serif on white, ruled not boxed",
        fr: "Serif de presse sur blanc, filets sans cadres",
        pt: "Serifa de jornal sobre branco, filetes sem molduras",
      });
  }
}

export function slideDeckThemeOptions(): {
  value: SlideDeckTheme;
  label: string;
}[] {
  return SLIDE_DECK_THEMES.map((t) => ({
    value: t,
    label: slideDeckThemeLabel(t),
  }));
}
