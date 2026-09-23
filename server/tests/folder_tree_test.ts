// Harness for PLAN_PRODUCTS_RESTRUCTURE step 7b's folder derivations: children,
// path labels, descendant sets and picker options, each also run
// over a tree with a deliberately corrupted cycle, where the requirement is
// that the walk terminates. The client module's only import is a type, so it
// loads under Deno as it is.
//
//   deno test -A --env-file server/tests/folder_tree_test.ts

import { assertEquals } from "@std/assert";
import type { Folder, ProductSummary, ProductType } from "lib";
import {
  buildProductTree,
  childFolders,
  descendantIds,
  folderPathLabels,
  folderPathOptions,
  productTreeRows,
} from "../../client/src/components/products/_shared/folder_tree.ts";

function folder(id: string, label: string, parentId: string | null): Folder {
  return {
    id,
    label,
    color: null,
    parentId,
    createdBy: null,
    createdAt: null,
    lastUpdated: "2026-01-01T00:00:00.000Z",
  };
}

function product(
  id: string,
  label: string,
  folderId: string | null,
  type: ProductType = "slide_deck",
): ProductSummary {
  const base = {
    id,
    label,
    folderId,
    runId: "run",
    adminArea2: null,
    createdBy: null,
    createdAt: null,
    lastUpdated: "2026-01-01T00:00:00.000Z",
  };
  return type === "slide_deck"
    ? { ...base, type, firstSlideId: null }
    : { ...base, type, hasEmbeds: false };
}

// a > b > c, plus a sibling root d. "zebra" sorts last by path everywhere.
const TREE: Folder[] = [
  folder("a", "Alpha", null),
  folder("b", "Bravo", "a"),
  folder("c", "Charlie", "b"),
  folder("d", "zebra", null),
];

// The same tree with b's parent repointed at its own grandchild: a > b > c > b.
const CYCLE: Folder[] = [
  folder("a", "Alpha", null),
  folder("b", "Bravo", "c"),
  folder("c", "Charlie", "b"),
  folder("d", "zebra", null),
];

Deno.test("children: direct children only, roots under null", () => {
  assertEquals(
    childFolders(TREE, null).map((f) => f.id),
    ["a", "d"],
  );
  assertEquals(
    childFolders(TREE, "a").map((f) => f.id),
    ["b"],
  );
  assertEquals(childFolders(TREE, "c"), []);
});

Deno.test("children: a cycle returns both members' children, not a walk", () => {
  assertEquals(
    childFolders(CYCLE, null).map((f) => f.id),
    ["a", "d"],
  );
  assertEquals(
    childFolders(CYCLE, "b").map((f) => f.id),
    ["c"],
  );
  assertEquals(
    childFolders(CYCLE, "c").map((f) => f.id),
    ["b"],
  );
});

Deno.test("path labels: full path per folder", () => {
  const labels = folderPathLabels(TREE);
  assertEquals(labels.get("a"), "Alpha");
  assertEquals(labels.get("b"), "Alpha › Bravo");
  assertEquals(labels.get("c"), "Alpha › Bravo › Charlie");
  assertEquals(labels.get("d"), "zebra");
});

Deno.test("path labels: a cycle terminates and every folder is labelled", () => {
  const labels = folderPathLabels(CYCLE);
  assertEquals(labels.size, CYCLE.length);
  assertEquals(labels.get("a"), "Alpha");
  assertEquals(labels.get("d"), "zebra");
});

Deno.test("descendants: whole subtree, excluding the folder itself", () => {
  assertEquals(descendantIds(TREE, "a"), new Set(["b", "c"]));
  assertEquals(descendantIds(TREE, "b"), new Set(["c"]));
  assertEquals(descendantIds(TREE, "c"), new Set());
  assertEquals(descendantIds(TREE, "d"), new Set());
});

Deno.test("descendants: a cycle terminates and never returns the root", () => {
  assertEquals(descendantIds(CYCLE, "b"), new Set(["c"]));
  assertEquals(descendantIds(CYCLE, "a"), new Set());
});

Deno.test("picker options: full paths sorted by path", () => {
  assertEquals(folderPathOptions(TREE, {}), [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Alpha › Bravo" },
    { value: "c", label: "Alpha › Bravo › Charlie" },
    { value: "d", label: "zebra" },
  ]);
});

