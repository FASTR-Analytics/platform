import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import { slideConfigSchema } from "../../types/_slide_config.ts";
import type { SlideWithMeta } from "../../types/slides.ts";
import { route } from "../route-utils.ts";
import { productIdParamsSchema } from "./products.ts";

// slide_id is a short nanoid, never a uuid. Every slide route is scoped by
// the owning product_id as well, so a slide id from another deck is a 404.
const productSlideParamsSchema = z.object({
  product_id: z.string(),
  slide_id: z.string(),
});

const slidePositionSchema = z.union([
  z.object({ after: z.string() }),
  z.object({ before: z.string() }),
  z.object({ toStart: z.literal(true) }),
  z.object({ toEnd: z.literal(true) }),
]);

// Slide write bodies validate against slideConfigSchema (strip mode) so a
// malformed slide is a 400 at the boundary. Handlers still cast the parsed
// value to `Slide`: the schema's recursive layout node is z.ZodTypeAny
// because z.lazy() cannot reproduce panther's branded LayoutNode, so the
// inferred type is not assignable to Slide; the cast bridges that gap only.
export const productSlideRouteRegistry = {
  getSlides: route({
    path: "/products/:product_id/slides",
    method: "GET",
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    response: {} as SlideWithMeta[],
  }),

  getSlide: route({
    path: "/products/:product_id/slides/:slide_id",
    method: "GET",
    guard: GUARD.product("view"),
    params: productSlideParamsSchema,
    response: {} as SlideWithMeta,
  }),

  createSlide: route({
    path: "/products/:product_id/slides",
    method: "POST",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({
      position: slidePositionSchema,
      slide: slideConfigSchema,
    }),
    response: {} as { slideId: string; lastUpdated: string },
  }),

  updateSlide: route({
    path: "/products/:product_id/slides/:slide_id",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productSlideParamsSchema,
    body: z.object({
      slide: slideConfigSchema,
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string },
  }),

  deleteSlides: route({
    path: "/products/:product_id/slides",
    method: "DELETE",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({ slideIds: z.array(z.string()) }),
    // ACTUALLY-deleted ids: the delete is deck-scoped, so a requested id in
    // another deck is a no-op.
    response: {} as { deletedIds: string[]; lastUpdated: string },
  }),

  duplicateSlides: route({
    path: "/products/:product_id/slides/duplicate",
    method: "POST",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({ slideIds: z.array(z.string()) }),
    response: {} as { newSlideIds: string[]; lastUpdated: string },
  }),

  moveSlides: route({
    path: "/products/:product_id/slides/move",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({
      slideIds: z.array(z.string()),
      position: slidePositionSchema,
    }),
    response: {} as { slides: SlideWithMeta[]; lastUpdated: string },
  }),

  // The cross-deck reuse path (there is no figure library). Bundles are
  // copied verbatim, so a copied figure shows stale under the target deck
  // when the two products' (package, scope) pairs differ. The source is only
  // read; the target, a destination, always needs edit.
  copySlidesToSlideDeck: route({
    path: "/products/:product_id/slides/copy-to-slide-deck",
    method: "POST",
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    body: z.object({
      slideIds: z.array(z.string()),
      targetProductId: z.string(),
    }),
    response: {} as { newSlideIds: string[]; lastUpdated: string },
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
