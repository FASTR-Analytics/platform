import { VisualizationFolder, t } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  RadioGroup,
  timActionForm,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  presentationObjectId: string;
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
    { value: "_none", label: "No folder" },
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

        return serverActions.updatePresentationObjectFolder({
          projectId: p.projectId,
          po_id: p.presentationObjectId,
          folderId: createRes.data.folderId,
        });
      }

      const folderId = selectedFolderId() === "_none" ? null : selectedFolderId();

      if (folderId === p.currentFolderId) {
        p.close(undefined);
        return { success: true, data: { lastUpdated: "" } };
      }

      return serverActions.updatePresentationObjectFolder({
        projectId: p.projectId,
        po_id: p.presentationObjectId,
        folderId,
      });
    },
    (data) => {
      p.close({ lastUpdated: data.lastUpdated });
    }
  );

  return (
    <AlertFormHolder
      formId="move-to-folder"
      header={t("Move to folder")}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={isCreatingFolder() && !newFolderLabel().trim()}
    >
      <Show
        when={!isCreatingFolder()}
        fallback={
          <div class="space-y-4">
            <Input
              label="Folder name"
              value={newFolderLabel()}
              onChange={setNewFolderLabel}
              autoFocus
            />
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium">Color</label>
              <input
                type="color"
                value={newFolderColor()}
                onInput={(e) => setNewFolderColor(e.currentTarget.value)}
                class="h-8 w-12 cursor-pointer rounded border"
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