Deno.test("picker options: a moved folder's own subtree is excluded", () => {
  assertEquals(
    folderPathOptions(TREE, { excludeSubtree: "a" }).map((o) => o.value),
    ["d"],
  );
  assertEquals(
    folderPathOptions(TREE, { excludeSubtree: "b" }).map((o) => o.value),
    ["a", "d"],
  );
});

Deno.test("picker options: a cycle terminates and excludes its members", () => {
  assertEquals(
    folderPathOptions(CYCLE, { excludeSubtree: "b" }).map((o) => o.value),
    ["a", "d"],
  );
});

// p1 in a, p2 in c, r1 (a report) in b, p3 at the top level.
const PRODUCTS: ProductSummary[] = [
  product("p1", "Annual deck", "a"),
  product("p2", "Quarterly deck", "c"),
  product("r1", "Budget report", "b", "report"),
  product("p3", "Loose deck", null),
];

const byLabel = <T extends { label: string }>(xs: T[]) =>
  [...xs].sort((x, y) => x.label.localeCompare(y.label));

function tree(
  opts: { typeFilter?: ProductType; needle?: string; folders?: Folder[] } = {},
) {
  return buildProductTree({
    folders: opts.folders ?? TREE,
    products: PRODUCTS,
    typeFilter: opts.typeFilter ?? null,
    needle: opts.needle ?? null,
    sortFolders: byLabel,
    sortProducts: byLabel,
  });
}

function rowIds(t: ReturnType<typeof tree>, open: string[]): string[] {
  return productTreeRows(t, (id) => open.includes(id)).map((r) =>
    r.kind === "folder"
      ? `${"  ".repeat(r.depth)}${r.folder.id}`
      : `${"  ".repeat(r.depth)}${r.product.id}`
  );
}

Deno.test("tree rows: folders first per level, contents only when open", () => {
  assertEquals(rowIds(tree(), []), ["a", "d", "p3"]);
  assertEquals(rowIds(tree(), ["a", "b"]), [
    "a",
    "  b",
    "    c",
    "    r1",
    "  p1",
    "d",
    "p3",
  ]);
  assertEquals(rowIds(tree(), ["b"]), ["a", "d", "p3"]);
});

Deno.test("tree rows: an empty folder is shown but has no contents to open", () => {
  const rows = productTreeRows(tree(), () => true);
  const d = rows.find((r) => r.kind === "folder" && r.folder.id === "d");
  assertEquals(d?.kind === "folder" && [d.hasContents, d.expanded], [
    false,
    false,
  ]);
});

Deno.test("tree: a type filter hides folders with nothing of that type inside", () => {
  assertEquals(rowIds(tree({ typeFilter: "report" }), ["a", "b"]), [
    "a",
    "  b",
    "    r1",
  ]);
});

Deno.test("tree: search keeps matches in place and opens their ancestors", () => {
  const t = tree({ needle: "charlie" });
  assertEquals(t.matchAncestors, new Set(["a", "b"]));
  assertEquals(t.matchCount, 1);
  assertEquals(rowIds(t, [...t.matchAncestors]), ["a", "  b", "    c"]);
  assertEquals(rowIds(t, [...t.matchAncestors, "c"]), [
    "a",
    "  b",
    "    c",
    "      p2",
  ]);
});

Deno.test("tree: a folder that matches shows all its contents, closed", () => {
  const t = tree({ needle: "bravo" });
  assertEquals(t.matchAncestors, new Set(["a"]));
  assertEquals(rowIds(t, ["a", "b", "c"]), [
    "a",
    "  b",
    "    c",
    "      p2",
    "    r1",
  ]);
});

Deno.test("tree: a search with no match shows nothing", () => {
  assertEquals(rowIds(tree({ needle: "nothing" }), []), []);
});

Deno.test("tree: a cycle is unreachable from the top level and terminates", () => {
  assertEquals(rowIds(tree({ folders: CYCLE }), ["a", "b", "c"]), [
    "a",
    "  p1",
    "d",
    "p3",
  ]);
});

Deno.test("tree: a product match opens every folder above it", () => {
  const t = tree({ needle: "quarterly" });
  assertEquals(t.matchAncestors, new Set(["a", "b", "c"]));
  assertEquals(t.matchCount, 1);
  assertEquals(rowIds(t, [...t.matchAncestors]), [
    "a",
    "  b",
    "    c",
    "      p2",
  ]);
});
