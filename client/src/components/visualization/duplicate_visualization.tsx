import { PresentationObjectDetail, isFrench, t2, T } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { t } from "lib";

export function DuplicateVisualization(
  p: AlertComponentProps<
    {
      projectId: string;
      poDetail: PresentationObjectDetail;
    },
    { newPresentationObjectId: string; lastUpdated: string }
  >,
) {
  // Temp state

  const [tempLabel, setTempLabel] = createSignal<string>(p.poDetail.label);

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

      return serverActions.duplicatePresentationObject({
        projectId: p.projectId,
        po_id: p.poDetail.id,
        label,
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
      <Input
        label={t2(T.FRENCH_UI_STRINGS.new_visualization_name)}
        value={tempLabel()}
        onChange={setTempLabel}
        fullWidth
        autoFocus
      />
    </AlertFormHolder>
  );
}
