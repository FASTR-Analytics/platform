// =============================================================================
// Products — a product is a slide deck or a report
// =============================================================================
//
// `products` is the registry every cross-type operation goes through (list,
// folder move, delete, package reattach, "in use by", id namespace); the
// per-type detail tables hang off it by the same id
// (PLAN_PRODUCTS_RESTRUCTURE D1). Folders are the one flat organising level.
//
// Every approved user is a full editor of every product (D2). `createdBy` is
// recorded so the later owner/sharing model has its join key; nothing reads it
// for access today.
// =============================================================================

import type { PackageScope } from "./scope.ts";

export type ProductType = "slide_deck" | "report";

export const PRODUCT_TYPES = [
  "slide_deck",
  "report",
] as const satisfies readonly ProductType[];

export type Folder = {
  id: string;
  label: string;
  color: string | null;
  lastUpdated: string;
};

// The `products` row itself, without the per-type slice.
export type ProductBase = {
  id: string;
  label: string;
  folderId: string | null;
  // The package this product serves from. NOT NULL: a product is always
  // attached to exactly one package, and there is no follow-the-pin
  // (D5 — the pin is only the DEFAULT for a NEW product).
  runId: string;
  // null = national.
  adminArea2: string | null;
  // null = pre-restructure product (no invented provenance at consolidation).
  createdBy: string | null;
  createdAt: string | null;
  // THE product version — every content mutation and every metadata write
  // bumps it in the same transaction. Keys the detail cache.
  lastUpdated: string;
};

// What the Products page renders and what rides the instance SSE channel —
// only what a product IS, plus one cheap per-type existence flag. Content
// (configs, bodies, registries) stays behind the detail fetches.
export type ProductSummary =
  | (ProductBase & {
      type: "slide_deck";
      firstSlideId: string | null;
    })
  | (ProductBase & {
      type: "report";
      hasEmbeds: boolean;
    });

export type ProductSortMode = "recent" | "label";

export function productScope(product: ProductBase): PackageScope {
  return { runId: product.runId, adminArea2: product.adminArea2 };
}
