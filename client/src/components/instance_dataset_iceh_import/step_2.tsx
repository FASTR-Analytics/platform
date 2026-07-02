import { t3, type IcehStep1Result } from "lib";
import { serverActions } from "~/server_actions";
import { Button, StateHolderFormError, createFormAction } from "panther";

type Props = {
  step1Result: IcehStep1Result;
  silentFetch: () => Promise<void>;
};

export function Step2(p: Props) {
  const startImport = createFormAction(async () => {
    return await serverActions.updateDatasetIcehUploadAttemptStep2({});
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg">
        {t3({ en: "Confirm import", fr: "Confirmer l'importation", pt: "Confirmar a importação" })}
      </h3>

      <div class="border-base-300 rounded border p-4">
        <h4 class="font-700 mb-2">
          {t3({ en: "Data to import", fr: "Données à importer", pt: "Dados a importar" })}
        </h4>
        <div class="text-sm">
          <p>
            <strong>{t3({ en: "Country:", fr: "Pays :", pt: "País:" })}</strong>{" "}
            {p.step1Result.countryName} ({p.step1Result.countryIso})
          </p>
          <p>
            <strong>{t3({ en: "Indicators:", fr: "Indicateurs :", pt: "Indicadores:" })}</strong>{" "}
            {p.step1Result.indicatorCount}
          </p>
          <p>
            <strong>
              {t3({ en: "Data rows:", fr: "Lignes de données :", pt: "Linhas de dados:" })}
            </strong>{" "}
            {p.step1Result.dataRowCount.toLocaleString()}
          </p>
          <p>
            <strong>{t3({ en: "Years:", fr: "Années :", pt: "Anos:" })}</strong>{" "}
            {p.step1Result.years.join(", ")}
          </p>
          <p>
            <strong>
              {t3({ en: "Disaggregators:", fr: "Désagrégateurs :", pt: "Desagregadores:" })}
            </strong>{" "}
            {p.step1Result.strats.length}
          </p>
        </div>
      </div>

      <p class="text-warning">
        {t3({
          en: "This imports the indicators in this file, replacing any existing data for those same indicators and keeping all other indicators. Imports are cumulative. This cannot be undone.",
          fr: "Cela importe les indicateurs de ce fichier, en remplaçant les données existantes pour ces mêmes indicateurs et en conservant tous les autres indicateurs. Les importations sont cumulatives. Cette action ne peut pas être annulée.",
          pt: "Isto importa os indicadores deste ficheiro, substituindo os dados existentes para esses mesmos indicadores e mantendo todos os outros indicadores. As importações são cumulativas. Esta ação não pode ser anulada.",
        })}
      </p>

      <StateHolderFormError state={startImport.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={startImport.click}
          intent="success"
          state={startImport.state()}
          iconName="database"
        >
          {t3({ en: "Start import", fr: "Démarrer l'importation", pt: "Iniciar a importação" })}
        </Button>
      </div>
    </div>
  );
}
