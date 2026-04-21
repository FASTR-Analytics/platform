import { createSignal } from "solid-js";
import { t3, TC, type DatasetHfaStep1Result } from "lib";
import { serverActions } from "~/server_actions";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { FileUploadSelector } from "~/components/_file_upload_selector";

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

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg">{t3({ en: "CSV Data File", fr: "Fichier de données CSV" })}</h3>
      <FileUploadSelector
        buttonLabel={t3({ en: "Upload new csv file to use", fr: "Téléverser un nouveau fichier CSV à utiliser" })}
        selectLabel={t3({ en: "Existing csv file to use", fr: "Fichier CSV existant à utiliser" })}
        filter={(a) => a.isCsv}
        value={selectedCsvFileName()}
        onChange={updateSelectedCsvFileName}
      />

      <h3 class="font-700 text-lg">{t3({ en: "XLSForm Questionnaire File", fr: "Fichier questionnaire XLSForm" })}</h3>
      <FileUploadSelector
        buttonLabel={t3({ en: "Upload new XLSForm file", fr: "Téléverser un nouveau fichier XLSForm" })}
        selectLabel={t3({ en: "Existing XLSForm file to use", fr: "Fichier XLSForm existant à utiliser" })}
        filter={(a) => a.isXlsx}
        value={selectedXlsFormFileName()}
        onChange={updateSelectedXlsFormFileName}
      />

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
