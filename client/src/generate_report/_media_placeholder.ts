import { t3 } from "lib";

// One source of truth for the "couldn't be shown" placeholder, shared by the
// report and slide-deck exports so both degrade consistently
// (one bad figure/image becomes a visible note instead of vanishing or
// aborting the whole export).
export function unavailableItemMarkdown(): string {
  return t3({
    en: "_This item could not be displayed._",
    fr: "_Cet élément n'a pas pu être affiché._",
    pt: "_Não foi possível apresentar este elemento._",
  });
}
