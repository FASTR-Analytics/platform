import { ReportFolder, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  ColorPicker,
  Input,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  folder?: ReportFolder;
};

type ReturnType = { lastUpdated: string } | undefined;

export function EditReportFolderModal(p: AlertComponentProps<Props, ReturnType>) {
  const isCreate = !p.folder;
  const [tempLabel, setTempLabel] = createSignal(p.folder?.label ?? "");
  const [tempColor, setTempColor] = createSignal(p.folder?.color ?? "#3b82f6");

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const label = tempLabel().trim();
      if (!label) {
        return { success: false, err: t3({ en: "Folder name is required", fr: "Le nom du dossier est requis", pt: "O nome da pasta é obrigatório" }) };
      }
      if (isCreate) {
        return serverActions.createReportFolder({
          projectId: p.projectId,
          label,
          color: tempColor(),
        });
      }
      return serverActions.updateReportFolder({
        projectId: p.projectId,
        folder_id: p.folder!.id,
        label,
        color: tempColor(),
      });
    },
    (data) => {
      p.close({ lastUpdated: data.lastUpdated });
    }
  );

  return (
    <AlertFormHolder
      formId="edit-report-folder"
      header={isCreate ? t3({ en: "New folder", fr: "Nouveau dossier", pt: "Nova pasta" }) : t3({ en: "Edit folder", fr: "Modifier le dossier", pt: "Editar pasta" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="flex ui-gap">
        <Input
          label={t3({ en: "Folder name", fr: "Nom du dossier", pt: "Nome da pasta" })}
          value={tempLabel()}
          onChange={setTempLabel}
          autoFocus
          fullWidth
        />
        <ColorPicker
          label={t3({ en: "Color", fr: "Couleur", pt: "Cor" })}
          value={tempColor()}
          onChange={(c) => setTempColor(c)}
          position="right"
        />
      </div>
    </AlertFormHolder>
  );
}
