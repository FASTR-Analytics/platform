import type { Folder, ProductSummary } from "lib";

// Pure derivations over the flat T1 `Folder[]` (D16): the tree is derived
// where it is needed and never mutated into state. The server refuses cycles
// inside the move transaction, but these run in the render path, so every walk
// carries a visited set and terminates on malformed data rather than hanging.
//
// The type imports are the only dependency, so server/tests/folder_tree_test.ts
// loads this module under Deno as it is.

const _PATH_SEPARATOR = " › ";

// The root, drawn as one synthetic folder row named General that holds the
// products with `folderId: null`. It is not a `Folder`: no row, no colour, no
// menu, and the root folders are its siblings. Also the picker value for
// "move to the root".
export const GENERAL_ID = "_general";

export function childFolders(
  folders: Folder[],
  parentId: string | null,
): Folder[] {
  return folders.filter((f) => f.parentId === parentId);
}

// Every folder's full path, in one pass with a shared cache: the move picker
// labels every row at once, and one walk per row would be quadratic in the
// folder count.
export function folderPathLabels(folders: Folder[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const labels = new Map<string, string>();

  function resolve(folderId: string, visited: Set<string>): string {
    const cached = labels.get(folderId);
    if (cached !== undefined) return cached;
    const folder = byId.get(folderId);
    if (folder === undefined) return "";
    // A cycle stops at its own label rather than caching a path that would
    // depend on which folder the walk started from.
    if (visited.has(folderId)) return folder.label;
    visited.add(folderId);
    const parentPath =
      folder.parentId === null ? "" : resolve(folder.parentId, visited);
    const label =
      parentPath === ""
        ? folder.label
        : `${parentPath}${_PATH_SEPARATOR}${folder.label}`;
    labels.set(folderId, label);
    return label;
  }

  for (const folder of folders) resolve(folder.id, new Set());
  return labels;
}

// Every folder inside the subtree, excluding the folder itself.
export function descendantIds(
  folders: Folder[],
  folderId: string,
): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    if (f.parentId === null) continue;
    const siblings = childrenOf.get(f.parentId);
    if (siblings === undefined) {
      childrenOf.set(f.parentId, [f.id]);
    } else {
      siblings.push(f.id);
    }
  }
  const result = new Set<string>();
  const stack = [folderId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const childId of childrenOf.get(id) ?? []) {
      if (childId === folderId || result.has(childId)) continue;
      result.add(childId);
      stack.push(childId);
    }
  }
  return result;
}

