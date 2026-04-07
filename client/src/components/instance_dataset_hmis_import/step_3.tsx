import { t3, type DatasetStagingResult } from "lib";
import { Button, RadioGroup, timActionButton, toNum0 } from "panther";
import { Match, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetStagingResult | undefined;
  sourceType: "csv" | "dhis2";
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step3(p: Props) {
  const [failFastMode, setFailFastMode] = createSignal<
    "fail-fast" | "continue-on-error"
  >("fail-fast");

  const save = timActionButton(
    () =>
      serverActions.updateDatasetStaging({
        failFastMode: p.sourceType === "dhis2" ? failFastMode() : undefined,
      }),
    p.silentFetch,
  );

  const isCSV = () => p.sourceType === "csv";
  const needsSaving = () => !p.step3Result;

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-spy-sm">
        <div class="font-700 text-lg">{t3({ en: "Data Staging", fr: "Préparation des données" })}</div>
        <Switch>
          <Match when={!p.step3Result}>
            <div class="border-base-300 rounded border p-4">
              <Switch>
                <Match when={isCSV()}>
                  <div class="">
                    {t3({ en: "Ready to stage CSV data. This will validate and prepare the data for import.", fr: "Prêt à préparer les données CSV. Cela validera et préparera les données pour l'importation." })}
                  </div>
                </Match>
                <Match when={true}>
                  <div class="ui-spy">
                    <div class="">
                      {t3({ en: "Ready to fetch data from DHIS2. This will retrieve the selected indicators and periods.", fr: "Prêt à récupérer les données depuis DHIS2. Cela récupérera les indicateurs et périodes sélectionnés." })}
                    </div>
                    <div class="ui-spy-sm">
                      <div class="">
                        {t3({ en: "What should happen if any period-indicator combination fails?", fr: "Que faire si une combinaison période-indicateur échoue ?" })}
                      </div>
                      <RadioGroup
                        options={[
                          {
                            value: "fail-fast",
                            label: t3({ en: "Abort the entire import attempt", fr: "Abandonner la totalité de l'importation" }),
                          },
                          {
                            value: "continue-on-error",
                            label: t3({ en: "Keep any period-indicator combinations that succeed, and report the errors", fr: "Conserver les combinaisons période-indicateur réussies et signaler les erreurs" }),
                          },
                        ]}
                        value={failFastMode()}
                        onChange={setFailFastMode}
                      />
                    </div>
                  </div>
                </Match>
              </Switch>
            </div>
          </Match>
          <Match when={p.step3Result}>
            <div class="bg-success-50 border-success-300 rounded border p-4">
              <div class="text-success-700 flex items-center gap-2">
                <span>✓</span>
                <span>
                  {isCSV()
                    ? t3({ en: "CSV data staged successfully", fr: "Données CSV préparées avec succès" })
                    : t3({ en: "DHIS2 data fetched successfully", fr: "Données DHIS2 récupérées avec succès" })}
                </span>
              </div>
              <div class="text-success mt-2 text-sm">
                {t3({ en: "Total rows staged", fr: "Total de lignes préparées" })}:{" "}
                {toNum0(p.step3Result!.finalStagingRowCount)}
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
          {isCSV() ? t3({ en: "Start staging", fr: "Commencer la préparation" }) : t3({ en: "Start fetching from DHIS2", fr: "Commencer la récupération depuis DHIS2" })}
        </Button>
      </div>
    </div>
  );
}
