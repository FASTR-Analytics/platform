import { t3, type Folder } from "lib";
import {
  AlertFormHolder,
  RadioGroup,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { folderPathOptions } from "./folder_tree";

const _NO_FOLDER = "_none";

type Props = {
  // What is being moved: a batch of products, or one folder (folders are never
  // part of a batch, D16).
  target:
    | { kind: "products"; productIds: string[]; currentFolderId: string | null }
    | { kind: "folder"; folder: Folder };
  folders: Folder[];
};

type ReturnType = { lastUpdated: string } | undefined;

// The full picker: flat full paths sorted by path, "No folder" first (D16).
// A moved folder's own subtree is excluded outright, because a Select option
// carries no disabled state; the server's typed FOLDER_CYCLE still comes back
// through the envelope and is the authority.
export function MoveToFolderModal(p: AlertComponentProps<Props, ReturnType>) {
  const [selectedFolderId, setSelectedFolderId] = createSignal<string>(
    (p.target.kind === "products"
      ? p.target.currentFolderId
      : p.target.folder.parentId) ?? _NO_FOLDER,
  );

  const folderOptions = createMemo(() => [
    {
      value: _NO_FOLDER,
      label: t3({ en: "No folder", fr: "Aucun dossier", pt: "Sem pasta" }),
    },
    ...folderPathOptions(p.folders, {
      excludeSubtree:
        p.target.kind === "folder" ? p.target.folder.id : undefined,
    }),
  ]);

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const selected = selectedFolderId();
      const folderId = selected === _NO_FOLDER ? null : selected;

      if (p.target.kind === "folder") {
        // A folder move is `updateFolder`: label, colour and parent are one
        // metadata write.
        return serverActions.updateFolder({
          folder_id: p.target.folder.id,
          label: p.target.folder.label,
          color: p.target.folder.color,
          parentId: folderId,
        });
      }

      // One batch call, not one per product: the folder move is a single
      // cross-type product operation.
      return serverActions.moveProductsToFolder({
        productIds: p.target.productIds,
        folderId,
      });
    },
    (data) => {
      p.close({ lastUpdated: data.lastUpdated });
    },
  );

  const header = () => {
    if (p.target.kind === "folder") {
      return t3({
        en: `Move "${p.target.folder.label}"`,
        fr: `Déplacer « ${p.target.folder.label} »`,
        pt: `Mover "${p.target.folder.label}"`,
      });
    }
    return p.target.productIds.length > 1
      ? t3({
          en: `Move ${p.target.productIds.length} products to folder`,
          fr: `Déplacer ${p.target.productIds.length} produits vers un dossier`,
          pt: `Mover ${p.target.productIds.length} produtos para uma pasta`,
        })
      : t3({
          en: "Move to folder",
          fr: "Déplacer vers un dossier",
          pt: "Mover para uma pasta",
        });
  };

  return (
    <AlertFormHolder
      formId="move-to-folder"
      header={header()}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <RadioGroup
        label={t3({
          en: "Select folder",
          fr: "Sélectionner le dossier",
          pt: "Selecionar pasta",
        })}
        options={folderOptions()}
        value={selectedFolderId()}
        onChange={setSelectedFolderId}
        convertToSelectThreshold={6}
        fullWidthForSelect
      />
    </AlertFormHolder>
  );
}
