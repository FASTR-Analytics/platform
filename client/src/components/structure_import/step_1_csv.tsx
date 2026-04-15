import type Uppy from "@uppy/core";
import { Match, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { t3, TC, type CsvDetails } from "lib";
import {
  Button,
  Select,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
} from "panther";
import { cleanupUppy, createUppyInstance } from "~/components/_uppy_file_upload";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

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

  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-file-button",
      onUploadSuccess: (file) => {
        if (!file) {
          return;
        }
        updateSelectedFileName(file.name as string);
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  return (
    <div class="ui-pad ui-spy">
      <div class="">
        <Button id="select-file-button" iconName="upload">
          {t3({ en: "Upload new csv file to use", fr: "Téléverser un nouveau fichier CSV à utiliser" })}
        </Button>
      </div>
      <div class="w-96">
        <Select
          label={t3({ en: "Existing csv file to use", fr: "Fichier CSV existant à utiliser" })}
          options={getSelectOptions(
            instanceState.assets.filter((a) => a.isCsv).map((a) => a.fileName),
          )}
          value={selectedFileName()}
          onChange={updateSelectedFileName}
          fullWidth
        />
      </div>
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
