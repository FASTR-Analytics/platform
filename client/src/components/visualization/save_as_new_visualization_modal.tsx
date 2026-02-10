import {
  isFrench,
  PresentationObjectConfig,
  PresentationObjectDetail,
  t3,
  TC,
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
    { value: "_none", label: t3(TC.general) },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return { success: false, err: t3(TC.mustEnterName) };
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
      header={t3({ en: "Create visualization", fr: "Créer une visualisation" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Visualization name", fr: "Nom de la visualisation" })}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        <Select
          label={t3(TC.folder)}
          options={folderOptions()}
          value={tempFolderId()}
          onChange={setTempFolderId}
          fullWidth
        />
      </div>
    </AlertFormHolder>
  );
}
