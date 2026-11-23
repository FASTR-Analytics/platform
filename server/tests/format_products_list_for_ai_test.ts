// Pins the rows `list_products` returns: each product names its folder path,
// package, scope and the user's level, and a package no longer ready is named
// by its run id; the record pages it writes; and its search over a product's
// label, folder path and package label.
//
//   deno test -A --no-check server/tests/format_products_list_for_ai_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { formatProductsListForAI } from "../../lib/ai_tools/format_products_list_for_ai.ts";
import { AI_RECORD_PAGE_MAX } from "../../lib/ai_tools/read_bounds.ts";
import type { ProductAccess } from "../../lib/permissions/mod.ts";
import type {
  Folder,
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
    teamGrants: [],
    grants: [],
    ...overrides,
  };
}

const USER = { email: "ana@example.org", isGlobalAdmin: false, teamIds: [] };
const READY = [{ id: "run_a", label: "Package Jan 2026" }];
const SCOPES = [{ id: ALL_DATA_SCOPE_ID, label: "All data" }];

function line(text: string, id: string): string {
  const match = text.split("\n").find((l) => l.includes(`id: ${id}`));
  assert(match !== undefined, `no row for ${id} in:\n${text}`);
  return match;
}

const NESTED_AND_ROOT = {
  products: [
    product({
      id: "p_nested",
      label: "Annual review",
      folderId: "f_2026",
      grants: [{ email: USER.email, level: "edit" }],
    }),
    product({ id: "p_root", label: "Root deck", runId: "run_b" }),
  ],
  folders: FOLDERS,
  readyPackages: [...READY, { id: "run_b", label: "Package Mar 2026" }],
  scopes: SCOPES,
  user: USER,
};

Deno.test("a product row names its folder path, package, scope and level", () => {
  const text = formatProductsListForAI(NESTED_AND_ROOT, {});
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
  }, {});
  assertStringIncludes(
    line(text, "p_old"),
    "package: not ready (run run_gone)",
  );
});

// The tool lists the products the user can see as the Products page shows
// them, so a saved visualization is a row like a deck or a report.
Deno.test("a saved visualization is listed like any other product", () => {
  const visualization: ProductSummary = {
    ...product({ id: "p_viz", label: "ANC coverage map" }),
    type: "visualization",
    resolvedUnder: null,
  };
  const text = formatProductsListForAI({
    products: [visualization, product({ id: "p_report" })],
    folders: [],
    readyPackages: READY,
    scopes: SCOPES,
    user: USER,
  }, {});
  assertStringIncludes(
    text,
    "\n2 of 2 products. Written: products 1 to 2 of 2.\n",
  );
  assertStringIncludes(
    line(text, "p_viz"),
    "- ANC coverage map | saved visualization",
  );
});

function manyProducts(n: number) {
  return {
    products: Array.from(
      { length: n },
      (_, i) => product({ id: `p${String(i + 1).padStart(3, "0")}` }),
    ),
    folders: [],
    readyPackages: READY,
    scopes: SCOPES,
    user: USER,
  };
}

function rowIds(text: string): string[] {
  return text.split("\n").flatMap((l) => {
    const id = l.match(/\| id: (\S+)$/);
    return id === null ? [] : [id[1]];
  });
}

Deno.test("a page writes at most a page of products and names the next offset", () => {
  const n = AI_RECORD_PAGE_MAX + 1;
  const first = formatProductsListForAI(manyProducts(n), {});
  assertStringIncludes(
    first,
    `\n${n} of ${n} products. Written: products 1 to ${AI_RECORD_PAGE_MAX} of ${n}. The next page is offset ${AI_RECORD_PAGE_MAX}.\n`,
  );
  assertEquals(rowIds(first).length, AI_RECORD_PAGE_MAX);
  const second = formatProductsListForAI(manyProducts(n), {
    offset: AI_RECORD_PAGE_MAX,
  });
  assertStringIncludes(
    second,
    `\n${n} of ${n} products. Written: products ${n} to ${n} of ${n}.\n`,
  );
  assertEquals(rowIds(second), [`p${n}`]);
});

Deno.test("search finds products by label, folder path and package label", () => {
  const cases: [string, string[]][] = [
    ["annual", ["p_nested"]],
    ["reports 2026", ["p_nested"]],
    ["mar", ["p_root"]],
    ["2026", ["p_nested", "p_root"]],
  ];
  for (const [search, ids] of cases) {
    const text = formatProductsListForAI(NESTED_AND_ROOT, { search });
    assertStringIncludes(
      text,
      `\n${ids.length} of 2 products match "${search}". `,
    );
    assertEquals(rowIds(text).toSorted(), ids, search);
  }
});

Deno.test("a search with no match writes the counts and no product", () => {
  const text = formatProductsListForAI(NESTED_AND_ROOT, { search: "malaria" });
  assertStringIncludes(
    text,
    '\n0 of 2 products match "malaria". No products to write.',
  );
  assertEquals(rowIds(text), []);
});
