import { Match, Switch, createSignal } from "solid-js";
import { t3, type CsvDetails } from "lib";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { serverActions } from "~/server_actions";
import { FileUploadSelector } from "~/components/_file_upload_selector";

type Props = {
  step1Result: CsvDetails | undefined;
  silentFetch: () => Promise<void>;
};

export function Step1_Csv(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>(
    p.step1Result?.fileName ?? "",
  );
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step1Result);

  function updateSelectedFileName(fileName: string) {
    setNeedsSaving(true);
    setSelectedFileName(fileName);
  }

  const save = timActionForm(async () => {
    const assetFileName = selectedFileName();
    if (!assetFileName) {
      return { success: false, err: t3({ en: "You must select a file", fr: "Vous devez sélectionner un fichier" }) };
    }
    return serverActions.structureStep1Csv_UploadFile({
      assetFileName: assetFileName,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <FileUploadSelector
        buttonLabel={t3({ en: "Upload new csv file to use", fr: "Téléverser un nouveau fichier CSV à utiliser" })}
        selectLabel={t3({ en: "Existing csv file to use", fr: "Fichier CSV existant à utiliser" })}
        filter={(a) => a.isCsv}
        value={selectedFileName()}
        onChange={updateSelectedFileName}
      />
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={needsSaving()}>
            <Button
              onClick={save.click}
              intent="success"
              state={save.state()}
              disabled={!selectedFileName()}
              iconName="save"
            >
              {t3({ en: "Save and continue", fr: "Sauvegarder et continuer" })}
            </Button>
          </Match>
          <Match when={true}>
            <div class="text-success">
              {t3({ en: "CSV file uploaded successfully", fr: "Fichier CSV téléversé avec succès" })}
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
