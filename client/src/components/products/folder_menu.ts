import { t3, type Folder } from "lib";
import type { MenuItem } from "panther";
import { descendantIds } from "./_shared/mod.ts";
import { buildQuickMoveEntries } from "./product_menu";

// ONE folder menu: the list row's button and the right-click menu both
// render this. The quick-move targets exclude the folder's own subtree, and so
// does the picker behind "Move to folder…"; the server's FOLDER_CYCLE is still
// the authority.
export function buildFolderMenu(args: {
  folder: Folder;
  folders: Folder[];
  onMoveTo: (parentId: string | null) => void;
  onMoveToFolder: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): MenuItem[] {
  return [
    ...buildQuickMoveEntries({
      folders: args.folders,
      parentId: args.folder.parentId,
      excludeIds: new Set([
        args.folder.id,
        ...descendantIds(args.folders, args.folder.id),
      ]),
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
