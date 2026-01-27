import { VisualizationFolder, t } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  ColorPicker,
  Input,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  folder?: VisualizationFolder;
};

type ReturnType = { lastUpdated: string } | undefined;

export function EditFolderModal(p: AlertComponentProps<Props, ReturnType>) {
  const isCreate = !p.folder;
  const [tempLabel, setTempLabel] = createSignal(p.folder?.label ?? "");
  const [tempColor, setTempColor] = createSignal(p.folder?.color ?? "#3b82f6");

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const label = tempLabel().trim();
      if (!label) {
        return { success: false, err: t("Folder name is required") };
      }
      if (isCreate) {
        return serverActions.createVisualizationFolder({
          projectId: p.projectId,
          label,
          color: tempColor(),
        });
      }
      return serverActions.updateVisualizationFolder({
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
      formId="edit-folder"
      header={isCreate ? t("New folder") : t("Edit folder")}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="flex ui-gap">
        <Input
          label={t("Folder name")}
          value={tempLabel()}
          onChange={setTempLabel}
          autoFocus
          fullWidth
        />
        <ColorPicker
          label="Color"
          value={tempColor()}
          onChange={(c) => setTempColor(c)}
          position="right"
        />
      </div>
    </AlertFormHolder>
  );
}
