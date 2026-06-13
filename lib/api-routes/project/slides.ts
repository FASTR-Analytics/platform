import { z } from "zod";
import { route } from "../route-utils.ts";
import type { SlideWithMeta, SlidePosition } from "../../types/slides.ts";

// deck_id and slide_id are nanoids (generateUniqueDeckId / generateUniqueSlideId), not UUIDs
const deckIdParamsSchema = z.object({ deck_id: z.string() });
const slideIdParamsSchema = z.object({ slide_id: z.string() });

const slidePositionSchema = z.union([
  z.object({ after: z.string() }),
  z.object({ before: z.string() }),
  z.object({ toStart: z.literal(true) }),
  z.object({ toEnd: z.literal(true) }),
]);

// Slide body: z.unknown() — SlideFromSchema/Slide type gap (patternType "none"
// in panther's PatternType not in the Zod schema) blocks a clean schema here.
// The DB layer still validates via slideConfigSchema.parse(). Follow-on PR.

export const slideRouteRegistry = {
  getSlides: route({
    path: "/slides/:deck_id",
    method: "GET",
    params: deckIdParamsSchema,
    response: {} as SlideWithMeta[],
    requiresProject: true,
  }),

  getSlide: route({
    path: "/slides/slide/:slide_id",
    method: "GET",
    params: slideIdParamsSchema,
    response: {} as SlideWithMeta,
    requiresProject: true,
  }),

  createSlide: route({
    path: "/slides/:deck_id",
    method: "POST",
    params: deckIdParamsSchema,
    body: z.object({
      position: slidePositionSchema,
      slide: z.unknown(),
    }),
    response: {} as {
      slideId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  updateSlide: route({
    path: "/slides/slide/:slide_id",
    method: "PUT",
    params: slideIdParamsSchema,
    body: z.object({
      slide: z.unknown(),
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  deleteSlides: route({
    path: "/slides/:deck_id",
    method: "DELETE",
    params: deckIdParamsSchema,
    body: z.object({ slideIds: z.array(z.string()) }),
    response: {} as {
      deletedCount: number;
      lastUpdated: string;
    },
    requiresProject: true,
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
    requiresProject: true,
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
    requiresProject: true,
  }),
} as const;
