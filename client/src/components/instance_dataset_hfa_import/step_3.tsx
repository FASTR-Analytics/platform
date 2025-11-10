import { t, type DatasetHfaCsvStagingResult } from "lib";
import { Button, timActionButton, toNum0 } from "panther";
import { Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetHfaCsvStagingResult | undefined;
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step3(p: Props) {
  const save = timActionButton(
    () => serverActions.updateDatasetHfaStaging({}),
    p.silentFetch,
  );

  const needsSaving = () => !p.step3Result;

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-spy-sm">
        <div class="font-700 text-lg">{t("Data Staging")}</div>
        <Switch>
          <Match when={!p.step3Result}>
            <div class="border-base-300 rounded border p-4">
              <div class="">
                {t(
                  "Ready to stage CSV data. This will validate and prepare the data for import.",
                )}
              </div>
            </div>
          </Match>
          <Match when={p.step3Result}>
            <div class="bg-success-50 border-success-300 rounded border p-4">
              <div class="text-success-700 flex items-center gap-2">
                <span>✓</span>
                <span>{t("CSV data staged successfully")}</span>
              </div>
              <div class="text-success mt-2 text-sm">
                {t("Total rows staged")}: {toNum0(p.step3Result!.nRowsTotal)}
              </div>
            </div>
          </Match>
        </Switch>
      </div>
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving()}
          iconName="database"
        >
          {t("Start staging")}
        </Button>
      </div>
    </div>
  );
}
