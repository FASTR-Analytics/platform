import { z } from "zod";
import { PRODUCT_TYPES } from "../../types/products.ts";
import { route } from "../route-utils.ts";

// A product id is a short nanoid, never a uuid — z.uuid() here would 400 every
// legitimate request (D14: ids are not length-validated anywhere either, so
// pre-restructure 3-char ids keep working beside newly minted 4-char ones).
const productIdParamsSchema = z.object({ product_id: z.string() });

// The cross-type surface: everything that treats a deck and a report alike.
// Per-type routes (content, versions) live in ./slide-decks.ts, ./slides.ts and
// ./reports.ts and carry no label / folder / delete / duplicate of their own.
export const productRouteRegistry = {
  // The server mints the label and resolves run_id from the pinned package —
  // the client sends neither (D16). Fails typed when nothing is pinned, which
  // the Products page renders as "an admin must generate a results package".
  createProduct: route({
    path: "/products",
    method: "POST",
    body: z.object({
      type: z.enum(PRODUCT_TYPES),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
  }),

  updateProductLabel: route({
    path: "/products/:product_id/label",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ label: z.string() }),
    response: {} as { lastUpdated: string },
  }),

  moveProductsToFolder: route({
    path: "/products/folder",
    method: "PUT",
    body: z.object({
      productIds: z.array(z.string()),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { lastUpdated: string },
  }),

  // Hard delete, no trash — confirm-by-count lives in the UI and the daily
  // named main-DB dump is the recovery path (D11).
  deleteProducts: route({
    path: "/products",
    method: "DELETE",
    body: z.object({ productIds: z.array(z.string()) }),
    response: {} as { deletedIds: string[] },
  }),

  // Reattach never blocks and has no compatibility pre-flight: figures that
  // no longer match the product's pair show a per-figure stale badge and an
  // "Update to <package>" action (D4). The runs.status = 'ready' gate is IN
  // the UPDATE.
  setProductPackage: route({
    path: "/products/:product_id/package",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ runId: z.string() }),
    response: {} as { lastUpdated: string },
  }),

  setProductScope: route({
    path: "/products/:product_id/scope",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ adminArea2: z.string().nullable() }),
    response: {} as { lastUpdated: string },
  }),

  // Clones (run_id, admin_area_2) verbatim — the Q2→Q3 workflow is duplicate,
  // then reattach the duplicate.
  duplicateProduct: route({
    path: "/products/:product_id/duplicate",
    method: "POST",
    params: productIdParamsSchema,
    response: {} as { productId: string; lastUpdated: string },
  }),
} as const;
