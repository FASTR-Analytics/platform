import { t3, type IcehStep1Result } from "lib";
import { serverActions } from "~/server_actions";
import { Button, StateHolderFormError, timActionForm } from "panther";

type Props = {
  step1Result: IcehStep1Result;
  silentFetch: () => Promise<void>;
  goPrev: () => void;
};

export function Step2(p: Props) {
  const startImport = timActionForm(async () => {
    return await serverActions.updateDatasetIcehUploadAttemptStep2({});
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg mb-4">
        {t3({ en: "Confirm Import", fr: "Confirmer l'importation" })}
      </h3>

      <div class="mb-6 rounded border p-4">
        <h4 class="font-700 mb-2">
          {t3({ en: "Data to Import", fr: "Données à importer" })}
        </h4>
        <div class="text-sm">
          <p>
            <strong>{t3({ en: "Country:", fr: "Pays :" })}</strong>{" "}
            {p.step1Result.countryName} ({p.step1Result.countryIso})
          </p>
          <p>
            <strong>{t3({ en: "Indicators:", fr: "Indicateurs :" })}</strong>{" "}
            {p.step1Result.indicatorCount}
          </p>
          <p>
            <strong>{t3({ en: "Data rows:", fr: "Lignes de données :" })}</strong>{" "}
            {p.step1Result.dataRowCount.toLocaleString()}
          </p>
          <p>
            <strong>{t3({ en: "Years:", fr: "Années :" })}</strong>{" "}
            {p.step1Result.years.join(", ")}
          </p>
          <p>
            <strong>{t3({ en: "Disaggregators:", fr: "Désagrégateurs :" })}</strong>{" "}
            {p.step1Result.strats.length}
          </p>
        </div>
      </div>

      <p class="text-warning mb-4">
        {t3({
          en: "This will replace all existing ICEH data. This action cannot be undone.",
          fr: "Cela remplacera toutes les données ICEH existantes. Cette action ne peut pas être annulée.",
        })}
      </p>

      <StateHolderFormError state={startImport.state()} />

      <div class="ui-gap-sm flex">
        <Button onClick={p.goPrev} iconName="arrow-left">
          {t3({ en: "Back", fr: "Retour" })}
        </Button>
        <Button
          onClick={startImport.click}
          intent="success"
          state={startImport.state()}
          iconName="upload"
        >
          {t3({ en: "Start Import", fr: "Démarrer l'importation" })}
        </Button>
      </div>
    </div>
  );
}
