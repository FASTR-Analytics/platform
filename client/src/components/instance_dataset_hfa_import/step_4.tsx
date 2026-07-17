import { t3, type DatasetHfaCsvStagingResult } from "lib";
import { Button, createButtonAction, toNum0 } from "panther";
import { Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetHfaCsvStagingResult;
  silentFetch: () => Promise<void>;
};

export function Step4(p: Props) {
  const save = createButtonAction(
    () => serverActions.finalizeDatasetHfaIntegration({}),
    p.silentFetch,
  );
  return (
    <div class="ui-spy ui-pad">
      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t3({ en: "Staging Results Summary", fr: "Résumé des résultats de préparation", pt: "Resumo dos resultados de preparação" })}</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Import Date", fr: "Date d'importation", pt: "Data de importação" })}</span>
            <span class="font-mono text-base">
              {new Date(p.step3Result.dateImported).toLocaleString()}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Time Point", fr: "Point temporel", pt: "Ponto temporal" })}</span>
            <span class="font-mono text-base">
              {p.step3Result.timePoint}
            </span>
          </div>
        </div>
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t3({ en: "Row Statistics", fr: "Statistiques des lignes", pt: "Estatísticas das linhas" })}</h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Total Rows in File", fr: "Total de lignes dans le fichier", pt: "Total de linhas no ficheiro" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nRowsInFile)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Valid Rows", fr: "Lignes valides", pt: "Linhas válidas" })}</span>
            <span class="font-700 text-success font-mono text-xl">
              {toNum0(p.step3Result.nRowsValid)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Total Values to Import (approx. equal to cols x rows)", fr: "Total de valeurs à importer (approx. colonnes x lignes)", pt: "Total de valores a importar (aprox. colunas x linhas)" })}
            </span>
            <span class="font-700 text-primary font-mono text-xl">
              {toNum0(p.step3Result.nRowsTotal)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Invalid: Missing Facility ID", fr: "Invalide : identifiant d'établissement manquant", pt: "Inválido: ID do estabelecimento em falta" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsInvalidMissingFacilityId)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Invalid: Facility Not Found", fr: "Invalide : établissement introuvable", pt: "Inválido: estabelecimento não encontrado" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsInvalidFacilityNotFound)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Duplicate Rows", fr: "Lignes en double", pt: "Linhas duplicadas" })}</span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsDuplicated)}
            </span>
          </div>
        </div>

        {(p.step3Result.nRowsInvalidMissingFacilityId > 0 ||
          p.step3Result.nRowsInvalidFacilityNotFound > 0 ||
          p.step3Result.nRowsDuplicated > 0) && (
          <div class="border-danger bg-danger-subtle mt-4 rounded border p-3">
            <div class="text-danger text-sm">
              {t3({ en: "Warning:", fr: "Avertissement :", pt: "Aviso:" })}{" "}
              {toNum0(
                p.step3Result.nRowsInvalidMissingFacilityId +
                  p.step3Result.nRowsInvalidFacilityNotFound +
                  p.step3Result.nRowsDuplicated,
              )}{" "}
              {t3({ en: "rows will be skipped due to validation errors or duplicates", fr: "lignes seront ignorées en raison d'erreurs de validation ou de doublons", pt: "linhas serão ignoradas devido a erros de validação ou duplicados" })}
            </div>
          </div>
        )}
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t3({ en: "Data Dictionary", fr: "Dictionnaire de données", pt: "Dicionário de dados" })}</h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Variable labels extracted", fr: "Libellés de variables extraits", pt: "Etiquetas de variáveis extraídas" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nDictionaryVars)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Value labels extracted", fr: "Libellés de valeurs extraits", pt: "Etiquetas de valores extraídas" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nDictionaryValues)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "select_multiple questions expanded", fr: "Questions select_multiple développées", pt: "Questões select_multiple expandidas" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nSelectMultipleExpanded)}
            </span>
          </div>
          {p.step3Result.nXlsFormVarsNotInCsv > 0 && (
            <div class="flex flex-col">
              <span class="text-base-content text-sm">
                {t3({ en: "XLSForm vars not in CSV (ok)", fr: "Variables XLSForm absentes du CSV (ok)", pt: "Variáveis XLSForm ausentes do CSV (ok)" })}
              </span>
              <span class="font-700 font-mono text-xl">
                {toNum0(p.step3Result.nXlsFormVarsNotInCsv)}
              </span>
            </div>
          )}
          {p.step3Result.nCsvColsNotInXlsForm > 0 && (
            <div class="flex flex-col">
              <span class="text-base-content text-sm">
                {t3({ en: "CSV columns not in XLSForm (skipped)", fr: "Colonnes CSV absentes du XLSForm (ignorées)", pt: "Colunas CSV ausentes do XLSForm (ignoradas)" })}
              </span>
              <span class="font-700 font-mono text-xl">
                {toNum0(p.step3Result.nCsvColsNotInXlsForm)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.nRowsTotal > 0}>
            <div class="ui-spy border-primary bg-primary-subtle rounded border p-4">
              <div class="text-primary text-sm">
                {t3({ en: "Review the staging results above. Click 'Integrate and finalize' to complete the import process and make this data available in the dataset.", fr: "Vérifiez les résultats de préparation ci-dessus. Cliquez sur « Intégrer et finaliser » pour terminer le processus d'importation et rendre ces données disponibles dans le jeu de données.", pt: "Reveja os resultados de preparação acima. Clique em 'Integrar e finalizar' para concluir o processo de importação e disponibilizar estes dados no conjunto de dados." })}
              </div>
              <div class="">
                <Button
                  onClick={save.click}
                  intent="success"
                  state={save.state()}
                  iconName="save"
                >
                  {t3({ en: "Integrate and finalize", fr: "Intégrer et finaliser", pt: "Integrar e finalizar" })}
                </Button>
              </div>
            </div>
          </Match>
          <Match when={true}>
            <div class="border-danger bg-danger-subtle rounded border p-4">
              <div class="text-danger text-sm">
                {t3({ en: "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.", fr: "Aucune ligne à importer. Retournez modifier la configuration de téléversement ou supprimez la tentative de téléversement.", pt: "Não há linhas para importar. Volte atrás e edite esta configuração de carregamento, ou elimine a tentativa de carregamento." })}
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
