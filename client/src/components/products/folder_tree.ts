import type { Folder } from "lib";

// Pure functions over the flat T1 `Folder[]` (D12): the tree is derived where
// it is needed, never mutated into state. The server refuses cycles, but these
// run in the render path, so each walk carries a visited set and terminates on
// malformed data rather than hanging.

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
    if (folder === undefined) {
      break;
    }
    visited.add(folder.id);
    chain.unshift(folder);
    currentId = folder.parentId;
  }
  return chain;
}

export function pathLabel(folders: Folder[], folderId: string): string {
  const self = folders.find((f) => f.id === folderId);
  if (self === undefined) {
    return "";
  }
  return [...ancestors(folders, folderId), self]
    .map((f) => f.label)
    .join(_PATH_SEPARATOR);
}

// Every folder inside the subtree, excluding the folder itself.
export function descendantIds(
  folders: Folder[],
  folderId: string,
): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    if (f.parentId === null) {
      continue;
    }
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
      if (childId === folderId || result.has(childId)) {
        continue;
      }
      result.add(childId);
      stack.push(childId);
    }
  }
  return result;
}

// The flat full-path option list every folder picker renders (D15), sorted by
// path. `disabledSubtree` marks a folder and its descendants — the illegal
// targets when that folder itself is being moved.
export function folderPathOptions(
  folders: Folder[],
  opts: { disabledSubtree?: string },
): { value: string; label: string; disabled: boolean }[] {
  const disabled =
    opts.disabledSubtree === undefined
      ? new Set<string>()
      : new Set([
          opts.disabledSubtree,
          ...descendantIds(folders, opts.disabledSubtree),
        ]);
  return folders
    .map((f) => ({
      value: f.id,
      label: pathLabel(folders, f.id),
      disabled: disabled.has(f.id),
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
}
