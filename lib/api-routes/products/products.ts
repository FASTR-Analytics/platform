import { z } from "zod";
import { PRODUCT_TYPES } from "../../types/products.ts";
import { type ProductAccessLevel, route } from "../route-utils.ts";

// A product id is a short nanoid, never a uuid, and never length-validated:
// pre-restructure 3-char ids keep working beside newly minted 4-char ones.
export const productIdParamsSchema = z.object({ product_id: z.string() });

// The cross-type surface: everything that treats a deck and a report alike.
// Per-type content and version routes live in ./slide-decks.ts, ./slides.ts
// and ./reports.ts and carry no label, folder, delete or duplicate of their
// own. Every entry declares `access`; defineRoute installs the guard from it
// (PLAN_PRODUCTS_RESTRUCTURE §3.2).
export const productRouteRegistry = {
  // The server mints the label and resolves run_id from the pinned package;
  // the client sends neither. Fails typed (NO_READY_PINNED_PACKAGE) when no
  // ready package is pinned.
  createProduct: route({
    path: "/products",
    method: "POST",
    body: z.object({
      type: z.enum(PRODUCT_TYPES),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
    access: "edit",
  }),

  updateProductLabel: route({
    path: "/products/:product_id/label",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ label: z.string() }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  moveProductsToFolder: route({
    path: "/products/folder",
    method: "PUT",
    body: z.object({
      productIds: z.array(z.string()),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  // Hard delete, no trash: the daily main-DB dump is the recovery path.
  deleteProducts: route({
    path: "/products",
    method: "DELETE",
    body: z.object({ productIds: z.array(z.string()) }),
    response: {} as { deletedIds: string[] },
    access: "own",
  }),

  // Reattach never blocks and has no compatibility pre-flight: figures that
  // no longer match the product's pair show a per-figure stale badge (D4).
  // The runs.status = 'ready' gate is IN the UPDATE.
  setProductPackage: route({
    path: "/products/:product_id/package",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ runId: z.string() }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  setProductScope: route({
    path: "/products/:product_id/scope",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ adminArea2: z.string().min(1).nullable() }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  // Clones (run_id, admin_area_2) verbatim into the source's folder: the Q2
  // to Q3 workflow is duplicate, then reattach the duplicate (D5).
  duplicateProduct: route({
    path: "/products/:product_id/duplicate",
    method: "POST",
    params: productIdParamsSchema,
    response: {} as { productId: string; lastUpdated: string },
    access: "edit",
  }),
} as const satisfies Record<string, { access: ProductAccessLevel }>;
