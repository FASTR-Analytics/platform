// Contract: the PRODUCTS AND FOLDERS block in
// server/db/instance/_main_database.sql.

import type { ProductAccess } from "../permissions/mod.ts";
import type { PackageScope, ScopeId } from "./scope.ts";

// The union derives from the tuple, so a type cannot exist without being
// listed (createProduct's enum and every Record<ProductType> read this).
export const PRODUCT_TYPES = [
  "slide_deck",
  "report",
  "visualization",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

// The types a user creates empty and fills in the editor. A visualization is
// created with its first figure already resolved (createVisualization), so it
// never exists empty.
export const EMPTY_CREATABLE_PRODUCT_TYPES = [
  "slide_deck",
  "report",
] as const satisfies readonly ProductType[];

export type EmptyCreatableProductType =
  (typeof EMPTY_CREATABLE_PRODUCT_TYPES)[number];

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
  })
  | (ProductBase & ProductAccess & {
    type: "visualization";
    // What its stored snapshot was resolved under; null only for a row no
    // write has stamped. Compared with the product's pair and its scope's
    // current definition hash, it says the snapshot is out of date
    // (isVisualizationStale).
    resolvedUnder: { runId: string; definitionHash: string } | null;
  });

// A visualization whose snapshot was resolved under a package or a scope
// definition other than the product's current ones. `currentDefinitionHash`
// is the product's scope's hash now (resolvePackageScope).
export function isVisualizationStale(
  product: Extract<ProductSummary, { type: "visualization" }>,
  currentDefinitionHash: string,
): boolean {
  const resolved = product.resolvedUnder;
  return resolved !== null &&
    (resolved.runId !== product.runId ||
      resolved.definitionHash !== currentDefinitionHash);
}

export function productScope(product: ProductBase): PackageScope {
  return { runId: product.runId, scopeId: product.scopeId };
}
