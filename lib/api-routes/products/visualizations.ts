import { z } from "zod";
import { figureBundleSchema } from "../../types/_figure_bundle.ts";
import { scopeIdSchema } from "../../types/scope.ts";
import type { VisualizationDetail } from "../../types/visualizations.ts";
import type {
  VisualizationVersionDetail,
  VisualizationVersionSummary,
} from "../../types/versions.ts";
import { type ProductAccessLevel, route } from "../route-utils.ts";
import { productIdParamsSchema } from "./products.ts";

const productVersionParamsSchema = z.object({
  product_id: z.string(),
  version_id: z.uuid(),
});

// Visualization content and version routes only (see ./slide-decks.ts):
// label, folder, package, scope, duplicate and delete are the shared product
// routes.
export const productVisualizationRouteRegistry = {
  // A visualization is created with its first figure, resolved by the client
  // under the pair it names, so it never exists empty. Fails typed
  // (PACKAGE_OR_SCOPE_UNAVAILABLE) like createProduct; the guard reads
  // folderId and scopeId from the body as it does there.
  createVisualization: route({
    path: "/products/visualization",
    method: "POST",
    body: z.object({
      folderId: z.uuid().nullable(),
      runId: z.string(),
      scopeId: scopeIdSchema,
      label: z.string().max(500).optional(),
      bundle: figureBundleSchema,
    }),
    response: {} as { productId: string; lastUpdated: string },
    access: "edit",
  }),

  getVisualizationDetail: route({
    path: "/products/:product_id/visualization",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as VisualizationDetail,
    access: "view",
  }),

  // The non-collab save (the editor's fallback when its room never went
  // live, a metric change). Routed through the live room when one exists.
  // `keepVersion` first writes the current state as a version, for a write
  // that replaces the figure wholesale.
  updateVisualization: route({
    path: "/products/:product_id/visualization",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({
      bundle: figureBundleSchema,
      keepVersion: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  listVisualizationVersions: route({
    path: "/products/:product_id/visualization/versions",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as VisualizationVersionSummary[],
    access: "view",
  }),

  getVisualizationVersion: route({
    path: "/products/:product_id/visualization/versions/:version_id",
    method: "GET",
    params: productVersionParamsSchema,
    response: {} as VisualizationVersionDetail,
    access: "view",
  }),

  restoreVisualizationVersion: route({
    path: "/products/:product_id/visualization/versions/:version_id/restore",
    method: "POST",
    params: productVersionParamsSchema,
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  copyVisualizationVersion: route({
    path: "/products/:product_id/visualization/versions/:version_id/copy",
    method: "POST",
    params: productVersionParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
    access: "view",
  }),
} as const satisfies Record<string, { access: ProductAccessLevel }>;
