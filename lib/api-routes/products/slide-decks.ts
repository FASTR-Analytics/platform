import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import { slideDeckConfigSchema } from "../../types/mod.ts";
import type { SlideDeckDetail } from "../../types/slides.ts";
import type {
  SlideDeckVersionDetail,
  SlideDeckVersionSummary,
} from "../../types/versions.ts";
import { route } from "../route-utils.ts";
import { productIdParamsSchema } from "./products.ts";

const productVersionParamsSchema = z.object({
  product_id: z.string(),
  version_id: z.uuid(),
});

// Deck content and version routes only; label, folder, package, scope,
// duplicate and delete are the shared product routes (./products.ts), and
// there is no deck list route: products ride the instance SSE channel.
export const productSlideDeckRouteRegistry = {
  getSlideDeckDetail: route({
    path: "/products/:product_id/slide-deck",
    method: "GET",
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    response: {} as SlideDeckDetail,
  }),

  updateSlideDeckConfig: route({
    path: "/products/:product_id/slide-deck/config",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({ config: slideDeckConfigSchema }),
    response: {} as { lastUpdated: string },
  }),

  listSlideDeckVersions: route({
    path: "/products/:product_id/slide-deck/versions",
    method: "GET",
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    response: {} as SlideDeckVersionSummary[],
  }),

  getSlideDeckVersion: route({
    path: "/products/:product_id/slide-deck/versions/:version_id",
    method: "GET",
    guard: GUARD.product("view"),
    params: productVersionParamsSchema,
    response: {} as SlideDeckVersionDetail,
  }),

  restoreSlideDeckVersion: route({
    path: "/products/:product_id/slide-deck/versions/:version_id/restore",
    method: "POST",
    guard: GUARD.product("edit"),
    params: productVersionParamsSchema,
    response: {} as { lastUpdated: string },
  }),

  // Creates a NEW product from the snapshot, so it carries a label and folder
  // like createProduct does, and inherits the source deck's (run_id, scope).
  copySlideDeckVersion: route({
    path: "/products/:product_id/slide-deck/versions/:version_id/copy",
    method: "POST",
    guard: GUARD.product("view"),
    params: productVersionParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
