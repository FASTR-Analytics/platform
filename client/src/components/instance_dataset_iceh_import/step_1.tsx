import { createSignal, Show } from "solid-js";
import { t3, TC, type IcehStep1Result } from "lib";
import { serverActions } from "~/server_actions";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { FileUploadSelector } from "~/components/_file_upload_selector";

type Props = {
  step1Result: IcehStep1Result | undefined;
  silentFetch: () => Promise<void>;
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
        err: t3({
          en: "You must select a zip file",
          fr: "Vous devez sélectionner un fichier zip",
        }),
      };
    }
    return serverActions.updateDatasetIcehUploadAttemptStep1({
      zipAssetFileName,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg">
        {t3({ en: "ICEH Zip File", fr: "Fichier Zip ICEH" })}
      </h3>
      <p class="text-neutral">
        {t3({
          en: "Upload a zip file downloaded from the ICEH Retriever (equidade.org/retriever). The zip should contain results_csv.csv and indicators.xlsx.",
          fr: "Téléversez un fichier zip téléchargé depuis le Retriever ICEH (equidade.org/retriever). Le zip doit contenir results_csv.csv et indicators.xlsx.",
        })}
      </p>

      <FileUploadSelector
        buttonLabel={t3({
          en: "Upload new zip file to use",
          fr: "Téléverser un nouveau fichier zip à utiliser",
        })}
        selectLabel={t3({
          en: "Existing zip file to use",
          fr: "Fichier zip existant à utiliser",
        })}
        filter={(a) => a.isZip}
        value={selectedZipFileName()}
        onChange={updateSelectedZipFileName}
      />

      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving() || !selectedZipFileName()}
          iconName="save"
        >
          {t3(TC.save)}
        </Button>
      </div>

      <Show when={p.step1Result}>
        {(result) => (
          <div class="rounded border p-4">
            <h4 class="font-700 mb-2">
              {t3({ en: "Zip Contents", fr: "Contenu du zip" })}
            </h4>
            <div class="text-sm">
              <p>
                <strong>{t3({ en: "Country:", fr: "Pays :" })}</strong>{" "}
                {result().countryName} ({result().countryIso})
              </p>
              <p>
                <strong>{t3({ en: "Indicators:", fr: "Indicateurs :" })}</strong>{" "}
                {result().indicatorCount}
              </p>
              <p>
                <strong>
                  {t3({ en: "Data rows:", fr: "Lignes de données :" })}
                </strong>{" "}
                {result().dataRowCount.toLocaleString()}
              </p>
              <p>
                <strong>{t3({ en: "Years:", fr: "Années :" })}</strong>{" "}
                {result().years.join(", ")}
              </p>
              <p>
                <strong>
                  {t3({ en: "Disaggregators:", fr: "Désagrégateurs :" })}
                </strong>{" "}
                {result().strats.join(", ")}
              </p>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
