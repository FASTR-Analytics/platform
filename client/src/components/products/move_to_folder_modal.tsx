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

const _NO_FOLDER = "_none";

type Props = {
  productIds: string[];
  currentFolderId: string | null;
  folders: Folder[];
};

type ReturnType = { lastUpdated: string } | undefined;

export function MoveToFolderModal(p: AlertComponentProps<Props, ReturnType>) {
  const [selectedFolderId, setSelectedFolderId] = createSignal<string>(
    p.currentFolderId ?? _NO_FOLDER,
  );
  const [isCreatingFolder, setIsCreatingFolder] = createSignal(false);
  const [newFolderLabel, setNewFolderLabel] = createSignal("");
  const [newFolderColor, setNewFolderColor] = createSignal("#3b82f6");

  const folderOptions = () => [
    { value: _NO_FOLDER, label: t3(TC.general) },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
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
        });
        if (!createRes.success) {
          return createRes;
        }
        folderId = createRes.data.folderId;
      } else {
        const selected = selectedFolderId();
        folderId = selected === _NO_FOLDER ? null : selected;
      }

      // One batch call, not one per product: the folder move is a single
      // cross-type product operation (D1).
      return serverActions.moveProductsToFolder({
        productIds: p.productIds,
        folderId,
      });
    },
    (data) => {
      p.close({ lastUpdated: data.lastUpdated });
    },
  );

  const header = () =>
    p.productIds.length > 1
      ? t3({
          en: `Move ${p.productIds.length} products to folder`,
          fr: `Déplacer ${p.productIds.length} produits vers un dossier`,
          pt: `Mover ${p.productIds.length} produtos para uma pasta`,
        })
      : t3({
          en: "Move to folder",
          fr: "Déplacer vers un dossier",
          pt: "Mover para uma pasta",
        });

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
