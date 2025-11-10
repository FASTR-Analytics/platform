import { t } from "lib";
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
  }, p.silentRefreshInstance);

  return (
    <div class="ui-pad ui-spy">
      <div class="font-700 text-lg">{t("Ready to import from csv")}</div>
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
          {t("Start import")}
        </Button>
      </div>
    </div>
  );
}
