import { t3, type Folder } from "lib";
import type { MenuItem } from "panther";
import { descendantIds } from "./folder_tree";
import { buildQuickMoveEntries } from "./product_menu";

// ONE folder menu: the grid tile, the list row and both moreVertical buttons
// render this. Folders act one at a time — they are never part of a batch
// (D3). The quick-move targets exclude the folder's own subtree; the picker
// behind onMoveToFolder disables it (D10 courtesy — the server is the
// authority).
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
        en: "Move to folder...",
        fr: "Déplacer vers un dossier...",
        pt: "Mover para uma pasta...",
      }),
      onMoveTo: args.onMoveTo,
      onMoveToFolder: args.onMoveToFolder,
    }),
    { type: "divider" },
    {
      label: t3({
        en: "Rename / Change color...",
        fr: "Renommer / Changer la couleur...",
        pt: "Mudar o nome / Alterar a cor...",
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
