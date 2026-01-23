import { createReactiveCache } from "./reactive_cache";
import type { SlideWithMeta } from "lib";

export const _SLIDE_CACHE = createReactiveCache<
  { projectId: string; slideId: string },
  SlideWithMeta
>({
  name: "slide",
  uniquenessKeys: (p) => [p.projectId, p.slideId],
  versionKey: (p, pds) => pds.lastUpdated.slides[p.slideId] ?? "unknown",
});

export const _SLIDE_DECK_META_CACHE = createReactiveCache<
  { projectId: string; deckId: string },
  { label: string; plan: string; slideIds: string[] }
>({
  name: "slide_deck_meta",
  uniquenessKeys: (p) => [p.projectId, p.deckId],
  versionKey: (p, pds) => pds.lastUpdated.slide_decks[p.deckId] ?? "unknown",
});
