// Contract: the PRODUCTS AND FOLDERS block in
// server/db/instance/_main_database.sql.

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
  adminArea2: string | null;
  // null = pre-restructure row (no invented provenance at consolidation).
  createdBy: string | null;
  createdAt: string | null;
  // The product version (see the SQL contract); keys the detail cache.
  lastUpdated: string;
};

// What the Products page renders and what rides the instance SSE channel:
// what a product IS, plus one cheap per-type existence flag. Content
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

export function productScope(product: ProductBase): PackageScope {
  return { runId: product.runId, adminArea2: product.adminArea2 };
}
