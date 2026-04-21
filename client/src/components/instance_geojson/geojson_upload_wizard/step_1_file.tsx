import { t3 } from "lib";
import { Button, Select, StateHolderFormError, getSelectOptions, timActionForm } from "panther";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import type { WizardState } from "./index";

type Props = {
  state: WizardState;
};

export function Step1File(p: Props) {
  const { state } = p;

  const analyzeAction = timActionForm(
    async () => {
      const fileName = state.selectedFileName();
      if (!fileName) {
        return { success: false, err: t3({ en: "Please select a file", fr: "Veuillez sélectionner un fichier" }) };
      }
      const res = await serverActions.analyzeGeoJsonUpload({ assetFileName: fileName });
      if (res.success) {
        state.setAnalysisResult(res.data);
        if (res.data.properties.length > 0) {
          state.setSelectedProp(res.data.properties[0]);
        }
        state.setStep(2);
      }
      return res;
    },
    () => {},
  );

  return (
    <div class="ui-spy">
      <div class="font-600">{t3({ en: "Step 1: Select GeoJSON file", fr: "Étape 1 : Sélectionner le fichier GeoJSON" })}</div>

      <Button id="select-geojson-file-button" iconName="upload">
        {t3({ en: "Upload new GeoJSON file", fr: "Téléverser un nouveau fichier GeoJSON" })}
      </Button>

      <div class="w-96">
        <Select
          label={t3({ en: "Or select existing file", fr: "Ou sélectionner un fichier existant" })}
          options={getSelectOptions(
            instanceState.assets
              .filter((a) => a.fileName.endsWith(".geojson") || a.fileName.endsWith(".json"))
              .map((a) => a.fileName),
          )}
          value={state.selectedFileName()}
          onChange={state.setSelectedFileName}
          fullWidth
        />
      </div>

      <StateHolderFormError state={analyzeAction.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={analyzeAction.click}
          state={analyzeAction.state()}
          disabled={!state.selectedFileName()}
          intent="primary"
        >
          {t3({ en: "Analyze", fr: "Analyser" })}
        </Button>
        <Button intent="neutral" onClick={() => state.setStep(0)}>
          {t3({ en: "Back", fr: "Retour" })}
        </Button>
      </div>
    </div>
  );
}
