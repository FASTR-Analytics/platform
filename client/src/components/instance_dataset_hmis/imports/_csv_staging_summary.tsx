import { t3, type DatasetCsvStagingResult } from "lib";
import { toNum0 } from "panther";
import { Show } from "solid-js";

type Props = {
  result: DatasetCsvStagingResult;
};

// The CSV staging diagnostics render (relocated from the deleted attempt
// wizard's review step) — used by the needs_review card and the CSV run
// detail.
export function CsvStagingSummary(p: Props) {
  const totalRecords = () =>
    p.result.periodIndicatorStats.reduce(
      (sum, stat) => sum + Number(stat.nRecords),
      0,
    );

  const uniquePeriods = () =>
    new Set(p.result.periodIndicatorStats.map((s) => s.periodId)).size;

  const uniqueIndicators = () =>
    new Set(p.result.periodIndicatorStats.map((s) => s.indicatorRawId)).size;

  return (
    <div class="ui-spy">
      <div class="ui-pad bg-base-200 rounded">
        <div class="flex justify-between">
          <span class="text-base-content">{t3({ en: "File:", fr: "Fichier :", pt: "Ficheiro:" })}</span>
          <span class="font-mono">{p.result.assetFileName}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-base-content">{t3({ en: "Import Date:", fr: "Date d'importation :", pt: "Data de importação:" })}</span>
          <span class="font-mono">
            {new Date(p.result.dateImported).toLocaleString()}
          </span>
        </div>
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <div class="font-700 mb-3">{t3({ en: "CSV Import Statistics", fr: "Statistiques d'importation CSV", pt: "Estatísticas de importação CSV" })}</div>
        <div class="ui-spy-sm">
          <div class="flex justify-between">
            <span class="text-base-content">
              {t3({ en: "Raw csv rows processed:", fr: "Lignes CSV brutes traitées :", pt: "Linhas CSV brutas processadas:" })}
            </span>
            <span class="font-mono">{toNum0(p.result.rawCsvRowCount)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">
              {t3({ en: "Valid rows in the csv:", fr: "Lignes valides dans le CSV :", pt: "Linhas válidas no CSV:" })}
            </span>
            <span class="font-mono">{toNum0(p.result.validCsvRowCount)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "Non-duplicate rows:", fr: "Lignes non dupliquées :", pt: "Linhas não duplicadas:" })}</span>
            <span class="font-mono">{toNum0(p.result.dedupedRowCount)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">
              {t3({ en: "Final rows ready for integrating:", fr: "Lignes finales prêtes pour l'intégration :", pt: "Linhas finais prontas para integração:" })}
            </span>
            <span class="font-700 text-success font-mono">
              {toNum0(p.result.finalStagingRowCount)}
            </span>
          </div>
        </div>
      </div>

      <Show
        when={
          p.result.validation &&
          ((p.result.validation.missingRequiredFields?.rowsDropped || 0) > 0 ||
            (p.result.validation.invalidCounts?.rowsDropped || 0) > 0 ||
            (p.result.validation.invalidPeriods?.rowsDropped || 0) > 0 ||
            (p.result.validation.invalidFacilities?.rowsDropped || 0) > 0 ||
            (p.result.validation.unmappedIndicators?.rowsDropped || 0) > 0)
            ? p.result.validation
            : undefined
        }
      >
        {(validation) => (
          <div class="ui-pad border-danger bg-base-200 rounded">
            <div class="font-700 text-danger mb-3">
              {t3({ en: "Validation Issues", fr: "Problèmes de validation", pt: "Problemas de validação" })}
            </div>
            <div class="ui-spy-sm">
              <Show when={validation().missingRequiredFields?.rowsDropped}>
                <div class="text-danger flex justify-between">
                  <span>
                    {t3({ en: "Invalid rows in csv file (because of missing required fields):", fr: "Lignes invalides dans le fichier CSV (champs requis manquants) :", pt: "Linhas inválidas no ficheiro CSV (campos obrigatórios em falta):" })}
                  </span>
                  <span class="font-mono">
                    {toNum0(validation().missingRequiredFields.rowsDropped)}{" "}
                    {t3({ en: "rows dropped", fr: "lignes supprimées", pt: "linhas descartadas" })}
                  </span>
                </div>
              </Show>
              <Show when={validation().invalidCounts?.rowsDropped}>
                <div class="text-danger flex justify-between">
                  <span>
                    {t3({ en: "Invalid rows in csv file (because of invalid values):", fr: "Lignes invalides dans le fichier CSV (valeurs invalides) :", pt: "Linhas inválidas no ficheiro CSV (valores inválidos):" })}
                  </span>
                  <span class="font-mono">
                    {toNum0(validation().invalidCounts.rowsDropped)}{" "}
                    {t3({ en: "rows dropped", fr: "lignes supprimées", pt: "linhas descartadas" })}
                  </span>
                </div>
              </Show>
              <Show when={validation().invalidPeriods?.rowsDropped}>
                <div class="text-danger flex justify-between">
                  <span>{t3({ en: "Invalid periods:", fr: "Périodes invalides :", pt: "Períodos inválidos:" })}</span>
                  <span class="font-mono">
                    {toNum0(validation().invalidPeriods.rowsDropped)}{" "}
                    {t3({ en: "rows dropped", fr: "lignes supprimées", pt: "linhas descartadas" })}
                  </span>
                </div>
              </Show>
              <Show when={validation().invalidFacilities?.rowsDropped}>
                <div class="text-danger flex justify-between">
                  <span>{t3({ en: "Invalid facilities:", fr: "Établissements invalides :", pt: "Estabelecimentos inválidos:" })}</span>
                  <span class="font-mono">
                    {toNum0(validation().invalidFacilities.rowsDropped)}{" "}
                    {t3({ en: "rows dropped", fr: "lignes supprimées", pt: "linhas descartadas" })}
                  </span>
                </div>
                <Show when={validation().invalidFacilities.sample?.length}>
                  <div class="text-base-content ml-4 text-sm">
                    <div class="mb-1">{t3({ en: "Sample invalid facilities:", fr: "Exemples d'établissements invalides :", pt: "Exemplos de estabelecimentos inválidos:" })}</div>
                    <div class="font-mono">
                      {validation()
                        .invalidFacilities.sample.slice(0, 5)
                        .map(
                          (facility) =>
                            `${facility.facility_id} (${toNum0(facility.row_count)} ${t3({ en: "rows", fr: "lignes", pt: "linhas" })})`,
                        )
                        .join(", ")}
                    </div>
                  </div>
                </Show>
              </Show>
              <Show when={validation().unmappedIndicators?.rowsDropped}>
                <div class="text-danger flex justify-between">
                  <span>{t3({ en: "Unmapped indicators:", fr: "Indicateurs non mappés :", pt: "Indicadores não mapeados:" })}</span>
                  <span class="font-mono">
                    {toNum0(validation().unmappedIndicators.rowsDropped)}{" "}
                    {t3({ en: "rows dropped", fr: "lignes supprimées", pt: "linhas descartadas" })}
                  </span>
                </div>
                <Show when={validation().unmappedIndicators.sample?.length}>
                  <div class="text-base-content ml-4 text-sm">
                    <div class="mb-1">{t3({ en: "Sample unmapped indicators:", fr: "Exemples d'indicateurs non mappés :", pt: "Exemplos de indicadores não mapeados:" })}</div>
                    <div class="font-mono">
                      {validation()
                        .unmappedIndicators.sample.slice(0, 5)
                        .map(
                          (indicator) =>
                            `${indicator.indicator_raw_id} (${toNum0(indicator.row_count)} ${t3({ en: "rows", fr: "lignes", pt: "linhas" })})`,
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
        <div class="font-700 mb-3">{t3({ en: "Staged Data To Import", fr: "Données préparées à importer", pt: "Dados preparados para importar" })}</div>
        <div class="ui-spy-sm">
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "Total records:", fr: "Total des enregistrements :", pt: "Total de registos:" })}</span>
            <span class="font-700 font-mono">{toNum0(totalRecords())}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "Unique periods:", fr: "Périodes uniques :", pt: "Períodos únicos:" })}</span>
            <span class="font-mono">{uniquePeriods()}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "Unique indicators:", fr: "Indicateurs uniques :", pt: "Indicadores únicos:" })}</span>
            <span class="font-mono">{uniqueIndicators()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
