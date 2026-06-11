import { t3, TC, type HfaFacilityWeightsImportResult } from "lib";
import {
  Button,
  Csv,
  FrameTop,
  StateHolderFormError,
  StateHolderWrapper,
  TableFromCsv,
  timActionDelete,
  timActionForm,
  timQuery,
  toNum0,
} from "panther";
import { For, Show, createMemo, createSignal } from "solid-js";
import { FileUploadSelector } from "~/components/_file_upload_selector";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  backToInstance: () => void;
};

export function HfaWeights(p: Props) {
  const items = timQuery(
    () => serverActions.getHfaFacilityWeightsItems({}),
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
  }, items.silentFetch);

  async function attemptDeleteAll() {
    const deleteAction = timActionDelete(
      t3({
        en: "Delete all facility sampling weights?",
        fr: "Supprimer toutes les pondérations d'échantillonnage ?",
      }),
      () => serverActions.deleteAllHfaFacilityWeights({}),
      items.silentFetch,
    );
    await deleteAction.click();
    setLastImport(null);
  }

  const hasWeights = () => instanceState.hfaWeights.some((tp) => tp.weightCount > 0);

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={p.backToInstance} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({
              en: "HFA facility sampling weights",
              fr: "Pondérations d'échantillonnage des établissements Enquêtes FOSA",
            })}
          </div>
          <div class="ui-gap-sm flex items-center">
            <Show when={hasWeights()}>
              <Button
                iconName="download"
                href={`${_SERVER_HOST}/structure/hfa_facility_weights/export/csv?t=${Date.now()}`}
                newTab
              >
                {t3(TC.download)}
              </Button>
            </Show>
            <Button iconName="refresh" onClick={items.fetch} />
          </div>
        </div>
      }
    >
      <div class="flex h-full w-full">
        <Show when={instanceState.currentUserIsGlobalAdmin}>
          <div class="ui-pad ui-spy border-base-300 w-72 flex-none overflow-auto border-r">
            <div class="text-neutral text-xs">
              {t3({
                en: "One row per facility, one column per time point. A blank cell means the facility is not in that round's sample. Importing replaces the stored weights for every time point present in the file (a blank cell removes a previously stored weight); time points not in the file are unchanged. The downloaded CSV can be edited and re-imported.",
                fr: "Une ligne par établissement, une colonne par point temporel. Une cellule vide signifie que l'établissement n'est pas dans l'échantillon de ce tour. L'importation remplace les pondérations enregistrées pour chaque point temporel présent dans le fichier (une cellule vide supprime une pondération précédemment enregistrée) ; les points temporels absents du fichier restent inchangés. Le CSV téléchargé peut être modifié et réimporté.",
              })}
            </div>
            <Show when={instanceState.hfaWeights.length > 0}>
              <div class="ui-spy-sm text-xs">
                <div class="font-700">
                  {t3({
                    en: "Coverage (facilities with data that have a weight)",
                    fr: "Couverture (établissements avec données disposant d'une pondération)",
                  })}
                </div>
                <For each={instanceState.hfaWeights}>
                  {(tp) => (
                    <div
                      class="ui-gap flex justify-between"
                      classList={{
                        "text-warning":
                          tp.weightCount > 0 &&
                          tp.facilitiesWithDataAndWeight < tp.facilitiesWithData,
                      }}
                    >
                      <span>{tp.timePoint}:</span>
                      <span class="font-mono">
                        {`${toNum0(tp.facilitiesWithDataAndWeight)}/${toNum0(tp.facilitiesWithData)}`}
                      </span>
                    </div>
                  )}
                </For>
                <Show
                  when={instanceState.hfaWeights.some(
                    (tp) =>
                      tp.weightCount > 0 &&
                      tp.facilitiesWithDataAndWeight < tp.facilitiesWithData,
                  )}
                >
                  <div class="text-warning">
                    {t3({
                      en: "Some facilities with data have no weight — they will count with weight 1 when weighted analysis is enabled.",
                      fr: "Certains établissements avec données n'ont pas de pondération — ils compteront avec une pondération de 1 lorsque l'analyse pondérée sera activée.",
                    })}
                  </div>
                </Show>
              </div>
            </Show>
            <FileUploadSelector
              buttonLabel={t3({ en: "Upload weights csv", fr: "Téléverser un CSV de pondérations" })}
              selectLabel={t3({ en: "Existing csv file to use", fr: "Fichier CSV existant à utiliser" })}
              filter={(a) => a.isCsv}
              value={selectedFileName()}
              onChange={setSelectedFileName}
              fullWidth
            />
            <StateHolderFormError state={importWeights.state()} />
            <Show when={lastImport()} keyed>
              {(keyedResult) => (
                <div class="text-success text-xs">
                  {t3({
                    en: `Imported ${toNum0(keyedResult.rowsImported)} weights across ${keyedResult.timePointsCovered.length} time point(s)`,
                    fr: `${toNum0(keyedResult.rowsImported)} pondérations importées sur ${keyedResult.timePointsCovered.length} point(s) temporel(s)`,
                  })}
                  <Show when={keyedResult.rowsSkippedNoWeight > 0}>
                    {" "}
                    {t3({
                      en: `(${toNum0(keyedResult.rowsSkippedNoWeight)} blank cell(s) — not in sample; any stored weight for these was removed)`,
                      fr: `(${toNum0(keyedResult.rowsSkippedNoWeight)} cellule(s) vide(s) — hors échantillon ; toute pondération enregistrée correspondante a été supprimée)`,
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
              <Show when={hasWeights()}>
                <Button
                  onClick={attemptDeleteAll}
                  intent="danger"
                  outline
                  iconName="trash"
                >
                  {t3({ en: "Delete all weights", fr: "Supprimer toutes les pondérations" })}
                </Button>
              </Show>
            </div>
          </div>
        </Show>
        <div class="h-full w-0 flex-1">
          <StateHolderWrapper state={items.state()}>
            {(keyedItems) => (
              <Show
                when={keyedItems.items.length > 0}
                fallback={
                  <div class="ui-pad text-neutral">
                    {t3({
                      en: "No weights imported",
                      fr: "Aucune pondération importée",
                    })}
                  </div>
                }
              >
                <WeightsTable
                  items={keyedItems.items}
                  totalCount={keyedItems.totalCount}
                />
              </Show>
            )}
          </StateHolderWrapper>
        </div>
      </div>
    </FrameTop>
  );
}

function WeightsTable(p: {
  items: Record<string, string>[];
  totalCount: number;
}) {
  const csv = createMemo(() => Csv.fromObjects(p.items));
  return (
    <TableFromCsv
      csv={csv()}
      knownTotalCount={p.totalCount}
      cellFormatter={(str) =>
        str === "null" || str === "undefined" || str === "" ? "." : str
      }
      alignText="left"
    />
  );
}
