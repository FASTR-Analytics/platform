import { t3 } from "lib";
import {
  Button,
  ProgressBar,
  StateHolderFormError,
  getProgress,
  timActionForm,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  close: () => void;
  silentRefresUploadAttempt: () => Promise<void>;
  silentRefreshInstance: () => Promise<void>;
};

export function Step3_Csv(p: Props) {
  const { progressFrom0To100, progressMsg, onProgress } = getProgress();

  const executeImport = timActionForm(async () => {
    const res = await serverActions.structureStep3Csv_StageDataStreaming(
      {},
      onProgress,
    );
    if (res.success === false) {
      await p.silentRefresUploadAttempt();
    }
    return res;
  }, p.silentRefresUploadAttempt, p.silentRefreshInstance);

  return (
    <div class="ui-pad ui-spy">
      <div class="font-700 text-lg">{t3({ en: "Ready to import from csv", fr: "Prêt à importer depuis le CSV" })}</div>
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
          {t3({ en: "Start import", fr: "Démarrer l'importation" })}
        </Button>
      </div>
    </div>
  );
}
