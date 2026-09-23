import { t3 } from "lib";

// The name for the root, where a folder's contents land when it is deleted.
export function topLevelLabel(): string {
  return t3({
    en: "Top level",
    fr: "Niveau supérieur",
    pt: "Nível superior",
  });
}
