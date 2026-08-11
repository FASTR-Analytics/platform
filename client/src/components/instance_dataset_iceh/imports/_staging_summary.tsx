import { t3, type IcehStagingResult } from "lib";
import { toNum0 } from "panther";
import { Show } from "solid-js";

type Props = {
  result: IcehStagingResult;
};

// The staging diagnostics render. Shown on the needs_review card and on a
// History run's detail. The three gating counters (unknown disaggregator /
// invalid year / unknown indicator) render in danger; missing estimates are
// normal for Retriever exports and never gate.
export function IcehStagingSummary(p: Props) {
  return (
    <div class="ui-spy">
      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">
          {t3({ en: "Row Statistics", fr: "Statistiques des lignes", pt: "Estatísticas das linhas" })}
        </h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Total Rows in File", fr: "Total de lignes dans le fichier", pt: "Total de linhas no ficheiro" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nRowsTotal)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Valid Rows", fr: "Lignes valides", pt: "Linhas válidas" })}
            </span>
            <span class="font-700 text-success font-mono text-xl">
              {toNum0(p.result.nRowsValid)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Skipped: Missing Estimate (normal)", fr: "Ignorées : estimation manquante (normal)", pt: "Ignoradas: estimativa em falta (normal)" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nRowsSkippedMissingEstimate)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Skipped: Unknown Disaggregator", fr: "Ignorées : désagrégateur inconnu", pt: "Ignoradas: desagregador desconhecido" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.result.nRowsSkippedUnknownStrat)}
            </span>
            <Show when={p.result.skippedUnknownStratSamples.length > 0}>
              <span class="text-base-content-muted font-mono text-sm">
                {p.result.skippedUnknownStratSamples.join(", ")}
              </span>
            </Show>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Skipped: Invalid Year", fr: "Ignorées : année invalide", pt: "Ignoradas: ano inválido" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.result.nRowsSkippedInvalidYear)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Skipped: Indicator Not in indicators.xlsx", fr: "Ignorées : indicateur absent de indicators.xlsx", pt: "Ignoradas: indicador ausente de indicators.xlsx" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.result.nRowsSkippedUnknownIndicator)}
            </span>
            <Show when={p.result.skippedUnknownIndicatorSamples.length > 0}>
              <span class="text-base-content-muted font-mono text-sm">
                {p.result.skippedUnknownIndicatorSamples.join(", ")}
              </span>
            </Show>
          </div>
        </div>
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">
          {t3({ en: "Data to Import", fr: "Données à importer", pt: "Dados a importar" })}
        </h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nIndicators)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Disaggregators", fr: "Désagrégateurs", pt: "Desagregadores" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nDisaggregators)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Years", fr: "Années", pt: "Anos" })}
            </span>
            <span class="font-mono text-base">
              {p.result.years.join(", ")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
