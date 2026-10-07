import { z } from "zod";
import { PRODUCT_TYPES } from "../../types/products.ts";
import { scopeIdSchema } from "../../types/scope.ts";
import { type ProductAccessLevel, route } from "../route-utils.ts";

// A product id is a short nanoid, never a uuid, and never length-validated:
// pre-restructure 3-char ids keep working beside newly minted 4-char ones.
export const productIdParamsSchema = z.object({ product_id: z.string() });

// A general access and a list of people, as the access dialog sends them.
export const productAccessBodySchema = z.object({
  defaultAccess: z.enum(["none", "view", "edit"]),
  grants: z.array(
    z.object({ email: z.string(), level: z.enum(["view", "edit"]) }),
  ),
});

// The cross-type surface: everything that treats a deck and a report alike.
// Per-type content and version routes live in ./slide-decks.ts, ./slides.ts
// and ./reports.ts and carry no label, folder, delete or duplicate of their
// own. Every entry declares `access`; defineRoute installs the guard from it
// (PLAN_PRODUCTS_RESTRUCTURE §3.2).
export const productRouteRegistry = {
  // The caller names the package and the scope (a create dialog asks for
  // both); the server mints the label. Fails typed
  // (PACKAGE_OR_SCOPE_UNAVAILABLE) when the package is not ready or either
  // row is gone.
  createProduct: route({
    path: "/products",
    method: "POST",
    body: z.object({
      type: z.enum(PRODUCT_TYPES),
      folderId: z.uuid().nullable(),
      runId: z.string(),
      scopeId: scopeIdSchema,
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
    body: z.object({ scopeId: scopeIdSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  // Clones run_id verbatim into the source's folder under the scope the
  // caller names (the source's own to keep it): a deck copied per scope is
  // how scoped products are made (D5).
  duplicateProduct: route({
    path: "/products/:product_id/duplicate",
    method: "POST",
    params: productIdParamsSchema,
    body: z.object({ scopeId: scopeIdSchema }),
    response: {} as { productId: string; lastUpdated: string },
    access: "view",
  }),

  // Replaces the general access and the whole grant list in one transaction
  // (PLAN_PRODUCT_OWNERSHIP R10). Refuses a grant naming the owner, a grant
  // naming an email with no users row, and a list naming one email twice.
  setProductAccess: route({
    path: "/products/:product_id/access",
    method: "PUT",
    params: productIdParamsSchema,
    body: productAccessBodySchema,
    access: "edit",
  }),

  // The previous owner, if any, becomes an edit grantee; the new owner's
  // grant, if any, is removed (R10). Refuses an email with no users row.
  setProductOwner: route({
    path: "/products/:product_id/owner",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ email: z.string() }),
    access: "own",
  }),
} as const satisfies Record<string, { access: ProductAccessLevel }>;
