import { z } from "zod";
import { slideDeckConfigSchema } from "../../types/mod.ts";
import type { SlideDeckSummary, SlideDeckDetail, SlideDeckConfig } from "../../types/slides.ts";
import type {
  DeckVersionDetail,
  DeckVersionSummary,
} from "../../types/versions.ts";
import { route } from "../route-utils.ts";

// deck_id is a 3-char nanoid (generateUniqueDeckId), not a UUID
const deckIdParamsSchema = z.object({ deck_id: z.string() });
const deckVersionParamsSchema = z.object({
  deck_id: z.string(),
  version_id: z.uuid(),
});
const folderBodyFields = {
  label: z.string(),
  folderId: z.uuid().nullable().optional(),
};

export const slideDeckRouteRegistry = {
  getAllSlideDecks: route({
    path: "/slide-decks",
    method: "GET",
    response: {} as SlideDeckSummary[],
    requiresProject: true,
  }),

  getSlideDeckDetail: route({
    path: "/slide-decks/:deck_id",
    method: "GET",
    params: deckIdParamsSchema,
    response: {} as SlideDeckDetail,
    requiresProject: true,
  }),

  createSlideDeck: route({
    path: "/slide-decks",
    method: "POST",
    body: z.object(folderBodyFields),
    response: {} as { deckId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateSlideDeckLabel: route({
    path: "/slide-decks/:deck_id/label",
    method: "PUT",
    params: deckIdParamsSchema,
    body: z.object({ label: z.string() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateSlideDeckPlan: route({
    path: "/slide-decks/:deck_id/plan",
    method: "PUT",
    params: deckIdParamsSchema,
    body: z.object({ plan: z.string() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  moveSlideDeckToFolder: route({
    path: "/slide-decks/:deck_id/folder",
    method: "PUT",
    params: deckIdParamsSchema,
    body: z.object({ folderId: z.uuid().nullable() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateSlideDeckConfig: route({
    path: "/slide-decks/:deck_id/config",
    method: "PUT",
    params: deckIdParamsSchema,
    body: z.object({ config: slideDeckConfigSchema }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  duplicateSlideDeck: route({
    path: "/slide-decks/:deck_id/duplicate",
    method: "POST",
    params: deckIdParamsSchema,
    body: z.object(folderBodyFields),
    response: {} as { newDeckId: string; lastUpdated: string },
    requiresProject: true,
  }),

  deleteSlideDeck: route({
    path: "/slide-decks/:deck_id",
    method: "DELETE",
    params: deckIdParamsSchema,
    response: {} as never,
    requiresProject: true,
  }),

  listDeckVersions: route({
    path: "/slide-decks/:deck_id/versions",
    method: "GET",
    params: deckIdParamsSchema,
    response: {} as DeckVersionSummary[],
    requiresProject: true,
  }),

  getDeckVersion: route({
    path: "/slide-decks/:deck_id/versions/:version_id",
    method: "GET",
    params: deckVersionParamsSchema,
    response: {} as DeckVersionDetail,
    requiresProject: true,
  }),

  restoreDeckVersion: route({
    path: "/slide-decks/:deck_id/versions/:version_id/restore",
    method: "POST",
    params: deckVersionParamsSchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  copyDeckVersion: route({
    path: "/slide-decks/:deck_id/versions/:version_id/copy",
    method: "POST",
    params: deckVersionParamsSchema,
    body: z.object(folderBodyFields),
    response: {} as { newDeckId: string; lastUpdated: string },
    requiresProject: true,
  }),
} as const;
