import { createSignal } from "solid-js";
import { t3, type IcehStep1Result } from "lib";
import { serverActions } from "~/server_actions";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { FileUploadSelector } from "~/components/_file_upload_selector";

type Props = {
  step1Result: IcehStep1Result | undefined;
  setStep1Result: (result: IcehStep1Result | undefined) => void;
  silentFetch: () => Promise<void>;
  goNext: () => void;
};

export function Step1(p: Props) {
  const [selectedZipFileName, setSelectedZipFileName] = createSignal<string>(
    p.step1Result?.zipFileName ?? ""
  );
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step1Result);

  function updateSelectedZipFileName(fileName: string) {
    setNeedsSaving(true);
    setSelectedZipFileName(fileName);
  }

  const save = timActionForm(async () => {
    const zipAssetFileName = selectedZipFileName();
    if (!zipAssetFileName) {
      return {
        success: false,
        err: t3({ en: "You must select a zip file", fr: "Vous devez sélectionner un fichier zip" }),
      };
    }
    const res = await serverActions.updateDatasetIcehUploadAttemptStep1({
      zipAssetFileName,
    });
    if (res.success) {
      p.setStep1Result(res.data);
      setNeedsSaving(false);
    }
    return res;
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg mb-4">
        {t3({ en: "ICEH Zip File", fr: "Fichier Zip ICEH" })}
      </h3>
      <p class="text-neutral mb-4">
        {t3({
          en: "Upload a zip file downloaded from the ICEH Retriever (equidade.org/retriever). The zip should contain results_csv.csv and indicators.xlsx.",
          fr: "Téléversez un fichier zip téléchargé depuis le Retriever ICEH (equidade.org/retriever). Le zip doit contenir results_csv.csv et indicators.xlsx.",
        })}
      </p>

      <FileUploadSelector
        buttonLabel={t3({ en: "Upload zip file", fr: "Téléverser un fichier zip" })}
        selectLabel={t3({ en: "Select uploaded zip file", fr: "Sélectionner le fichier zip téléversé" })}
        filter={(a) => a.isZip}
        value={selectedZipFileName()}
        onChange={updateSelectedZipFileName}
      />

      <StateHolderFormError state={save.state()} />

      <div class="ui-gap-sm mt-6 flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving() || !selectedZipFileName()}
          iconName="save"
        >
          {t3({ en: "Validate zip", fr: "Valider le zip" })}
        </Button>

        {p.step1Result && (
          <Button onClick={p.goNext} intent="primary" iconName="arrow-right">
            {t3({ en: "Continue", fr: "Continuer" })}
          </Button>
        )}
      </div>

      {p.step1Result && (
        <div class="mt-6 rounded border p-4">
          <h4 class="font-700 mb-2">
            {t3({ en: "Zip Contents", fr: "Contenu du zip" })}
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
              {p.step1Result.strats.join(", ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
