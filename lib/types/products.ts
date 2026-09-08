// A product is a slide deck or a report. `products` is the registry every
// cross-type operation goes through (list, folder move, delete, package
// reattach, "in use by", the id namespace); the per-type detail tables hang
// off it by the same id. Folders nest through `parentId` (an adjacency list;
// the path is derived by walking up, never stored). A product lives in
// exactly one folder or none.
//
// `createdBy` and `createdAt` are provenance, not ownership: nothing reads
// them for access, and a later owner role comes from an ACL table.

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
  // THE product version: every content mutation and every metadata write
  // bumps it in the same transaction. Keys the detail cache.
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
