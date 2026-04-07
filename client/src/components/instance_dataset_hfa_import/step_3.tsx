import { t3, type DatasetHfaCsvStagingResult } from "lib";
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
        <div class="font-700 text-lg">{t3({ en: "Data Staging", fr: "Préparation des données" })}</div>
        <Switch>
          <Match when={!p.step3Result}>
            <div class="border-base-300 rounded border p-4">
              <div class="">
                {t3({ en: "Ready to stage CSV data. This will validate and prepare the data for import.", fr: "Prêt à préparer les données CSV. Cela validera et préparera les données pour l'importation." })}
              </div>
            </div>
          </Match>
          <Match when={p.step3Result}>
            <div class="bg-success-50 border-success-300 rounded border p-4">
              <div class="text-success-700 flex items-center gap-2">
                <span>✓</span>
                <span>{t3({ en: "CSV data staged successfully", fr: "Données CSV préparées avec succès" })}</span>
              </div>
              <div class="text-success mt-2 text-sm">
                {t3({ en: "Total rows staged", fr: "Total de lignes préparées" })}: {toNum0(p.step3Result!.nRowsTotal)}
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
          {t3({ en: "Start staging", fr: "Lancer la préparation" })}
        </Button>
      </div>
    </div>
  );
}
