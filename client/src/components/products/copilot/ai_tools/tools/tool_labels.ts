import { t3 } from "lib";
import { plural } from "panther";

export function slidesLabel(n: number): string {
  return `${n} ${
    plural(n, {
      one: t3({ en: "slide", fr: "diapositive", pt: "diapositivo" }),
      other: t3({ en: "slides", fr: "diapositives", pt: "diapositivos" }),
    })
  }`;
}

export function visualizationsLabel(n: number): string {
  return `${n} ${
    plural(n, {
      one: t3({
        en: "visualization",
        fr: "visualisation",
        pt: "visualização",
      }),
      other: t3({
        en: "visualizations",
        fr: "visualisations",
        pt: "visualizações",
      }),
    })
  }`;
}

export function asImagesLabel(n: number): string {
  return t3({
    en: plural(n, { one: "as an image", other: "as images" }),
    fr: "en image",
    pt: "como imagem",
  });
}
