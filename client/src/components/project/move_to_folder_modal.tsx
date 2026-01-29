import { VisualizationFolder, t } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  ColorPicker,
  Input,
  RadioGroup,
  timActionForm,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  presentationObjectIds: string[];
  currentFolderId: string | null;
  folders: VisualizationFolder[];
};

type ReturnType = { lastUpdated: string } | undefined;

export function MoveToFolderModal(p: AlertComponentProps<Props, ReturnType>) {
  const [selectedFolderId, setSelectedFolderId] = createSignal<string | null>(
    p.currentFolderId
  );
  const [isCreatingFolder, setIsCreatingFolder] = createSignal(false);
  const [newFolderLabel, setNewFolderLabel] = createSignal("");
  const [newFolderColor, setNewFolderColor] = createSignal("#3b82f6");

  const folderOptions = () => [
    { value: "_none", label: "General" },
    ...p.folders.map((f) => ({
      value: f.id,
      label: f.label,
    })),
  ];

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      if (isCreatingFolder()) {
        const label = newFolderLabel().trim();
        if (!label) {
          return { success: false, err: "Folder name is required" };
        }

        const createRes = await serverActions.createVisualizationFolder({
          projectId: p.projectId,
          label,
          color: newFolderColor(),
        });

        if (!createRes.success) {
          return createRes;
        }

        const promises = p.presentationObjectIds.map(id =>
          serverActions.updatePresentationObjectFolder({
            projectId: p.projectId,
            po_id: id,
            folderId: createRes.data.folderId,
          })
        );
        const results = await Promise.all(promises);
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
          return failed[0];
        }
        return results[0];
      }

      const folderId = selectedFolderId() === "_none" ? null : selectedFolderId();

      if (folderId === p.currentFolderId) {
        p.close(undefined);
        return { success: true, data: { lastUpdated: "" } };
      }

      const promises = p.presentationObjectIds.map(id =>
        serverActions.updatePresentationObjectFolder({
          projectId: p.projectId,
          po_id: id,
          folderId,
        })
      );
      const results = await Promise.all(promises);
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        return failed[0];
      }
      return results[0];
    },
    (data) => {
      p.close({ lastUpdated: data.lastUpdated });
    }
  );

  const header = p.presentationObjectIds.length > 1
    ? `Move ${p.presentationObjectIds.length} visualizations to folder`
    : t("Move to folder");

  return (
    <AlertFormHolder
      formId="move-to-folder"
      header={header}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={isCreatingFolder() && !newFolderLabel().trim()}
    >
      <Show
        when={!isCreatingFolder()}
        fallback={
          <div class="space-y-4">

            <div class="flex ui-gap">
              <Input
                label="Folder name"
                value={newFolderLabel()}
                onChange={setNewFolderLabel}
                autoFocus
                fullWidth
              />
              <ColorPicker
                label="Color"
                value={newFolderColor()}
                onChange={(c) => setNewFolderColor(c)}
                position="right"
              />
            </div>
            <Button
              size="sm"
              outline
              onClick={() => setIsCreatingFolder(false)}
            >
              Back to folder list
            </Button>
          </div>
        }
      >
        <div class="space-y-4">
          <RadioGroup
            label="Select folder"
            options={folderOptions()}
            value={selectedFolderId() ?? "_none"}
            onChange={(v) => setSelectedFolderId(v === "_none" ? null : v)}
            convertToSelectThreshold={6}
            fullWidthForSelect
          />
          <Button
            size="sm"
            outline
            iconName="plus"
            onClick={() => setIsCreatingFolder(true)}
          >
            Create new folder
          </Button>
        </div>
      </Show>
    </AlertFormHolder>
  );
}
