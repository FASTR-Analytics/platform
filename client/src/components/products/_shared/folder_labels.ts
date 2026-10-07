import { t3 } from "lib";

// The root as a product destination: the synthetic General row.
export function generalLabel(): string {
  return t3({ en: "General", fr: "Général", pt: "Geral" });
}

// The root as a folder destination: folders never go into General.
export function topLevelLabel(): string {
  return t3({
    en: "Top level",
    fr: "Niveau supérieur",
    pt: "Nível superior",
  });
}

// The one "move to the root" label, read by both menus and by the list's
// root zone during a drag.
export function moveToRootLabel(kind: "product" | "folder"): string {
  return kind === "product"
    ? t3({
      en: `Move to ${generalLabel()}`,
      fr: `Déplacer vers ${generalLabel()}`,
      pt: `Mover para ${generalLabel()}`,
    })
    : t3({
      en: "Move to top level",
      fr: "Déplacer au niveau supérieur",
      pt: "Mover para o nível superior",
    });
}
