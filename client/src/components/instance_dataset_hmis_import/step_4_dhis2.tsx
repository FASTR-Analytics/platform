import { t3, type DatasetDhis2StagingResult } from "lib";
import { Button, timActionButton } from "panther";
import { For, Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetDhis2StagingResult;
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step4_Dhis2(p: Props) {
  const save = timActionButton(
    () => serverActions.finalizeDatasetIntegration({}),
    p.silentFetch,
  );

  return (
    <div class="ui-spy ui-pad flex flex-col">
      <div class="ui-pad border-base-300 rounded border">
        <h2 class="font-700 mb-4 text-lg">{t3({ en: "Import Summary", fr: "Résumé de l'importation" })}</h2>

        <div class="ui-gap grid grid-cols-12">
          <div class="col-span-12">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">{t3({ en: "Source Type:", fr: "Type de source :" })}</span>
                <span class="font-mono text-sm">
                  {p.step3Result.sourceType}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">{t3({ en: "Date Imported:", fr: "Date d'importation :" })}</span>
                <span class="font-mono text-sm">
                  {new Date(p.step3Result.dateImported).toLocaleString()}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  {t3({ en: "Total Indicator-Period Combos:", fr: "Total combinaisons indicateur-période :" })}
                </span>
                <span class="font-mono text-sm">
                  {p.step3Result.totalIndicatorPeriodCombos}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  {t3({ en: "Successful Fetches:", fr: "Récupérations réussies :" })}
                </span>
                <span class="font-mono text-sm" data-intent="success">
                  {p.step3Result.successfulFetches}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">{t3({ en: "Failed Fetches:", fr: "Récupérations échouées :" })}</span>
                <span
                  class="font-mono text-sm"
                  data-intent={
                    p.step3Result.failedFetches.length > 0
                      ? "danger"
                      : "neutral"
                  }
                >
                  {p.step3Result.failedFetches.length}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  {t3({ en: "Final Staging Row Count:", fr: "Total de lignes préparées :" })}
                </span>
                <span class="font-700 font-mono text-sm">
                  {p.step3Result.finalStagingRowCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {p.step3Result.failedFetches.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 text-danger mb-3 text-base">{t3({ en: "Failed Fetches", fr: "Récupérations échouées" })}</h3>
          <div class="max-h-48 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">{t3({ en: "Indicator ID", fr: "ID indicateur" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Period ID", fr: "ID période" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Error", fr: "Erreur" })}</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.failedFetches}>
                  {(fail) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">
                        {fail.indicatorRawId}
                      </td>
                      <td class="p-2 font-mono text-xs">{fail.periodId}</td>
                      <td class="text-danger p-2 text-xs">{fail.error}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.step3Result.periodIndicatorStats.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 mb-3 text-base">{t3({ en: "Period-Indicator Statistics", fr: "Statistiques période-indicateur" })}</h3>
          <div class="max-h-64 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">{t3({ en: "Period ID", fr: "ID période" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Indicator ID", fr: "ID indicateur" })}</th>
                  <th class="font-700 p-2 text-right">{t3({ en: "Records", fr: "Enregistrements" })}</th>
                  <th class="font-700 p-2 text-right">{t3({ en: "Total Count", fr: "Total" })}</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.periodIndicatorStats}>
                  {(stat) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">{stat.periodId}</td>
                      <td class="p-2 font-mono text-xs">
                        {stat.indicatorRawId}
                      </td>
                      <td class="p-2 text-right font-mono text-xs">
                        {stat.nRecords}
                      </td>
                      <td class="p-2 text-right font-mono text-xs">
                        {stat.totalCount}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.step3Result.workItemHistory.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 mb-3 text-base">{t3({ en: "Work Item History", fr: "Historique des tâches" })}</h3>
          <div class="max-h-48 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">{t3({ en: "Indicator ID", fr: "ID indicateur" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Period ID", fr: "ID période" })}</th>
                  <th class="font-700 p-2 text-center">{t3({ en: "Status", fr: "Statut" })}</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.workItemHistory}>
                  {(item) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">{item.indicatorId}</td>
                      <td class="p-2 font-mono text-xs">{item.periodId}</td>
                      <td class="p-2 text-center">
                        <span
                          class="text-xs"
                          data-intent={item.success ? "success" : "danger"}
                        >
                          {item.success ? t3({ en: "Success", fr: "Succès" }) : t3({ en: "Failed", fr: "Échoué" })}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.finalStagingRowCount > 0}>
            <Button
              onClick={save.click}
              intent="success"
              state={save.state()}
              iconName="save"
            >
              {t3({ en: "Integrate and finalize", fr: "Intégrer et finaliser" })}
            </Button>
          </Match>
          <Match when={true}>
            <div class="bg-warning-50 border-warning-300 rounded border p-3 text-sm">
              {t3({ en: "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.", fr: "Il n'y a aucune ligne à importer. Retournez modifier la configuration ou supprimez la tentative d'importation." })}
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
