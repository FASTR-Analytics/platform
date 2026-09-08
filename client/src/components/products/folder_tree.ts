import type { Folder } from "lib";

// Pure derivations over the flat T1 `Folder[]` (D16): the tree is derived
// where it is needed and never mutated into state. The server refuses cycles
// inside the move transaction, but these run in the render path, so every walk
// carries a visited set and terminates on malformed data rather than hanging.
//
// The type import is the only dependency, so server/tests/folder_tree_test.ts
// loads this module under Deno as it is.

const _PATH_SEPARATOR = " › ";

export function childFolders(
  folders: Folder[],
  parentId: string | null,
): Folder[] {
  return folders.filter((f) => f.parentId === parentId);
}

// Root-first chain of ancestors, excluding the folder itself.
export function ancestors(folders: Folder[], folderId: string): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const visited = new Set<string>([folderId]);
  const chain: Folder[] = [];
  let currentId = byId.get(folderId)?.parentId ?? null;
  while (currentId !== null && !visited.has(currentId)) {
    const folder = byId.get(currentId);
    if (folder === undefined) break;
    visited.add(folder.id);
    chain.unshift(folder);
    currentId = folder.parentId;
  }
  return chain;
}

// Every folder's full path, in one pass with a shared cache: the pickers and
// the search rows label every row at once, and one walk per row would be
// quadratic in the folder count.
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
