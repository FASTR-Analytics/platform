import type Uppy from "@uppy/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import { t, t2, T, type DatasetHfaStep1Result } from "lib";
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
    t2(T.FRENCH_UI_STRINGS.loading_asset_files),
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
      return { success: false, err: t("You must select a CSV data file") };
    }
    if (!xlsFormAssetFileName) {
      return {
        success: false,
        err: t("You must select an XLSForm questionnaire file"),
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
      <h3 class="font-700 text-lg">{t("CSV Data File")}</h3>
      <div class="">
        <Button id="select-csv-button" iconName="upload">
          {t2(T.FRENCH_UI_STRINGS.upload_new_csv_file_to_use)}
        </Button>
      </div>
      <div class="w-96">
        <StateHolderWrapper state={assetListing.state()} noPad>
          {(keyedAssets) => {
            return (
              <Select
                label={t2(T.FRENCH_UI_STRINGS.existing_csv_file_to_use)}
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

      <h3 class="font-700 text-lg">{t("XLSForm Questionnaire File")}</h3>
      <div class="">
        <Button id="select-xlsform-button" iconName="upload">
          {t("Upload new XLSForm file")}
        </Button>
      </div>
      <div class="w-96">
        <StateHolderWrapper state={assetListing.state()} noPad>
          {(keyedAssets) => {
            return (
              <Select
                label={t("Existing XLSForm file to use")}
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
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
      </div>
    </div>
  );
}
