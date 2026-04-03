import { t3, type DatasetCsvStagingResult } from "lib";
import { Button, timActionButton, toNum0 } from "panther";
import { Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetCsvStagingResult;
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step4_Csv(p: Props) {
  const save = timActionButton(
    () => serverActions.finalizeDatasetIntegration({}),
    p.silentFetch,
  );

  const totalRecords = () => {
    return p.step3Result.periodIndicatorStats.reduce(
      (sum, stat) => sum + Number(stat.nRecords),
      0,
    );
  };

  const uniquePeriods = () => {
    const periods = new Set(
      p.step3Result.periodIndicatorStats.map((s) => s.periodId),
    );
    return periods.size;
  };

  const uniqueIndicators = () => {
    const indicators = new Set(
      p.step3Result.periodIndicatorStats.map((s) => s.indicatorRawId),
    );
    return indicators.size;
  };

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-spy">
        <div class="font-700 text-lg">{t3({ en: "Staging Complete", fr: "Préparation terminée" })}</div>

        <div class="ui-pad bg-base-200 rounded">
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "Source:", fr: "Source :" })}</span>
            <span class="font-mono">{t3({ en: "CSV Import", fr: "Importation CSV" })}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "File:", fr: "Fichier :" })}</span>
            <span class="font-mono">{p.step3Result.assetFileName}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "Import Date:", fr: "Date d'importation :" })}</span>
            <span class="font-mono">
              {new Date(p.step3Result.dateImported).toLocaleString()}
            </span>
          </div>
        </div>

        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t3({ en: "CSV Import Statistics", fr: "Statistiques d'importation CSV" })}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">
                {t3({ en: "Raw csv rows processed:", fr: "Lignes CSV brutes traitées :" })}
              </span>
              <span class="font-mono">
                {toNum0(p.step3Result.rawCsvRowCount)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">
                {t3({ en: "Valid rows in the csv:", fr: "Lignes valides dans le CSV :" })}
              </span>
              <span class="font-mono">
                {toNum0(p.step3Result.validCsvRowCount)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t3({ en: "Non-duplicate rows:", fr: "Lignes non dupliquées :" })}</span>
              <span class="font-mono">
                {toNum0(p.step3Result.dedupedRowCount)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">
                {t3({ en: "Final rows ready for integrating:", fr: "Lignes finales prêtes pour l'intégration :" })}
              </span>
              <span class="font-700 text-success font-mono">
                {toNum0(p.step3Result.finalStagingRowCount)}
              </span>
            </div>
          </div>
        </div>

        <Show
          when={
            p.step3Result.validation &&
            ((p.step3Result.validation.missingRequiredFields?.rowsDropped ||
              0) > 0 ||
              (p.step3Result.validation.invalidCounts?.rowsDropped || 0) > 0 ||
              (p.step3Result.validation.invalidPeriods?.rowsDropped || 0) > 0 ||
              (p.step3Result.validation.invalidFacilities?.rowsDropped || 0) >
                0 ||
              (p.step3Result.validation.unmappedIndicators?.rowsDropped || 0) >
                0)
              ? p.step3Result.validation
              : undefined
          }
        >
          {(validation) => (
            <div class="ui-pad border-danger bg-base-200 rounded">
              <div class="font-700 text-danger mb-3">
                {t3({ en: "Validation Issues", fr: "Problèmes de validation" })}
              </div>
              <div class="ui-spy-sm">
                <Show when={validation().missingRequiredFields?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>
                      {t3({ en: "Invalid rows in csv file (because of missing required fields):", fr: "Lignes invalides dans le fichier CSV (champs requis manquants) :" })}
                    </span>
                    <span class="font-mono">
                      {toNum0(validation().missingRequiredFields.rowsDropped)}{" "}
                      {t3({ en: "rows dropped", fr: "lignes supprimées" })}
                    </span>
                  </div>
                </Show>
                <Show when={validation().invalidCounts?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>
                      {t3({ en: "Invalid rows in csv file (because of invalid values):", fr: "Lignes invalides dans le fichier CSV (valeurs invalides) :" })}
                    </span>
                    <span class="font-mono">
                      {toNum0(validation().invalidCounts.rowsDropped)}{" "}
                      {t3({ en: "rows dropped", fr: "lignes supprimées" })}
                    </span>
                  </div>
                </Show>
                <Show when={validation().invalidPeriods?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>{t3({ en: "Invalid periods:", fr: "Périodes invalides :" })}</span>
                    <span class="font-mono">
                      {toNum0(validation().invalidPeriods.rowsDropped)}{" "}
                      {t3({ en: "rows dropped", fr: "lignes supprimées" })}
                    </span>
                  </div>
                </Show>
                <Show when={validation().invalidFacilities?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>{t3({ en: "Invalid facilities:", fr: "Établissements invalides :" })}</span>
                    <span class="font-mono">
                      {toNum0(validation().invalidFacilities.rowsDropped)}{" "}
                      {t3({ en: "rows dropped", fr: "lignes supprimées" })}
                    </span>
                  </div>
                  <Show when={validation().invalidFacilities.sample?.length}>
                    <div class="text-base-content ml-4 text-sm">
                      <div class="mb-1">{t3({ en: "Sample invalid facilities:", fr: "Exemples d'établissements invalides :" })}</div>
                      <div class="font-mono">
                        {validation()
                          .invalidFacilities.sample.slice(0, 5)
                          .map(
                            (facility: {
                              facility_id: string;
                              row_count: number;
                            }) =>
                              `${facility.facility_id} (${toNum0(facility.row_count)} ${t3({ en: "rows", fr: "lignes" })})`,
                          )
                          .join(", ")}
                      </div>
                    </div>
                  </Show>
                </Show>
                <Show when={validation().unmappedIndicators?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>{t3({ en: "Unmapped indicators:", fr: "Indicateurs non mappés :" })}</span>
                    <span class="font-mono">
                      {toNum0(validation().unmappedIndicators.rowsDropped)}{" "}
                      {t3({ en: "rows dropped", fr: "lignes supprimées" })}
                    </span>
                  </div>
                  <Show when={validation().unmappedIndicators.sample?.length}>
                    <div class="text-base-content ml-4 text-sm">
                      <div class="mb-1">{t3({ en: "Sample unmapped indicators:", fr: "Exemples d'indicateurs non mappés :" })}</div>
                      <div class="font-mono">
                        {validation()
                          .unmappedIndicators.sample.slice(0, 5)
                          .map(
                            (indicator: {
                              indicator_raw_id: string;
                              row_count: number;
                            }) =>
                              `${indicator.indicator_raw_id} (${toNum0(indicator.row_count)} ${t3({ en: "rows", fr: "lignes" })})`,
                          )
                          .join(", ")}
                      </div>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          )}
        </Show>

        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t3({ en: "Staged Data To Import", fr: "Données préparées à importer" })}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t3({ en: "Total records:", fr: "Total des enregistrements :" })}</span>
              <span class="font-700 font-mono">
                {totalRecords().toLocaleString()}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t3({ en: "Unique periods:", fr: "Périodes uniques :" })}</span>
              <span class="font-mono">{uniquePeriods()}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t3({ en: "Unique indicators:", fr: "Indicateurs uniques :" })}</span>
              <span class="font-mono">{uniqueIndicators()}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.finalStagingRowCount > 0}>
            <div class="ui-spy border-primary bg-primary/10 rounded border p-4">
              <div class="text-primary text-sm">
                {t3({ en: "Review the staging results above. Click 'Integrate and finalize' to complete the import process and make this data available in the dataset.", fr: "Vérifiez les résultats de la préparation ci-dessus. Cliquez sur « Intégrer et finaliser » pour terminer le processus d'importation et rendre ces données disponibles dans le jeu de données." })}
              </div>
              <div class="">
                <Button
                  onClick={save.click}
                  intent="success"
                  state={save.state()}
                  iconName="save"
                >
                  {t3({ en: "Integrate and finalize", fr: "Intégrer et finaliser" })}
                </Button>
              </div>
            </div>
          </Match>
          <Match when={true}>
            <div class="border-danger bg-danger/10 rounded border p-4">
              <div class="text-danger text-sm">
                {t3({ en: "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.", fr: "Il n'y a aucune ligne à importer. Retournez modifier la configuration ou supprimez la tentative d'importation." })}
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
