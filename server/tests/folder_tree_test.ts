// The product explorer's folder derivations: children, path labels,
// descendant sets, picker options, the filtered tree and its rows (with the
// synthetic General row over the root products) and the drop rule, each also
// run over a tree with a deliberately corrupted cycle, where the requirement
// is that the walk terminates. The client module's only import is a type, so it loads under
// Deno as it is.
//
//   deno test -A --env-file server/tests/folder_tree_test.ts

import { assertEquals } from "@std/assert";
import {
  ALL_DATA_SCOPE_ID,
  type Folder,
  type ProductBase,
  type ProductSummary,
  type ProductType,
} from "lib";
import {
  buildProductTree,
  childFolders,
  descendantIds,
  type DragItem,
  dropParent,
  type DropTarget,
  folderDragItem,
  folderPathLabels,
  folderPathOptions,
  GENERAL_ID,
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
  lastUpdated = "2026-01-01T00:00:00.000Z",
): ProductSummary {
  const base: ProductBase = {
    id,
    label,
    folderId,
    runId: "run",
    scopeId: ALL_DATA_SCOPE_ID,
    createdBy: null,
    createdAt: null,
    lastUpdated,
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

const byDateDesc = <T extends { lastUpdated: string }>(xs: T[]) =>
  [...xs].sort((x, y) => y.lastUpdated.localeCompare(x.lastUpdated));

function tree(
  opts: {
    needle?: string;
    folders?: Folder[];
    products?: ProductSummary[];
    sort?: <T extends { label: string; lastUpdated: string }>(xs: T[]) => T[];
  } = {},
) {
  return buildProductTree({
    folders: opts.folders ?? TREE,
    products: opts.products ?? PRODUCTS,
    matches: opts.needle === undefined
      ? null
      : (label) => label.toLowerCase().includes(opts.needle ?? ""),
    generalLabel: "General",
    sort: opts.sort ?? byLabel,
  });
}

function rowIds(t: ReturnType<typeof tree>, open: string[]): string[] {
  return productTreeRows(t, (id) => open.includes(id)).map((r) =>
    r.kind === "folder"
      ? `${"  ".repeat(r.depth)}${r.folder.id}`
      : r.kind === "general"
      ? "G"
      : `${"  ".repeat(r.depth)}${r.product.id}`
  );
}

Deno.test("tree rows: folders first per level, contents only when open", () => {
  assertEquals(rowIds(tree(), []), ["a", "G", "d"]);
  assertEquals(rowIds(tree(), ["a", "b", GENERAL_ID]), [
    "a",
    "  b",
    "    c",
    "    r1",
    "  p1",
    "G",
    "  p3",
    "d",
  ]);
  assertEquals(rowIds(tree(), ["b"]), ["a", "G", "d"]);
});

Deno.test("tree rows: General holds the root products, sorted among the root folders, only when there are some", () => {
  assertEquals(rowIds(tree(), [GENERAL_ID]), ["a", "G", "  p3", "d"]);
  const filed = PRODUCTS.filter((p) => p.folderId !== null);
  assertEquals(rowIds(tree({ products: filed }), [GENERAL_ID]), ["a", "d"]);
  assertEquals(rowIds(tree({ products: filed }), ["a", "b", "c"]), [
    "a",
    "  b",
    "    c",
    "      p2",
    "    r1",
    "  p1",
    "d",
  ]);
});

Deno.test("tree rows: an empty folder is shown but has no contents to open", () => {
  const rows = productTreeRows(tree(), () => true);
  const d = rows.find((r) => r.kind === "folder" && r.folder.id === "d");
  assertEquals(d?.kind === "folder" && [d.hasContents, d.expanded], [
    false,
    false,
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

Deno.test("tree: a root product match opens General, and a folder match does not", () => {
  const t = tree({ needle: "loose" });
  assertEquals(t.matchAncestors, new Set([GENERAL_ID]));
  assertEquals(t.matchCount, 1);
  assertEquals(rowIds(t, [...t.matchAncestors]), ["G", "  p3"]);
  assertEquals(
    tree({ needle: "charlie" }).matchAncestors.has(GENERAL_ID),
    false,
  );
});

Deno.test("tree: a cycle is unreachable from the top level and terminates", () => {
  assertEquals(rowIds(tree({ folders: CYCLE }), ["a", "b", "c", GENERAL_ID]), [
    "a",
    "  p1",
    "G",
    "  p3",
    "d",
  ]);
});

Deno.test("dates: a folder's is the newest inside it, General's the root products', and Recent sorts by them", () => {
  const dated: ProductSummary[] = [
    product("p1", "Annual deck", "a"),
    product(
      "p2",
      "Quarterly deck",
      "c",
      "slide_deck",
      "2026-03-01T00:00:00.000Z",
    ),
    product("r1", "Budget report", "b", "report"),
    product("p3", "Loose deck", null, "slide_deck", "2026-02-01T00:00:00.000Z"),
  ];
  const t = tree({ products: dated, sort: byDateDesc });
  assertEquals(t.dates.get("c"), "2026-03-01T00:00:00.000Z");
  assertEquals(t.dates.get("b"), "2026-03-01T00:00:00.000Z");
  assertEquals(t.dates.get("a"), "2026-03-01T00:00:00.000Z");
  assertEquals(t.dates.get("d"), "2026-01-01T00:00:00.000Z");
  assertEquals(t.dates.get(GENERAL_ID), "2026-02-01T00:00:00.000Z");
  assertEquals(rowIds(t, [GENERAL_ID]), ["a", "G", "  p3", "d"]);
  const rows = productTreeRows(t, () => false);
  assertEquals(
    rows.map((r) => (r.kind === "product" ? undefined : r.lastUpdated)),
    [
      "2026-03-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ],
  );
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

function dragFolder(folders: Folder[], id: string): DragItem {
  const f = folders.find((x) => x.id === id);
  if (f === undefined) throw new Error(id);
  return folderDragItem(folders, f);
}

// p1 sits in a; p3 at the root.
const P1_DRAG: DragItem = { kind: "product", id: "p1", parentId: "a" };
const P3_DRAG: DragItem = { kind: "product", id: "p3", parentId: null };

const GENERAL: DropTarget = { kind: "general" };
const ROOT: DropTarget = { kind: "root" };
const into = (folderId: string): DropTarget => ({ kind: "folder", folderId });

Deno.test("drop: a product goes into another folder, not its own", () => {
  assertEquals(dropParent(P1_DRAG, into("d")), "d");
  assertEquals(dropParent(P1_DRAG, into("b")), "b");
  assertEquals(dropParent(P1_DRAG, into("a")), undefined);
});

Deno.test("drop: a product in a folder goes to the root by General or the root zone, and one at the root by neither", () => {
  assertEquals(dropParent(P1_DRAG, GENERAL), null);
  assertEquals(dropParent(P1_DRAG, ROOT), null);
  assertEquals(dropParent(P3_DRAG, GENERAL), undefined);
  assertEquals(dropParent(P3_DRAG, ROOT), undefined);
});

Deno.test("drop: a folder goes into a sibling, never itself, a descendant or its own parent", () => {
  const withSibling = [...TREE, folder("e", "Echo", "a")];
  const b = dragFolder(withSibling, "b");
  assertEquals(dropParent(b, into("e")), "e");
  assertEquals(dropParent(b, into("b")), undefined);
  assertEquals(dropParent(b, into("c")), undefined);
  assertEquals(dropParent(b, into("a")), undefined);
});

Deno.test("drop: a folder never goes onto General, and reaches the root zone only from inside a folder", () => {
  const b = dragFolder(TREE, "b");
  assertEquals(dropParent(b, GENERAL), undefined);
  assertEquals(dropParent(b, ROOT), null);
  const a = dragFolder(TREE, "a");
  assertEquals(dropParent(a, GENERAL), undefined);
  assertEquals(dropParent(a, ROOT), undefined);
});

Deno.test("drag item: a folder carries its subtree, and a cycle terminates", () => {
  assertEquals(dragFolder(TREE, "a"), {
    kind: "folder",
    id: "a",
    parentId: null,
    subtree: new Set(["b", "c"]),
  });
  assertEquals(dragFolder(CYCLE, "b"), {
    kind: "folder",
    id: "b",
    parentId: "c",
    subtree: new Set(["c"]),
  });
});
