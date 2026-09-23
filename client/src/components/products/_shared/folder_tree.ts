import type { Folder, ProductSummary, ProductType } from "lib";

// Pure derivations over the flat T1 `Folder[]` (D16): the tree is derived
// where it is needed and never mutated into state. The server refuses cycles
// inside the move transaction, but these run in the render path, so every walk
// carries a visited set and terminates on malformed data rather than hanging.
//
// The type imports are the only dependency, so server/tests/folder_tree_test.ts
// loads this module under Deno as it is.

const _PATH_SEPARATOR = " › ";

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

// The list view's tree: only the folders and products that pass the filters,
// grouped by parent (null = the top level) and sorted per level.
export type ProductTree = {
  folders: Map<string | null, Folder[]>;
  products: Map<string | null, ProductSummary[]>;
  // Folders with a search match somewhere below them: open while the search
  // is active, whatever the user has open otherwise.
  matchAncestors: Set<string>;
  // Shown folders and products whose own label matches the search.
  matchCount: number;
};

// A product is shown when it passes the type filter and, while searching,
// when its label matches or it sits under a folder whose label matches. A
// folder is shown when it holds anything shown, or, with no type filter, when
// it is not searching or matches (itself or through an ancestor). So a type
// filter hides folders with nothing of that type anywhere inside them.
export function buildProductTree(args: {
  folders: Folder[];
  products: ProductSummary[];
  typeFilter: ProductType | null;
  // Lowercased search text, or null when not searching.
  needle: string | null;
  sortFolders: (folders: Folder[]) => Folder[];
  sortProducts: (products: ProductSummary[]) => ProductSummary[];
}): ProductTree {
  const { needle, typeFilter } = args;
  const matches = (label: string) =>
    needle !== null && label.toLowerCase().includes(needle);
  const foldersByParent = groupBy(args.folders, (f) => f.parentId);
  const productsByFolder = groupBy(args.products, (p) => p.folderId);
  const tree: ProductTree = {
    folders: new Map(),
    products: new Map(),
    matchAncestors: new Set(),
    matchCount: 0,
  };
  const visited = new Set<string>();

  // Returns whether anything shown inside `parentId` is itself a match.
  function visit(parentId: string | null, underMatch: boolean): boolean {
    const shownProducts = (productsByFolder.get(parentId) ?? []).filter(
      (p) =>
        (typeFilter === null || p.type === typeFilter) &&
        (needle === null || underMatch || matches(p.label)),
    );
    const matchedProducts = shownProducts.filter((p) => matches(p.label));
    tree.matchCount += matchedProducts.length;
    let containsMatch = matchedProducts.length > 0;
    const shownFolders: Folder[] = [];
    for (const folder of foldersByParent.get(parentId) ?? []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      const selfMatch = matches(folder.label);
      const innerMatch = visit(folder.id, underMatch || selfMatch);
      const hasContents =
        (tree.folders.get(folder.id)?.length ?? 0) > 0 ||
        (tree.products.get(folder.id)?.length ?? 0) > 0;
      const eligible =
        typeFilter === null && (needle === null || underMatch || selfMatch);
      if (!eligible && !hasContents) continue;
      shownFolders.push(folder);
      if (selfMatch) tree.matchCount += 1;
      if (innerMatch) tree.matchAncestors.add(folder.id);
      containsMatch ||= selfMatch || innerMatch;
    }
    if (shownFolders.length > 0) {
      tree.folders.set(parentId, args.sortFolders(shownFolders));
    }
    if (shownProducts.length > 0) {
      tree.products.set(parentId, args.sortProducts(shownProducts));
    }
    return containsMatch;
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
    }
  | { kind: "product"; product: ProductSummary; depth: number };

// The rows on screen, top to bottom: at each level the folders, each followed
// by its contents when open, then the products.
export function productTreeRows(
  tree: ProductTree,
  isExpanded: (folderId: string) => boolean,
): ProductTreeRow[] {
  const rows: ProductTreeRow[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const folder of tree.folders.get(parentId) ?? []) {
      const hasContents =
        tree.folders.has(folder.id) || tree.products.has(folder.id);
      const expanded = hasContents && isExpanded(folder.id);
      rows.push({ kind: "folder", folder, depth, expanded, hasContents });
      if (expanded) walk(folder.id, depth + 1);
    }
    for (const product of tree.products.get(parentId) ?? []) {
      rows.push({ kind: "product", product, depth });
    }
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
