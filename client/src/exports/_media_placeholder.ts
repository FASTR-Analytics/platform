import { type FigureMap, type ImageMap } from "panther";
import { t3 } from "lib";

// One source of truth for the "couldn't be shown" placeholder, shared by
// dashboard, report, and slide-deck exports so all three degrade consistently
// (one bad figure/image becomes a visible note instead of vanishing or
// aborting the whole export).
export function unavailableItemMarkdown(): string {
  return t3({
    en: "_This item could not be displayed._",
    fr: "_Cet élément n'a pas pu être affiché._",
    pt: "_Não foi possível apresentar este elemento._",
  });
}

// Report bodies reference media as markdown image tokens
// (`![alt](figure:<id>)` / `![alt](image:<id>)`). Any token whose media failed
// to hydrate (absent from the maps — build error, load failure, or an orphaned
// reference) is swapped for the placeholder so it degrades in place.
const MEDIA_TOKEN_RE = /!\[[^\]]*\]\(((?:figure|image):[^)\s]+)\)/g;

export function replaceUnavailableMediaTokens(
  body: string,
  figures: FigureMap,
  images: ImageMap,
): string {
  return body.replace(MEDIA_TOKEN_RE, (match, src) =>
    figures.has(src) || images.has(src) ? match : unavailableItemMarkdown(),
  );
}
