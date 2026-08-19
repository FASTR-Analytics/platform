import { z } from "zod";
import { route } from "../route-utils.ts";
import { slideConfigSchema } from "../../types/_slide_config.ts";
import type { SlidePosition, SlideWithMeta } from "../../types/slides.ts";

// deck_id and slide_id are short nanoids, never uuids (D14).
const deckIdParamsSchema = z.object({ deck_id: z.string() });
const slideIdParamsSchema = z.object({ slide_id: z.string() });

const slidePositionSchema = z.union([
  z.object({ after: z.string() }),
  z.object({ before: z.string() }),
  z.object({ toStart: z.literal(true) }),
  z.object({ toEnd: z.literal(true) }),
]);

// Slide write bodies validate against slideConfigSchema (strip mode) so a
// malformed slide is a 400 at the boundary rather than a failure at the DB
// call. Handlers still cast the parsed value to `Slide`: the schema's recursive
// layout node is annotated z.ZodTypeAny because z.lazy() cannot reproduce
// panther's branded LayoutNode<ContentBlock>, so SlideFromSchema is not
// assignable to Slide. Zod guarantees the structure at runtime; the cast only
// bridges that compile-time gap.

export const slideRouteRegistry = {
  getSlides: route({
    path: "/slides/:deck_id",
    method: "GET",
    params: deckIdParamsSchema,
    response: {} as SlideWithMeta[],
  }),

  getSlide: route({
    path: "/slides/slide/:slide_id",
    method: "GET",
    params: slideIdParamsSchema,
    response: {} as SlideWithMeta,
  }),

  createSlide: route({
    path: "/slides/:deck_id",
    method: "POST",
    params: deckIdParamsSchema,
    body: z.object({
      position: slidePositionSchema,
      slide: slideConfigSchema,
    }),
    response: {} as {
      slideId: string;
      lastUpdated: string;
    },
  }),

  updateSlide: route({
    path: "/slides/slide/:slide_id",
    method: "PUT",
    params: slideIdParamsSchema,
    body: z.object({
      slide: slideConfigSchema,
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as {
      lastUpdated: string;
    },
  }),

  deleteSlides: route({
    path: "/slides/:deck_id",
    method: "DELETE",
    params: deckIdParamsSchema,
    body: z.object({ slideIds: z.array(z.string()) }),
    response: {} as {
      // ACTUALLY-deleted ids (the delete is deck-scoped; requested ids in
      // another deck are no-ops)
      deletedIds: string[];
      deletedCount: number;
      lastUpdated: string;
    },
  }),

  duplicateSlides: route({
    path: "/slides/:deck_id/duplicate",
    method: "POST",
    params: deckIdParamsSchema,
    body: z.object({ slideIds: z.array(z.string()) }),
    response: {} as {
      newSlideIds: string[];
      lastUpdated: string;
    },
  }),

  moveSlides: route({
    path: "/slides/:deck_id/move",
    method: "PUT",
    params: deckIdParamsSchema,
    body: z.object({
      slideIds: z.array(z.string()),
      position: slidePositionSchema,
    }),
    response: {} as {
      slides: SlideWithMeta[];
      lastUpdated: string;
    },
  }),

  // The cross-deck reuse path — there is no figure library (D3). Bundles are
  // copied verbatim, so a copied figure shows stale under the target deck when
  // the two products' (package, scope) pairs differ (D4).
  copySlidesToDeck: route({
    path: "/slides/:deck_id/copy-to-deck",
    method: "POST",
    params: deckIdParamsSchema,
    body: z.object({
      slideIds: z.array(z.string()),
      targetDeckId: z.string(),
    }),
    response: {} as {
      newSlideIds: string[];
      lastUpdated: string;
    },
  }),
} as const;
