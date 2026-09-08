import { t3, type Folder } from "lib";
import type { MenuItem } from "panther";
import { descendantIds } from "./folder_tree";
import { buildQuickMoveEntries } from "./product_menu";

// ONE folder menu: the grid tile's button, the list row's button and both
// right-click menus render this. Folders act one at a time, never as a batch
// (D16). The quick-move targets exclude the folder's own subtree, and so does
// the picker behind "Move to folder…"; the server's FOLDER_CYCLE is still the
// authority.
export function buildFolderMenu(args: {
  folder: Folder;
  folders: Folder[];
  location: string | null;
  onMoveTo: (parentId: string | null) => void;
  onMoveToFolder: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): MenuItem[] {
  return [
    ...buildQuickMoveEntries({
      folders: args.folders,
      location: args.location,
      excludeIds: new Set([
        args.folder.id,
        ...descendantIds(args.folders, args.folder.id),
      ]),
      moveToFolderLabel: t3({
        en: "Move to folder…",
        fr: "Déplacer vers un dossier…",
        pt: "Mover para uma pasta…",
      }),
      onMoveTo: args.onMoveTo,
      onMoveToFolder: args.onMoveToFolder,
    }),
    { type: "divider" },
    {
      label: t3({
        en: "Rename / change colour…",
        fr: "Renommer / changer la couleur…",
        pt: "Mudar o nome / alterar a cor…",
      }),
      icon: "pencil",
      onClick: args.onEdit,
    },
    {
      label: t3({
        en: "Delete folder",
        fr: "Supprimer le dossier",
        pt: "Eliminar pasta",
      }),
      icon: "trash",
      intent: "danger",
      onClick: args.onDelete,
    },
  ];
}
