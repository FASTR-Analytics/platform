import { t3, type Folder } from "lib";
import {
  AlertFormHolder,
  ColorPicker,
  Input,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  // undefined = create.
  folder: Folder | undefined;
};

type ReturnType = { lastUpdated: string } | undefined;

export function EditFolderModal(p: AlertComponentProps<Props, ReturnType>) {
  const isCreate = p.folder === undefined;
  const [tempLabel, setTempLabel] = createSignal(p.folder?.label ?? "");
  const [tempColor, setTempColor] = createSignal(p.folder?.color ?? "#3b82f6");

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const label = tempLabel().trim();
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
      const folder = p.folder;
      if (folder === undefined) {
        return serverActions.createFolder({ label, color: tempColor() });
      }
      return serverActions.updateFolder({
        folder_id: folder.id,
        label,
        color: tempColor(),
      });
    },
    (data) => {
      p.close({ lastUpdated: data.lastUpdated });
    },
  );

  return (
    <AlertFormHolder
      formId="edit-folder"
      header={
        isCreate
          ? t3({ en: "New folder", fr: "Nouveau dossier", pt: "Nova pasta" })
          : t3({
              en: "Edit folder",
              fr: "Modifier le dossier",
              pt: "Editar pasta",
            })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-gap flex">
        <Input
          label={t3({
            en: "Folder name",
            fr: "Nom du dossier",
            pt: "Nome da pasta",
          })}
          value={tempLabel()}
          onChange={setTempLabel}
          autoFocus
          fullWidth
        />
        <ColorPicker
          label={t3({ en: "Color", fr: "Couleur", pt: "Cor" })}
          value={tempColor()}
          onChange={setTempColor}
          position="right"
        />
      </div>
    </AlertFormHolder>
  );
}
