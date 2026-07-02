import { Match, Switch, createSignal } from "solid-js";
import {
  t3,
  type FacilityFamily,
  type StructureCsvStep1Result,
} from "lib";
import { Button, StateHolderFormError, createFormAction } from "panther";
import { serverActions } from "~/server_actions";
import { FileUploadSelector } from "~/components/_file_upload_selector";

type Props = {
  step1Result: StructureCsvStep1Result | undefined;
  family: FacilityFamily;
  silentFetch: () => Promise<void>;
};

export function Step1_Csv(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>(
    p.step1Result?.csv.fileName ?? "",
  );
  const [selectedXlsFormFileName, setSelectedXlsFormFileName] =
    createSignal<string>(p.step1Result?.xlsForm?.fileName ?? "");
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step1Result);

  function updateSelectedFileName(fileName: string) {
    setNeedsSaving(true);
    setSelectedFileName(fileName);
  }

  function updateSelectedXlsFormFileName(fileName: string) {
    setNeedsSaving(true);
    setSelectedXlsFormFileName(fileName);
  }

  const save = createFormAction(async () => {
    const assetFileName = selectedFileName();
    if (!assetFileName) {
      return { success: false, err: t3({ en: "You must select a file", fr: "Vous devez sélectionner un fichier" }) };
    }
    return serverActions.structureStep1Csv_UploadFile({
      family: p.family,
      assetFileName: assetFileName,
      xlsFormAssetFileName: selectedXlsFormFileName() || undefined,
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
      <h3 class="font-700 text-lg">
        {t3({
          en: "ODK questionnaire (XLSForm) — optional",
          fr: "Questionnaire ODK (XLSForm) — facultatif",
        })}
      </h3>
      <div class="text-base-content text-sm">
        {t3({
          en: "If your facility columns contain ODK select_one codes, provide the questionnaire and the codes will be replaced with their labels during import.",
          fr: "Si vos colonnes d'établissement contiennent des codes select_one ODK, fournissez le questionnaire et les codes seront remplacés par leurs libellés lors de l'importation.",
        })}
      </div>
      <FileUploadSelector
        buttonLabel={t3({ en: "Upload new XLSForm file", fr: "Téléverser un nouveau fichier XLSForm" })}
        selectLabel={t3({ en: "Existing XLSForm file to use", fr: "Fichier XLSForm existant à utiliser" })}
        filter={(a) => a.isXlsx}
        value={selectedXlsFormFileName()}
        onChange={updateSelectedXlsFormFileName}
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
