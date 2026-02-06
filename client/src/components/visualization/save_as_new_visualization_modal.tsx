import {
  isFrench,
  PresentationObjectConfig,
  PresentationObjectDetail,
  t,
  T,
  t2,
  VisualizationFolder,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  Select,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function SaveAsNewVisualizationModal(
  p: AlertComponentProps<
    {
      projectId: string;
      existingLabel: string;
      resultsValue: PresentationObjectDetail["resultsValue"];
      config: PresentationObjectConfig;
      folders: VisualizationFolder[];
    },
    { newPresentationObjectId: string; lastUpdated: string; folderId: string | null }
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>(p.existingLabel);
  const [tempFolderId, setTempFolderId] = createSignal<string>("_none");

  const folderOptions = () => [
    { value: "_none", label: t("General") },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return { success: false, err: t("You must enter a name") };
      }
      const folderId = tempFolderId() === "_none" ? null : tempFolderId();

      const createRes = await serverActions.createPresentationObject({
        projectId: p.projectId,
        label: goodLabel,
        resultsValue: p.resultsValue,
        config: p.config,
        makeDefault: false,
        folderId,
      });

      if (createRes.success === false) {
        return createRes;
      }

      return {
        success: true,
        data: {
          newPresentationObjectId: createRes.data.newPresentationObjectId,
          lastUpdated: createRes.data.lastUpdated,
          folderId,
        },
      };
    },
    (data) => p.close(data),
  );

  return (
    <AlertFormHolder
      formId="create-visualization"
      header={t2(T.FRENCH_UI_STRINGS.create_new_visualization)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <div class="ui-spy">
        <Input
          label={t2(T.FRENCH_UI_STRINGS.visualization_name)}
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
