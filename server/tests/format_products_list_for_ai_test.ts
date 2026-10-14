// Pins the rows `list_products` returns: each product names its folder path,
// package, scope and the user's level, and a package no longer ready is named
// by its run id.
//
//   deno test -A --no-check server/tests/format_products_list_for_ai_test.ts

import { assert, assertStringIncludes } from "@std/assert";
import { formatProductsListForAI } from "../../lib/ai_tools/format_products_list_for_ai.ts";
import type {
  Folder,
  ProductAccess,
  ProductBase,
  ProductSummary,
} from "../../lib/types/products.ts";
import { ALL_DATA_SCOPE_ID } from "../../lib/types/scope.ts";

const FOLDERS: Folder[] = [
  {
    id: "f_reports",
    label: "Reports",
    color: null,
    parentId: null,
    createdBy: null,
    createdAt: null,
    lastUpdated: "1",
  },
  {
    id: "f_2026",
    label: "2026",
    color: null,
    parentId: "f_reports",
    createdBy: null,
    createdAt: null,
    lastUpdated: "1",
  },
];

function product(
  overrides: Partial<ProductBase & ProductAccess> & { id: string },
): ProductSummary {
  return {
    type: "report",
    hasEmbeds: false,
    label: `Product ${overrides.id}`,
    folderId: null,
    runId: "run_a",
    scopeId: ALL_DATA_SCOPE_ID,
    createdBy: null,
    createdAt: null,
    lastUpdated: "1",
    owner: null,
    defaultAccess: "view",
    grants: [],
    ...overrides,
  };
}

const USER = { email: "ana@example.org", isGlobalAdmin: false };
const READY = [{ id: "run_a", label: "Package Jan 2026" }];
const SCOPES = [{ id: ALL_DATA_SCOPE_ID, label: "All data" }];

function line(text: string, id: string): string {
  const match = text.split("\n").find((l) => l.includes(`id: ${id}`));
  assert(match !== undefined, `no row for ${id} in:\n${text}`);
  return match;
}

Deno.test("a product row names its folder path, package, scope and level", () => {
  const text = formatProductsListForAI({
    products: [
      product({
        id: "p_nested",
        label: "Annual review",
        folderId: "f_2026",
        grants: [{ email: USER.email, level: "edit" }],
      }),
      product({ id: "p_root", label: "Root deck" }),
    ],
    folders: FOLDERS,
    readyPackages: READY,
    scopes: SCOPES,
    user: USER,
  });
  const nested = line(text, "p_nested");
  assertStringIncludes(nested, "Annual review | report");
  assertStringIncludes(nested, "folder: Reports / 2026");
  assertStringIncludes(nested, "package: Package Jan 2026");
  assertStringIncludes(nested, "scope: All data");
  assertStringIncludes(nested, "your level: edit");
  const root = line(text, "p_root");
  assertStringIncludes(root, "folder: General (top level)");
  assertStringIncludes(root, "your level: view");
});

Deno.test("a product on a package that is no longer ready names its run id", () => {
  const text = formatProductsListForAI({
    products: [product({ id: "p_old", runId: "run_gone" })],
    folders: [],
    readyPackages: READY,
    scopes: SCOPES,
    user: USER,
  });
  assertStringIncludes(
    line(text, "p_old"),
    "package: not ready (run run_gone)",
  );
});
