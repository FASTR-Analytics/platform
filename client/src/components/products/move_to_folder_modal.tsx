import { t3, TC, type Folder } from "lib";
import {
  AlertFormHolder,
  Button,
  ColorPicker,
  Input,
  RadioGroup,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { folderPathOptions } from "./folder_tree";

const _NO_FOLDER = "_none";

type Props = {
  // What is being moved: a batch of products, or one folder (D3 — folders are
  // never part of a batch). A folder's illegal targets — itself and its own
  // subtree — are excluded from the list; the server's cycle guard remains the
  // authority (D10).
  target:
    | { kind: "products"; productIds: string[]; currentFolderId: string | null }
    | { kind: "folder"; folder: Folder };
  // The explorer's current location — where the inline "create new folder"
  // path creates its folder.
  parentId: string | null;
  folders: Folder[];
};

type ReturnType = { lastUpdated: string } | undefined;

export function MoveToFolderModal(p: AlertComponentProps<Props, ReturnType>) {
  const [selectedFolderId, setSelectedFolderId] = createSignal<string>(
    (p.target.kind === "products"
      ? p.target.currentFolderId
      : p.target.folder.parentId) ?? _NO_FOLDER,
  );
  const [isCreatingFolder, setIsCreatingFolder] = createSignal(false);
  const [newFolderLabel, setNewFolderLabel] = createSignal("");
  const [newFolderColor, setNewFolderColor] = createSignal("#3b82f6");

  // Full paths, sorted by path, "No folder" first (D15). Panther options carry
  // no disabled state, so a moved folder's own subtree is excluded outright.
  const folderOptions = () => [
    { value: _NO_FOLDER, label: t3(TC.general) },
    ...folderPathOptions(p.folders, {
      disabledSubtree:
        p.target.kind === "folder" ? p.target.folder.id : undefined,
    })
      .filter((opt) => !opt.disabled)
      .map((opt) => ({ value: opt.value, label: opt.label })),
  ];

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      let folderId: string | null;
      if (isCreatingFolder()) {
        const label = newFolderLabel().trim();
        if (!label) {
          return {
            success: false,
            err: t3({
              en: "Folder name is required",
              fr: "Le nom du dossier est requis",
              pt: "O nome da pasta é obrigatório",
            }),
          };
        }
        const createRes = await serverActions.createFolder({
          label,
          color: newFolderColor(),
          parentId: p.parentId,
        });
        if (!createRes.success) {
          return createRes;
        }
        folderId = createRes.data.folderId;
      } else {
        const selected = selectedFolderId();
        folderId = selected === _NO_FOLDER ? null : selected;
      }

      if (p.target.kind === "folder") {
        // A folder move is updateFolder — label, colour and parent are one
        // metadata write; an illegal target comes back as the server's typed
        // FOLDER_CYCLE failure through the envelope.
        return serverActions.updateFolder({
          folder_id: p.target.folder.id,
          label: p.target.folder.label,
          color: p.target.folder.color,
          parentId: folderId,
        });
      }

      // One batch call, not one per product: the folder move is a single
      // cross-type product operation (D1).
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
      disableSaveButton={isCreatingFolder() && !newFolderLabel().trim()}
    >
      <Show
        when={!isCreatingFolder()}
        fallback={
          <div class="ui-spy-sm">
            <div class="ui-gap flex">
              <Input
                label={t3({
                  en: "Folder name",
                  fr: "Nom du dossier",
                  pt: "Nome da pasta",
                })}
                value={newFolderLabel()}
                onChange={setNewFolderLabel}
                autoFocus
                fullWidth
              />
              <ColorPicker
                label={t3({ en: "Color", fr: "Couleur", pt: "Cor" })}
                value={newFolderColor()}
                onChange={setNewFolderColor}
                position="right"
              />
            </div>
            <Button size="sm" outline onClick={() => setIsCreatingFolder(false)}>
              {t3({
                en: "Back to folder list",
                fr: "Retour à la liste des dossiers",
                pt: "Voltar à lista de pastas",
              })}
            </Button>
          </div>
        }
      >
        <div class="ui-spy-sm">
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
          <Button
            size="sm"
            outline
            iconName="plus"
            onClick={() => setIsCreatingFolder(true)}
          >
            {t3({
              en: "Create new folder",
              fr: "Créer un nouveau dossier",
              pt: "Criar nova pasta",
            })}
          </Button>
        </div>
      </Show>
    </AlertFormHolder>
  );
}
