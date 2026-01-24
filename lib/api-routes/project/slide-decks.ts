import { route } from "../route-utils.ts";
import type { SlideDeckSummary, SlideDeckDetail } from "../../types/slides.ts";

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
    params: {} as { deck_id: string },
    response: {} as SlideDeckDetail,
    requiresProject: true,
  }),

  createSlideDeck: route({
    path: "/slide-decks",
    method: "POST",
    body: {} as { label: string },
    response: {} as { deckId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateSlideDeckLabel: route({
    path: "/slide-decks/:deck_id/label",
    method: "PUT",
    params: {} as { deck_id: string },
    body: {} as { label: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateSlideDeckPlan: route({
    path: "/slide-decks/:deck_id/plan",
    method: "PUT",
    params: {} as { deck_id: string },
    body: {} as { plan: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteSlideDeck: route({
    path: "/slide-decks/:deck_id",
    method: "DELETE",
    params: {} as { deck_id: string },
    response: {} as never,
    requiresProject: true,
  }),
};
