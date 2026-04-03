import { t3, type DatasetHfaCsvStagingResult } from "lib";
import { Button, timActionButton, toNum0 } from "panther";
import { Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetHfaCsvStagingResult;
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step4(p: Props) {
  const save = timActionButton(
    () => serverActions.finalizeDatasetHfaIntegration({}),
    p.silentFetch,
  );
  return (
    <div class="ui-spy ui-pad">
      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t3({ en: "Staging Results Summary", fr: "Résumé des résultats de préparation" })}</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Import Date", fr: "Date d'importation" })}</span>
            <span class="font-mono text-base">
              {new Date(p.step3Result.dateImported).toLocaleString()}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Time Point", fr: "Point temporel" })}</span>
            <span class="font-mono text-base">
              {p.step3Result.timePointValue}
            </span>
          </div>
        </div>
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t3({ en: "Row Statistics", fr: "Statistiques des lignes" })}</h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Total Rows in File", fr: "Total de lignes dans le fichier" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nRowsInFile)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Valid Rows", fr: "Lignes valides" })}</span>
            <span class="font-700 text-success font-mono text-xl">
              {toNum0(p.step3Result.nRowsValid)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Total Values to Import (approx. equal to cols x rows)", fr: "Total de valeurs à importer (approx. colonnes x lignes)" })}
            </span>
            <span class="font-700 text-primary font-mono text-xl">
              {toNum0(p.step3Result.nRowsTotal)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Invalid: Missing Facility ID", fr: "Invalide : identifiant d'établissement manquant" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsInvalidMissingFacilityId)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Invalid: Facility Not Found", fr: "Invalide : établissement introuvable" })}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsInvalidFacilityNotFound)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t3({ en: "Duplicate Rows", fr: "Lignes en double" })}</span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsDuplicated)}
            </span>
          </div>
        </div>

        {(p.step3Result.nRowsInvalidMissingFacilityId > 0 ||
          p.step3Result.nRowsInvalidFacilityNotFound > 0 ||
          p.step3Result.nRowsDuplicated > 0) && (
          <div class="border-danger/30 bg-danger/5 mt-4 rounded border p-3">
            <div class="text-danger text-sm">
              {t3({ en: "Warning:", fr: "Avertissement :" })}{" "}
              {toNum0(
                p.step3Result.nRowsInvalidMissingFacilityId +
                  p.step3Result.nRowsInvalidFacilityNotFound +
                  p.step3Result.nRowsDuplicated,
              )}{" "}
              {t3({ en: "rows will be skipped due to validation errors or duplicates", fr: "lignes seront ignorées en raison d'erreurs de validation ou de doublons" })}
            </div>
          </div>
        )}
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t3({ en: "Data Dictionary", fr: "Dictionnaire de données" })}</h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Variable labels extracted", fr: "Libellés de variables extraits" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nDictionaryVars)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "Value labels extracted", fr: "Libellés de valeurs extraits" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nDictionaryValues)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t3({ en: "select_multiple questions expanded", fr: "Questions select_multiple développées" })}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nSelectMultipleExpanded)}
            </span>
          </div>
          {p.step3Result.nXlsFormVarsNotInCsv > 0 && (
            <div class="flex flex-col">
              <span class="text-base-content text-sm">
                {t3({ en: "XLSForm vars not in CSV (ok)", fr: "Variables XLSForm absentes du CSV (ok)" })}
              </span>
              <span class="font-700 font-mono text-xl">
                {toNum0(p.step3Result.nXlsFormVarsNotInCsv)}
              </span>
            </div>
          )}
          {p.step3Result.nCsvColsNotInXlsForm > 0 && (
            <div class="flex flex-col">
              <span class="text-base-content text-sm">
                {t3({ en: "CSV columns not in XLSForm (skipped)", fr: "Colonnes CSV absentes du XLSForm (ignorées)" })}
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
            <div class="ui-spy border-primary bg-primary/10 rounded border p-4">
              <div class="text-primary text-sm">
                {t3({ en: "Review the staging results above. Click 'Integrate and finalize' to complete the import process and make this data available in the dataset.", fr: "Vérifiez les résultats de préparation ci-dessus. Cliquez sur « Intégrer et finaliser » pour terminer le processus d'importation et rendre ces données disponibles dans le jeu de données." })}
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
                {t3({ en: "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.", fr: "Aucune ligne à importer. Retournez modifier la configuration de téléversement ou supprimez la tentative de téléversement." })}
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
