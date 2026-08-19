import { z } from "zod";
import { slideDeckConfigSchema } from "../../types/mod.ts";
import type { SlideDeckDetail } from "../../types/slides.ts";
import type {
  DeckVersionDetail,
  DeckVersionSummary,
} from "../../types/versions.ts";
import { route } from "../route-utils.ts";

// deck_id IS the product id — one id namespace, one authority (D2).
const deckIdParamsSchema = z.object({ deck_id: z.string() });
const deckVersionParamsSchema = z.object({
  deck_id: z.string(),
  version_id: z.uuid(),
});

// Content and version routes only. Label, folder, package, scope, duplicate and
// delete are the shared product routes (./products.ts); there is no deck list
// route — products ride the instance SSE channel.
export const slideDeckRouteRegistry = {
  getSlideDeckDetail: route({
    path: "/slide-decks/:deck_id",
    method: "GET",
    params: deckIdParamsSchema,
    response: {} as SlideDeckDetail,
  }),

  updateSlideDeckPlan: route({
    path: "/slide-decks/:deck_id/plan",
    method: "PUT",
    params: deckIdParamsSchema,
    body: z.object({ plan: z.string() }),
    response: {} as { lastUpdated: string },
  }),

  updateSlideDeckConfig: route({
    path: "/slide-decks/:deck_id/config",
    method: "PUT",
    params: deckIdParamsSchema,
    body: z.object({ config: slideDeckConfigSchema }),
    response: {} as { lastUpdated: string },
  }),

  listDeckVersions: route({
    path: "/slide-decks/:deck_id/versions",
    method: "GET",
    params: deckIdParamsSchema,
    response: {} as DeckVersionSummary[],
  }),

  getDeckVersion: route({
    path: "/slide-decks/:deck_id/versions/:version_id",
    method: "GET",
    params: deckVersionParamsSchema,
    response: {} as DeckVersionDetail,
  }),

  restoreDeckVersion: route({
    path: "/slide-decks/:deck_id/versions/:version_id/restore",
    method: "POST",
    params: deckVersionParamsSchema,
    response: {} as { lastUpdated: string },
  }),

  // Creates a NEW product from the snapshot, so it carries a label and folder
  // like createProduct does, and inherits the source deck's (run_id, scope).
  copyDeckVersion: route({
    path: "/slide-decks/:deck_id/versions/:version_id/copy",
    method: "POST",
    params: deckVersionParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
  }),
} as const;
