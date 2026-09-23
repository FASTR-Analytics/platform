import { t3, TC, type Folder } from "lib";
import type { MenuItem } from "panther";
import { sortBySortMode } from "./sort_by_sort_mode";
import { productsSortMode } from "~/state/t4_ui";
import { childFolders } from "./_shared/mod.ts";

// The move affordances D16 gives both menus: quick hops within reach of the
// item's own folder, with the full picker as the catch-all. There is no
// drag-and-drop, so these are the only way to move anything.
const _MOVE_SUBMENU_CAP = 10;

export function buildQuickMoveEntries(args: {
  folders: Folder[];
  // The folder the moved item is in; null = the top level.
  parentId: string | null;
  // Targets to leave out: a moved folder's own subtree.
  excludeIds: Set<string>;
  onMoveTo: (folderId: string | null) => void;
  onMoveToFolder: () => void;
}): MenuItem[] {
  const entries: MenuItem[] = [];

  const targets = sortBySortMode(
    childFolders(args.folders, args.parentId).filter(
      (f) => !args.excludeIds.has(f.id),
    ),
    productsSortMode(),
    (x) => x.label,
    (x) => x.lastUpdated,
  );
  if (targets.length > 0) {
    const capped = targets.slice(0, _MOVE_SUBMENU_CAP);
    entries.push({
      label: t3({
        en: "Move into",
        fr: "Déplacer dans",
        pt: "Mover para dentro de",
      }),
      icon: "folder",
      subMenu: [
        ...capped.map(
          (f): MenuItem => ({
            label: f.label,
            icon: "folder",
            onClick: () => args.onMoveTo(f.id),
          }),
        ),
        // Past the cap the submenu stops being a quick hop, so it hands over
        // to the full picker rather than growing.
        ...(targets.length > capped.length
          ? [
              {
                label: t3({ en: "More…", fr: "Plus…", pt: "Mais…" }),
                onClick: args.onMoveToFolder,
              } satisfies MenuItem,
            ]
          : []),
      ],
    });
  }

  const parentFolder = args.folders.find((f) => f.id === args.parentId);
  const grandparent =
    parentFolder === undefined || parentFolder.parentId === null
      ? undefined
      : args.folders.find((f) => f.id === parentFolder.parentId);
  if (grandparent !== undefined) {
    entries.push({
      label: t3({
        en: `Move up to "${grandparent.label}"`,
        fr: `Remonter vers « ${grandparent.label} »`,
        pt: `Subir para "${grandparent.label}"`,
      }),
      onClick: () => args.onMoveTo(grandparent.id),
    });
  }

  if (args.parentId !== null) {
    entries.push({
      label: t3({
        en: "Move to top level",
        fr: "Déplacer au niveau supérieur",
        pt: "Mover para o nível superior",
      }),
      onClick: () => args.onMoveTo(null),
    });
  }

  entries.push({
    label: t3({
      en: "Move to folder…",
      fr: "Déplacer vers un dossier…",
      pt: "Mover para uma pasta…",
    }),
    icon: "folder",
    onClick: args.onMoveToFolder,
  });

  return entries;
}

// ONE product menu: the list row's button and the right-click menu both
// render this.
export function buildProductMenu(args: {
  folders: Folder[];
  // The product's folder: the quick moves are relative to it.
  parentId: string | null;
  onSettings: () => void;
  onPackageScope: () => void;
  onMoveToFolder: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveTo: (folderId: string | null) => void;
}): MenuItem[] {
  return [
    ...buildQuickMoveEntries({
      folders: args.folders,
      parentId: args.parentId,
      excludeIds: new Set(),
      onMoveTo: args.onMoveTo,
      onMoveToFolder: args.onMoveToFolder,
    }),
    { type: "divider" },
    {
      label: t3(TC.settings),
      icon: "settings",
      onClick: args.onSettings,
    },
    {
      label: t3({
        en: "Results package and scope…",
        fr: "Paquet de résultats et portée…",
        pt: "Pacote de resultados e âmbito…",
      }),
      icon: "package",
      onClick: args.onPackageScope,
    },
    {
      label: t3({ en: "Duplicate", fr: "Dupliquer", pt: "Duplicar" }),
      icon: "copy",
      onClick: args.onDuplicate,
    },
    { type: "divider" },
    {
      label: t3(TC.delete),
      icon: "trash",
      intent: "danger",
      onClick: args.onDelete,
    },
  ];
}
