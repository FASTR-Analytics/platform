import { t3, type HfaFacilityWeightsImportResult } from "lib";
import {
  Button,
  StateHolderFormError,
  StateHolderWrapper,
  timActionDelete,
  timActionForm,
  timQuery,
  toNum0,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { FileUploadSelector } from "~/components/_file_upload_selector";
import { serverActions } from "~/server_actions";

export function HfaWeightsSection() {
  const summary = timQuery(
    () => serverActions.getHfaFacilityWeightsSummary({}),
    t3({ en: "Loading weights...", fr: "Chargement des pondérations..." }),
  );

  const [selectedFileName, setSelectedFileName] = createSignal<string>("");
  const [lastImport, setLastImport] =
    createSignal<HfaFacilityWeightsImportResult | null>(null);

  const importWeights = timActionForm(async () => {
    const assetFileName = selectedFileName();
    if (!assetFileName) {
      return {
        success: false,
        err: t3({ en: "You must select a file", fr: "Vous devez sélectionner un fichier" }),
      };
    }
    const res = await serverActions.importHfaFacilityWeights({ assetFileName });
    if (res.success) {
      setLastImport(res.data);
    }
    return res;
  }, summary.silentFetch);

  async function attemptDeleteAll() {
    const deleteAction = timActionDelete(
      t3({
        en: "Delete all facility sampling weights?",
        fr: "Supprimer toutes les pondérations d'échantillonnage ?",
      }),
      () => serverActions.deleteAllHfaFacilityWeights({}),
      summary.silentFetch,
    );
    await deleteAction.click();
    setLastImport(null);
  }

  return (
    <div class="border-base-300 ui-spy-sm border-t pt-4">
      <div class="font-700 text-sm">
        {t3({ en: "Sampling weights", fr: "Pondérations d'échantillonnage" })}
      </div>
      <div class="text-neutral max-w-56 text-xs">
        {t3({
          en: "CSV with columns facility_id, time_point, weight. Re-uploading updates existing weights.",
          fr: "CSV avec colonnes facility_id, time_point, weight. Un nouveau téléversement met à jour les pondérations existantes.",
        })}
      </div>
      <StateHolderWrapper state={summary.state()}>
        {(keyedSummary) => (
          <Show
            when={keyedSummary.totalCount > 0}
            fallback={
              <div class="text-neutral text-xs">
                {t3({ en: "No weights imported", fr: "Aucune pondération importée" })}
              </div>
            }
          >
            <div class="ui-spy-sm text-xs">
              <For each={keyedSummary.perTimePoint}>
                {(tp) => (
                  <div class="ui-gap flex max-w-56 justify-between">
                    <span>{tp.timePoint}:</span>
                    <span class="font-mono">{toNum0(tp.count)}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        )}
      </StateHolderWrapper>
      <FileUploadSelector
        buttonLabel={t3({ en: "Upload weights csv", fr: "Téléverser un CSV de pondérations" })}
        selectLabel={t3({ en: "Existing csv file to use", fr: "Fichier CSV existant à utiliser" })}
        filter={(a) => a.isCsv}
        value={selectedFileName()}
        onChange={setSelectedFileName}
      />
      <StateHolderFormError state={importWeights.state()} />
      <Show when={lastImport()} keyed>
        {(keyedResult) => (
          <div class="text-success max-w-56 text-xs">
            {t3({
              en: `Imported ${toNum0(keyedResult.rowsImported)} weights across ${keyedResult.timePointsCovered.length} time point(s)`,
              fr: `${toNum0(keyedResult.rowsImported)} pondérations importées sur ${keyedResult.timePointsCovered.length} point(s) temporel(s)`,
            })}
            <Show when={keyedResult.rowsSkippedNoWeight > 0}>
              {" "}
              {t3({
                en: `(${toNum0(keyedResult.rowsSkippedNoWeight)} row(s) with no weight skipped — not in sample)`,
                fr: `(${toNum0(keyedResult.rowsSkippedNoWeight)} ligne(s) sans pondération ignorée(s) — hors échantillon)`,
              })}
            </Show>
          </div>
        )}
      </Show>
      <div class="ui-gap-sm flex flex-col">
        <Button
          onClick={importWeights.click}
          state={importWeights.state()}
          disabled={!selectedFileName()}
          iconName="upload"
        >
          {t3({ en: "Import weights", fr: "Importer les pondérations" })}
        </Button>
        <Button
          onClick={attemptDeleteAll}
          intent="danger"
          outline
          iconName="trash"
        >
          {t3({ en: "Delete all weights", fr: "Supprimer toutes les pondérations" })}
        </Button>
      </div>
    </div>
  );
}
