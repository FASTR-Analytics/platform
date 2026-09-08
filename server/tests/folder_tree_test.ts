// Harness for PLAN_PRODUCTS_RESTRUCTURE step 7b's folder derivations: children,
// ancestors, path labels, descendant sets and picker options, each also run
// over a tree with a deliberately corrupted cycle, where the requirement is
// that the walk terminates. The client module's only import is a type, so it
// loads under Deno as it is.
//
//   deno test -A --env-file server/tests/folder_tree_test.ts

import { assertEquals } from "@std/assert";
import type { Folder } from "lib";
import {
  ancestors,
  childFolders,
  descendantIds,
  folderPathLabels,
  folderPathOptions,
} from "../../client/src/components/products/folder_tree.ts";

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

Deno.test("ancestors: root first, excludes the folder itself", () => {
  assertEquals(
    ancestors(TREE, "c").map((f) => f.id),
    ["a", "b"],
  );
  assertEquals(ancestors(TREE, "a"), []);
});

Deno.test("ancestors: a missing parent ends the chain", () => {
  const orphan = [folder("x", "Ex", "gone")];
  assertEquals(ancestors(orphan, "x"), []);
});

Deno.test("ancestors: a cycle terminates", () => {
  const chain = ancestors(CYCLE, "b").map((f) => f.id);
  assertEquals(new Set(chain).size, chain.length);
  assertEquals(chain.includes("b"), false);
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
