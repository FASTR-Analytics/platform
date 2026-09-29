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
