// Contract: the PRODUCTS AND FOLDERS block in
// server/db/instance/_main_database.sql.

import type { PackageScope, ScopeId } from "./scope.ts";

export type ProductType = "slide_deck" | "report";

export const PRODUCT_TYPES = [
  "slide_deck",
  "report",
] as const satisfies readonly ProductType[];

export type Folder = {
  id: string;
  label: string;
  color: string | null;
  parentId: string | null;
  createdBy: string | null;
  createdAt: string | null;
  lastUpdated: string;
};

// The `products` row itself, without the per-type slice.
export type ProductBase = {
  id: string;
  label: string;
  folderId: string | null;
  // A product is always attached to exactly one package and never follows
  // the pin; the pin is only the default for a new product.
  runId: string;
  scopeId: ScopeId;
  // null = pre-restructure row (no invented provenance at consolidation).
  createdBy: string | null;
  createdAt: string | null;
  // The product version (see the SQL contract); keys the detail cache.
  lastUpdated: string;
};

export const PRODUCT_LEVELS = ["none", "view", "edit", "own"] as const;
export type ProductLevel = (typeof PRODUCT_LEVELS)[number];
export type ProductGrantLevel = Extract<ProductLevel, "view" | "edit">;
export type ProductDefaultAccess = Exclude<ProductLevel, "own">;
export type ProductGrant = { email: string; level: ProductGrantLevel };

// Who holds what on one product: what every summary carries, and all that
// productLevelFor reads. `owner` null = no owner (a consolidated row, or one
// whose owner was deleted); `defaultAccess` is the general access, what
// everyone else in the instance holds.
export type ProductAccess = {
  owner: string | null;
  defaultAccess: ProductDefaultAccess;
  grants: ProductGrant[];
};

export function productLevelAtLeast(
  level: ProductLevel,
  required: ProductLevel,
): boolean {
  return PRODUCT_LEVELS.indexOf(level) >= PRODUCT_LEVELS.indexOf(required);
}

// The one derivation (PLAN_PRODUCT_OWNERSHIP R8): a global admin and the
// owner hold own; everyone else holds the higher of their grant and the
// general access, so the general access is a floor no grant lowers.
export function productLevelFor(
  access: ProductAccess,
  user: { email: string; isGlobalAdmin: boolean },
): ProductLevel {
  if (user.isGlobalAdmin || access.owner === user.email) {
    return "own";
  }
  const grant: ProductLevel =
    access.grants.find((g) => g.email === user.email)?.level ?? "none";
  return productLevelAtLeast(grant, access.defaultAccess)
    ? grant
    : access.defaultAccess;
}

// What the Products page renders and what rides the instance SSE channel:
// what a product IS, who holds what on it, plus one cheap per-type existence
// flag. Content (configs, bodies, registries) stays behind the detail
// fetches.
export type ProductSummary =
  | (ProductBase & ProductAccess & {
    type: "slide_deck";
    firstSlideId: string | null;
  })
  | (ProductBase & ProductAccess & {
    type: "report";
    hasEmbeds: boolean;
  });

export function productScope(product: ProductBase): PackageScope {
  return { runId: product.runId, scopeId: product.scopeId };
}
