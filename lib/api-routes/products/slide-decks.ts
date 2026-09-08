import { z } from "zod";
import { slideDeckConfigSchema } from "../../types/mod.ts";
import type { SlideDeckDetail } from "../../types/slides.ts";
import type {
  SlideDeckVersionDetail,
  SlideDeckVersionSummary,
} from "../../types/versions.ts";
import { type ProductAccessLevel, route } from "../route-utils.ts";
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
    params: productIdParamsSchema,
    response: {} as SlideDeckDetail,
    access: "view",
  }),

  updateSlideDeckPlan: route({
    path: "/products/:product_id/slide-deck/plan",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ plan: z.string() }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  updateSlideDeckConfig: route({
    path: "/products/:product_id/slide-deck/config",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ config: slideDeckConfigSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  listSlideDeckVersions: route({
    path: "/products/:product_id/slide-deck/versions",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as SlideDeckVersionSummary[],
    access: "view",
  }),

  getSlideDeckVersion: route({
    path: "/products/:product_id/slide-deck/versions/:version_id",
    method: "GET",
    params: productVersionParamsSchema,
    response: {} as SlideDeckVersionDetail,
    access: "view",
  }),

  restoreSlideDeckVersion: route({
    path: "/products/:product_id/slide-deck/versions/:version_id/restore",
    method: "POST",
    params: productVersionParamsSchema,
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  // Creates a NEW product from the snapshot, so it carries a label and folder
  // like createProduct does, and inherits the source deck's (run_id, scope).
  copySlideDeckVersion: route({
    path: "/products/:product_id/slide-deck/versions/:version_id/copy",
    method: "POST",
    params: productVersionParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
    access: "edit",
  }),
} as const satisfies Record<string, { access: ProductAccessLevel }>;
