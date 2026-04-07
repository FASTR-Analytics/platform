import type Uppy from "@uppy/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import { t3, TC, type DatasetHfaStep1Result } from "lib";
import { serverActions } from "~/server_actions";
import {
  Button,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
  getSelectOptions,
  timActionForm,
  timQuery,
} from "panther";
import { cleanupUppy, createUppyInstance } from "~/upload/uppy_file_upload";

type Props = {
  step1Result: DatasetHfaStep1Result | undefined;
  silentFetch: () => Promise<void>;
};

export function Step1(p: Props) {
  const [selectedCsvFileName, setSelectedCsvFileName] = createSignal<string>(
    p.step1Result?.csv.fileName ?? "",
  );
  const [selectedXlsFormFileName, setSelectedXlsFormFileName] =
    createSignal<string>(p.step1Result?.xlsForm.fileName ?? "");
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step1Result);

  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t3(TC.loadingAssets),
  );

  function updateSelectedCsvFileName(fileName: string) {
    setNeedsSaving(true);
    setSelectedCsvFileName(fileName);
  }

  function updateSelectedXlsFormFileName(fileName: string) {
    setNeedsSaving(true);
    setSelectedXlsFormFileName(fileName);
  }

  const save = timActionForm(async () => {
    const csvAssetFileName = selectedCsvFileName();
    const xlsFormAssetFileName = selectedXlsFormFileName();
    if (!csvAssetFileName) {
      return { success: false, err: t3({ en: "You must select a CSV data file", fr: "Vous devez sélectionner un fichier de données CSV" }) };
    }
    if (!xlsFormAssetFileName) {
      return {
        success: false,
        err: t3({ en: "You must select an XLSForm questionnaire file", fr: "Vous devez sélectionner un fichier questionnaire XLSForm" }),
      };
    }
    return serverActions.uploadDatasetHfaCsv({
      csvAssetFileName,
      xlsFormAssetFileName,
    });
  }, p.silentFetch);

  let uppyCsv: Uppy | undefined = undefined;
  let uppyXlsForm: Uppy | undefined = undefined;

  onMount(() => {
    uppyCsv = createUppyInstance({
      triggerId: "#select-csv-button",
      onModalClosed: () => {
        assetListing.fetch();
      },
      onUploadSuccess: (file) => {
        if (!file) return;
        updateSelectedCsvFileName(file.name as string);
      },
    });
    uppyXlsForm = createUppyInstance({
      triggerId: "#select-xlsform-button",
      onModalClosed: () => {
        assetListing.fetch();
      },
      onUploadSuccess: (file) => {
        if (!file) return;
        updateSelectedXlsFormFileName(file.name as string);
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppyCsv);
    cleanupUppy(uppyXlsForm);
  });

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg">{t3({ en: "CSV Data File", fr: "Fichier de données CSV" })}</h3>
      <div class="">
        <Button id="select-csv-button" iconName="upload">
          {t3({ en: "Upload new csv file to use", fr: "Téléverser un nouveau fichier CSV à utiliser" })}
        </Button>
      </div>
      <div class="w-96">
        <StateHolderWrapper state={assetListing.state()} noPad>
          {(keyedAssets) => {
            return (
              <Select
                label={t3({ en: "Existing csv file to use", fr: "Fichier CSV existant à utiliser" })}
                options={getSelectOptions(
                  keyedAssets.filter((a) => a.isCsv).map((a) => a.fileName),
                )}
                value={selectedCsvFileName()}
                onChange={updateSelectedCsvFileName}
                fullWidth
              />
            );
          }}
        </StateHolderWrapper>
      </div>

      <h3 class="font-700 text-lg">{t3({ en: "XLSForm Questionnaire File", fr: "Fichier questionnaire XLSForm" })}</h3>
      <div class="">
        <Button id="select-xlsform-button" iconName="upload">
          {t3({ en: "Upload new XLSForm file", fr: "Téléverser un nouveau fichier XLSForm" })}
        </Button>
      </div>
      <div class="w-96">
        <StateHolderWrapper state={assetListing.state()} noPad>
          {(keyedAssets) => {
            return (
              <Select
                label={t3({ en: "Existing XLSForm file to use", fr: "Fichier XLSForm existant à utiliser" })}
                options={getSelectOptions(
                  keyedAssets.filter((a) => a.isXlsx).map((a) => a.fileName),
                )}
                value={selectedXlsFormFileName()}
                onChange={updateSelectedXlsFormFileName}
                fullWidth
              />
            );
          }}
        </StateHolderWrapper>
      </div>

      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={
            !needsSaving() ||
            !selectedCsvFileName() ||
            !selectedXlsFormFileName()
          }
          iconName="save"
        >
          {t3(TC.save)}
        </Button>
      </div>
    </div>
  );
}
