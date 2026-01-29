import { isFrench, t, t2, T, VisualizationFolder } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  ColorPicker,
  Input,
  Select,
  timActionForm,
  ProgressBar,
  getProgress,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

export function DuplicateVisualization(
  p: AlertComponentProps<
    {
      projectId: string;
      poDetails: Array<{ id: string; label: string; folderId: string | null }>;
      folders: VisualizationFolder[];
    },
    { lastUpdated: string } | undefined
  >,
) {
  // Temp state

  const isBatchMode = () => p.poDetails.length > 1;

  const [tempLabel, setTempLabel] = createSignal<string>(
    p.poDetails.length === 1 ? p.poDetails[0].label : ""
  );
  const [tempFolderId, setTempFolderId] = createSignal<string>(
    p.poDetails.length === 1 && p.poDetails[0].folderId
      ? p.poDetails[0].folderId
      : "_none"
  );

  const [isCreatingFolder, setIsCreatingFolder] = createSignal(false);
  const [newFolderLabel, setNewFolderLabel] = createSignal("");
  const [newFolderColor, setNewFolderColor] = createSignal("#3b82f6");

  const progress = getProgress();

  const folderOptions = () => [
    { value: "_none", label: t("General") },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      let folderId: string | null;

      // Handle folder creation/selection
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

        folderId = createRes.data.folderId;
      } else {
        folderId = tempFolderId() === "_none" ? null : tempFolderId();
      }

      // Batch duplication
      const vizCount = p.poDetails.length;

      if (vizCount === 1) {
        // Single duplication
        const label = tempLabel().trim();
        if (!label) {
          return { success: false, err: t("You must enter a name") };
        }

        return serverActions.duplicatePresentationObject({
          projectId: p.projectId,
          po_id: p.poDetails[0].id,
          label,
          folderId,
        });
      } else {
        // Batch duplication with progress
        let successCount = 0;

        for (let i = 0; i < vizCount; i++) {
          const po = p.poDetails[i];

          progress.onProgress(
            i / vizCount,
            `Duplicating visualization ${i + 1} of ${vizCount}...`
          );

          const label = `${po.label} (copy)`;

          try {
            const dupRes = await serverActions.duplicatePresentationObject({
              projectId: p.projectId,
              po_id: po.id,
              label,
              folderId,
            });

            if (!dupRes.success) {
              return {
                success: false,
                err: `Failed on visualization ${i + 1} of ${vizCount} (${po.label}): ${dupRes.err}. Created ${successCount} duplicates successfully.`
              };
            }
            successCount++;
          } catch (err) {
            return {
              success: false,
              err: `Failed on visualization ${i + 1} of ${vizCount} (${po.label}): ${err instanceof Error ? err.message : String(err)}. Created ${successCount} duplicates successfully.`
            };
          }
        }

        progress.onProgress(1, `Duplicated ${vizCount} visualizations`);

        return { success: true, data: { lastUpdated: new Date().toISOString() } };
      }
    },
    (data) => {
      if (data) {
        p.close({ lastUpdated: data.lastUpdated });
      }
    },
  );

  const header = p.poDetails.length > 1
    ? `Duplicate ${p.poDetails.length} visualizations`
    : t2(T.FRENCH_UI_STRINGS.duplicate_visualization);

  return (
    <AlertFormHolder
      formId="duplicate-presentation-object"
      header={header}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
      disableSaveButton={
        isCreatingFolder()
          ? !newFolderLabel().trim()
          : (!isBatchMode() && !tempLabel().trim())
      }
    >
      <div class="space-y-4">
        {/* Progress bar for batch mode */}
        <Show when={isBatchMode() && save.state().status === "loading"}>
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        </Show>

        {/* Label input: only for single viz */}
        <Show when={!isBatchMode()}>
          <Input
            label={t2(T.FRENCH_UI_STRINGS.new_visualization_name)}
            value={tempLabel()}
            onChange={setTempLabel}
            fullWidth
            autoFocus
          />
        </Show>

        {/* Folder selection or creation */}
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
            <Select
              label={t("Folder")}
              options={folderOptions()}
              value={tempFolderId()}
              onChange={setTempFolderId}
              fullWidth
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
      </div>
    </AlertFormHolder>
  );
}
