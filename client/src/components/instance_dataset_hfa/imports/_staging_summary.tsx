import { t3, type DatasetHfaCsvStagingResult } from "lib";
import { toNum0 } from "panther";
import { Show } from "solid-js";

type Props = {
  result: DatasetHfaCsvStagingResult;
};

// The staging diagnostics render, relocated from the deleted attempt wizard's
// step 5. Shown on the needs_review card and on a History run's detail.
export function HfaStagingSummary(p: Props) {
  return (
    <div class="ui-spy">
      <div class="ui-pad bg-base-200 rounded">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Import Date", fr: "Date d'importation", pt: "Data de importação" })}
            </span>
            <span class="font-mono text-base">
              {new Date(p.result.dateImported).toLocaleString()}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Time Point", fr: "Point temporel", pt: "Ponto temporal" })}
            </span>
            <span class="font-mono text-base">{p.result.timePoint}</span>
          </div>
        </div>
      </div>

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
              {toNum0(p.result.nRowsInFile)}
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
              {t3({ en: "Total Values to Import (approx. equal to cols x rows)", fr: "Total de valeurs à importer (approx. colonnes x lignes)", pt: "Total de valores a importar (aprox. colunas x linhas)" })}
            </span>
            <span class="font-700 text-primary font-mono text-xl">
              {toNum0(p.result.nRowsTotal)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Invalid: Missing Facility ID", fr: "Invalide : identifiant d'établissement manquant", pt: "Inválido: ID do estabelecimento em falta" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.result.nRowsInvalidMissingFacilityId)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Invalid: Facility Not Found", fr: "Invalide : établissement introuvable", pt: "Inválido: estabelecimento não encontrado" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.result.nRowsInvalidFacilityNotFound)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Duplicate Rows", fr: "Lignes en double", pt: "Linhas duplicadas" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nRowsDuplicated)}
            </span>
            <span class="text-base-content-muted text-sm">
              {p.result.dedupStrategy === "first"
                ? t3({ en: "kept first row per facility", fr: "première ligne conservée par établissement", pt: "primeira linha mantida por estabelecimento" })
                : t3({ en: "kept last row per facility", fr: "dernière ligne conservée par établissement", pt: "última linha mantida por estabelecimento" })}
              {p.result.nDedupOverridesApplied > 0 &&
                `; ${toNum0(p.result.nDedupOverridesApplied)} ${t3({ en: "manual override(s)", fr: "remplacement(s) manuel(s)", pt: "substituição(ões) manual(is)" })}`}
            </span>
          </div>
          <Show when={p.result.nRowsFilteredOut > 0}>
            <div class="flex flex-col">
              <span class="text-base-content text-sm">
                {t3({ en: "Rows Removed by Filter", fr: "Lignes supprimées par le filtre", pt: "Linhas removidas pelo filtro" })}
              </span>
              <span class="font-700 font-mono text-xl">
                {toNum0(p.result.nRowsFilteredOut)}
              </span>
            </div>
          </Show>
        </div>
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">
          {t3({ en: "Data Dictionary", fr: "Dictionnaire de données", pt: "Dicionário de dados" })}
        </h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Variable labels extracted", fr: "Libellés de variables extraits", pt: "Etiquetas de variáveis extraídas" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nDictionaryVars)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Value labels extracted", fr: "Libellés de valeurs extraits", pt: "Etiquetas de valores extraídas" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nDictionaryValues)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "select_multiple questions expanded", fr: "Questions select_multiple développées", pt: "Questões select_multiple expandidas" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.result.nSelectMultipleExpanded)}
            </span>
          </div>
          <Show when={p.result.nXlsFormVarsNotInCsv > 0}>
            <div class="flex flex-col">
              <span class="text-base-content text-sm">
                {t3({ en: "XLSForm vars not in CSV (ok)", fr: "Variables XLSForm absentes du CSV (ok)", pt: "Variáveis XLSForm ausentes do CSV (ok)" })}
              </span>
              <span class="font-700 font-mono text-xl">
                {toNum0(p.result.nXlsFormVarsNotInCsv)}
              </span>
            </div>
          </Show>
          <Show when={p.result.nCsvColsNotInXlsForm > 0}>
            <div class="flex flex-col">
              <span class="text-base-content text-sm">
                {t3({ en: "CSV columns not in XLSForm (skipped)", fr: "Colonnes CSV absentes du XLSForm (ignorées)", pt: "Colunas CSV ausentes do XLSForm (ignoradas)" })}
              </span>
              <span class="font-700 font-mono text-xl">
                {toNum0(p.result.nCsvColsNotInXlsForm)}
              </span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
