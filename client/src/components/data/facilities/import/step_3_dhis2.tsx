import { t3, type FacilityFamily } from "lib";
import {
  Button,
  ProgressBar,
  StateHolderFormError,
  getProgress,
  createFormAction,
} from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  family: FacilityFamily;
  silentRefresUploadAttempt: () => Promise<void>;
  silentRefreshInstance: () => Promise<void>;
};

export function Step3_Dhis2(p: Props) {
  const { progressFrom0To100, progressMsg, onProgress } = getProgress();

  const executeImport = createFormAction(async () => {
    const res = await serverActions.structureStep3Dhis2_StageDataStreaming(
      { family: p.family },
      onProgress,
    );
    if (res.success === false) {
      await p.silentRefresUploadAttempt();
    }
    return res;
  }, p.silentRefresUploadAttempt, p.silentRefreshInstance);

  return (
    <div class="ui-pad ui-spy">
      <div class="font-700 text-lg">{t3({ en: "Ready to import from DHIS2", fr: "Prêt à importer depuis DHIS2", pt: "Pronto para importar a partir do DHIS2" })}</div>
      <ProgressBar
        progressFrom0To100={progressFrom0To100()}
        progressMsg={progressMsg()}
        onlyShowWhenLoadingState={executeImport.state()}
      />
      <StateHolderFormError state={executeImport.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={executeImport.click}
          intent="success"
          state={executeImport.state()}
          iconName="database"
        >
          {t3({ en: "Start import", fr: "Démarrer l'importation", pt: "Iniciar importação" })}
        </Button>
      </div>
    </div>
  );
}