// The flat full-path option list the move picker renders, sorted by path
// (D16). `excludeSubtree` drops a moved folder and its descendants: they are
// the illegal targets, and the server's FOLDER_CYCLE stays the authority.
export function folderPathOptions(
  folders: Folder[],
  opts: { excludeSubtree?: string },
): { value: string; label: string }[] {
  const excluded =
    opts.excludeSubtree === undefined
      ? new Set<string>()
      : new Set([
          opts.excludeSubtree,
          ...descendantIds(folders, opts.excludeSubtree),
        ]);
  const labels = folderPathLabels(folders);
  return folders
    .filter((f) => !excluded.has(f.id))
    .map((f) => ({ value: f.id, label: labels.get(f.id) ?? f.label }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
}

export type RootItem =
  | { kind: "folder"; folder: Folder }
  | { kind: "general"; lastUpdated: string };

// The list view's tree: only the folders and products that pass the filters,
// grouped by parent and sorted per level.
export type ProductTree = {
  // The root level in order: the root folders and, when the root holds shown
  // products, General, sorted together as one list.
  root: RootItem[];
  // A folder's shown subfolders, sorted.
  folders: Map<string, Folder[]>;
  // Shown products per folder, sorted; null holds the root's.
  products: Map<string | null, ProductSummary[]>;
  // The date a folder shows and sorts by: the newest of its own and of
  // everything inside it, filtered or not. GENERAL_ID holds the root
  // products' newest.
  dates: Map<string, string>;
  // Folders with a search match somewhere below them, and GENERAL_ID when a
  // root product matches: open while the search is active, whatever the user
  // has open otherwise.
  matchAncestors: Set<string>;
  // Shown folders and products whose own label matches the search.
  matchCount: number;
};

type Sortable = { label: string; lastUpdated: string };

// ISO 8601 timestamps, so the newer one is the greater string.
function later(a: string | undefined, b: string): string {
  return a === undefined || b > a ? b : a;
}

// While searching, a product is shown when its label matches or it sits under
// a folder whose label matches. A folder is shown when it holds anything
// shown, or when it is not searching or matches (itself or through an
// ancestor).
export function buildProductTree(args: {
  folders: Folder[];
  products: ProductSummary[];
  // Lowercased search text, or null when not searching.
  needle: string | null;
  // General's label in the user's language: it sorts by it among the root
  // folders. Passed in so this module stays type-import-only.
  generalLabel: string;
  sort: <T extends Sortable>(items: T[]) => T[];
}): ProductTree {
  const { needle } = args;
  const matches = (label: string) =>
    needle !== null && label.toLowerCase().includes(needle);
  const foldersByParent = groupBy(args.folders, (f) => f.parentId);
  const productsByFolder = groupBy(args.products, (p) => p.folderId);
  const tree: ProductTree = {
    root: [],
    folders: new Map(),
    products: new Map(),
    dates: new Map(),
    matchAncestors: new Set(),
    matchCount: 0,
  };
  const visited = new Set<string>();

  const dateOf = (folder: Folder) =>
    tree.dates.get(folder.id) ?? folder.lastUpdated;
  const sortFolders = (folders: Folder[]): Folder[] =>
    args
      .sort(
        folders.map((folder) => ({
          label: folder.label,
          lastUpdated: dateOf(folder),
          folder,
        })),
      )
      .map((entry) => entry.folder);

  // Returns whether anything shown inside `parentId` is itself a match, and
  // the newest date of everything inside, shown or not.
  function visit(
    parentId: string | null,
    underMatch: boolean,
  ): { match: boolean; newest: string | undefined } {
    const allProducts = productsByFolder.get(parentId) ?? [];
    const shownProducts = allProducts.filter(
      (p) => needle === null || underMatch || matches(p.label),
    );
    const matchedProducts = shownProducts.filter((p) => matches(p.label));
    tree.matchCount += matchedProducts.length;
    let containsMatch = matchedProducts.length > 0;
    if (parentId === null && containsMatch) tree.matchAncestors.add(GENERAL_ID);
    let newest: string | undefined;
    for (const p of allProducts) newest = later(newest, p.lastUpdated);
    const productsNewest = newest;
    const shownFolders: Folder[] = [];
    for (const folder of foldersByParent.get(parentId) ?? []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      const selfMatch = matches(folder.label);
      const inner = visit(folder.id, underMatch || selfMatch);
      const date = later(inner.newest, folder.lastUpdated);
      tree.dates.set(folder.id, date);
      newest = later(newest, date);
      const hasContents =
        (tree.folders.get(folder.id)?.length ?? 0) > 0 ||
        (tree.products.get(folder.id)?.length ?? 0) > 0;
      const eligible = needle === null || underMatch || selfMatch;
      if (!eligible && !hasContents) continue;
      shownFolders.push(folder);
      if (selfMatch) tree.matchCount += 1;
      if (inner.match) tree.matchAncestors.add(folder.id);
      containsMatch ||= selfMatch || inner.match;
    }
    if (parentId === null) {
      const entries: (Sortable & { item: RootItem })[] = shownFolders.map(
        (folder) => ({
          label: folder.label,
          lastUpdated: dateOf(folder),
          item: { kind: "folder", folder },
        }),
      );
      if (shownProducts.length > 0 && productsNewest !== undefined) {
        tree.dates.set(GENERAL_ID, productsNewest);
        entries.push({
          label: args.generalLabel,
          lastUpdated: productsNewest,
          item: { kind: "general", lastUpdated: productsNewest },
        });
      }
      tree.root = args.sort(entries).map((entry) => entry.item);
    } else if (shownFolders.length > 0) {
      tree.folders.set(parentId, sortFolders(shownFolders));
    }
    if (shownProducts.length > 0) {
      tree.products.set(parentId, args.sort(shownProducts));
    }
    return { match: containsMatch, newest };
  }

  visit(null, false);
  return tree;
}

export type ProductTreeRow =
  | {
      kind: "folder";
      folder: Folder;
      depth: number;
      expanded: boolean;
      hasContents: boolean;
      // The tree's date for the folder, not the folder's own.
      lastUpdated: string;
    }
  | { kind: "general"; expanded: boolean; lastUpdated: string }
  | { kind: "product"; product: ProductSummary; depth: number };

// The rows on screen, top to bottom: at each level the folders, each followed
// by its contents when open, then the products. At the root the products sit
// under the General row instead, which takes its place among the folders.
export function productTreeRows(
  tree: ProductTree,
  isExpanded: (folderId: string) => boolean,
): ProductTreeRow[] {
  const rows: ProductTreeRow[] = [];
  function pushProducts(parentId: string | null, depth: number) {
    for (const product of tree.products.get(parentId) ?? []) {
      rows.push({ kind: "product", product, depth });
    }
  }
  function walk(parentId: string | null, depth: number) {
    const items: RootItem[] =
      parentId === null
        ? tree.root
        : (tree.folders.get(parentId) ?? []).map((folder) => ({
            kind: "folder",
            folder,
          }));
    for (const item of items) {
      if (item.kind === "general") {
        const expanded = isExpanded(GENERAL_ID);
        rows.push({ kind: "general", expanded, lastUpdated: item.lastUpdated });
        if (expanded) pushProducts(null, depth + 1);
        continue;
      }
      const { folder } = item;
      const hasContents =
        tree.folders.has(folder.id) || tree.products.has(folder.id);
      const expanded = hasContents && isExpanded(folder.id);
      rows.push({
        kind: "folder",
        folder,
        depth,
        expanded,
        hasContents,
        lastUpdated: tree.dates.get(folder.id) ?? folder.lastUpdated,
      });
      if (expanded) walk(folder.id, depth + 1);
    }
    if (parentId !== null) pushProducts(parentId, depth);
  }
  walk(null, 0);
  return rows;
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string | null,
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group === undefined) {
      groups.set(k, [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}
