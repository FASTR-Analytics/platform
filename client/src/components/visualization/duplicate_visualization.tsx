import { isFrench, t, t2, T, VisualizationFolder } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  Select,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function DuplicateVisualization(
  p: AlertComponentProps<
    {
      projectId: string;
      poDetail: { id: string; label: string; folderId: string | null };
      folders: VisualizationFolder[];
    },
    { newPresentationObjectId: string; lastUpdated: string }
  >,
) {
  // Temp state

  const [tempLabel, setTempLabel] = createSignal<string>(p.poDetail.label);
  const [tempFolderId, setTempFolderId] = createSignal<string>(p.poDetail.folderId ?? "_none");

  const folderOptions = () => [
    { value: "_none", label: t("General") },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const label = tempLabel().trim();
      if (!label) {
        return {
          success: false,
          err: t("You must enter a name"),
        };
      }

      const folderId = tempFolderId() === "_none" ? null : tempFolderId();
      return serverActions.duplicatePresentationObject({
        projectId: p.projectId,
        po_id: p.poDetail.id,
        label,
        folderId,
      });
    },
    (res) => {
      if (res) {
        p.close({
          newPresentationObjectId: res.newPresentationObjectId,
          lastUpdated: res.lastUpdated,
        });
      }
    },
  );

  return (
    <AlertFormHolder
      formId="duplicate-presentation-object"
      header={t2(T.FRENCH_UI_STRINGS.duplicate_visualization)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <div class="space-y-4">
        <Input
          label={t2(T.FRENCH_UI_STRINGS.new_visualization_name)}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <Select
          label={t("Folder")}
          options={folderOptions()}
          value={tempFolderId()}
          onChange={setTempFolderId}
          fullWidth
        />
      </div>
    </AlertFormHolder>
  );
}
