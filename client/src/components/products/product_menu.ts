import { t3, TC, type Folder, type ProductSummary } from "lib";
import type { MenuItem } from "panther";
import { sortBySortMode } from "~/components/_shared/sort_control";
import { productsSortMode } from "~/state/t4_ui";
import { childFolders } from "./folder_tree";

// D14's interim move affordances, shared by the product menu and the folder
// menu: quick hops within reach of the current location, with the full picker
// as the catch-all. The "Move into" submenu is capped — beyond that, "More…"
// opens the picker.
const _MOVE_SUBMENU_CAP = 10;

export function buildQuickMoveEntries(args: {
  folders: Folder[];
  location: string | null;
  // Targets to exclude from the submenu (a moved folder's own subtree).
  excludeIds: Set<string>;
  moveToFolderLabel: string;
  onMoveTo: (folderId: string | null) => void;
  onMoveToFolder: () => void;
}): MenuItem[] {
  const entries: MenuItem[] = [];

  const targets = sortBySortMode(
    childFolders(args.folders, args.location).filter(
      (f) => !args.excludeIds.has(f.id),
    ),
    productsSortMode(),
    (x) => x.label,
    (x) => x.lastUpdated,
  );
  if (targets.length > 0) {
    entries.push({
      label: t3({
        en: "Move into",
        fr: "Déplacer dans",
        pt: "Mover para dentro de",
      }),
      icon: "folder",
      subMenu: [
        ...targets.slice(0, _MOVE_SUBMENU_CAP).map(
          (f): MenuItem => ({
            label: f.label,
            icon: "folder",
            onClick: () => args.onMoveTo(f.id),
          }),
        ),
        ...(targets.length > _MOVE_SUBMENU_CAP
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

  const locationFolder = args.folders.find((f) => f.id === args.location);
  const parent =
    locationFolder === undefined || locationFolder.parentId === null
      ? undefined
      : args.folders.find((f) => f.id === locationFolder.parentId);
  if (parent !== undefined) {
    entries.push({
      label: t3({
        en: `Move up to "${parent.label}"`,
        fr: `Remonter vers « ${parent.label} »`,
        pt: `Subir para "${parent.label}"`,
      }),
      onClick: () => args.onMoveTo(parent.id),
    });
  }

  if (args.location !== null) {
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
    label: args.moveToFolderLabel,
    icon: "folder",
    onClick: args.onMoveToFolder,
  });

  return entries;
}

// ONE product menu: the grid card, the list row and the row's moreVertical
// button all render this. Actions apply to the batch when the product is part
// of a multi-selection.
export function buildProductMenu(args: {
  product: ProductSummary;
  batch: ProductSummary[];
  folders: Folder[];
  location: string | null;
  onSettings: () => void;
  onMoveToFolder: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveTo: (folderId: string | null) => void;
}): MenuItem[] {
  const count = args.batch.length;
  const isMultiSelect = count > 1;

  return [
    ...buildQuickMoveEntries({
      folders: args.folders,
      location: args.location,
      excludeIds: new Set(),
      moveToFolderLabel: isMultiSelect
        ? t3({
            en: `Move ${count} products to folder...`,
            fr: `Déplacer ${count} produits vers un dossier...`,
            pt: `Mover ${count} produtos para uma pasta...`,
          })
        : t3({
            en: "Move to folder...",
            fr: "Déplacer vers un dossier...",
            pt: "Mover para uma pasta...",
          }),
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
      label: isMultiSelect
        ? t3({
            en: `Duplicate ${count} products...`,
            fr: `Dupliquer ${count} produits...`,
            pt: `Duplicar ${count} produtos...`,
          })
        : t3({ en: "Duplicate...", fr: "Dupliquer...", pt: "Duplicar..." }),
      icon: "copy",
      onClick: args.onDuplicate,
    },
    {
      label: isMultiSelect
        ? t3({
            en: `Delete ${count} products`,
            fr: `Supprimer ${count} produits`,
            pt: `Eliminar ${count} produtos`,
          })
        : t3(TC.delete),
      icon: "trash",
      intent: "danger",
      onClick: args.onDelete,
    },
  ];
}
