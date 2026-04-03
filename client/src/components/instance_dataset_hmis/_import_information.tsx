import { DatasetHmisVersion,
  DatasetCsvStagingResult,
  DatasetDhis2StagingResult, t3 } from "lib";
import { Button, EditorComponentProps, FrameTop, toNum0 } from "panther";
import { Show, For } from "solid-js";
import { CollapsibleSection } from "panther";

export function ImportInformation(
  p: EditorComponentProps<
    {
      version: DatasetHmisVersion;
      isCurrentVersion: boolean;
      isGlobalAdmin: boolean;
    },
    undefined
  >,
) {
  const sourceType = () => p.version.stagingResult?.sourceType;
  const isCSV = () => sourceType() === "csv";
  const csvResult = () =>
    p.version.stagingResult?.sourceType === "csv"
      ? (p.version.stagingResult as DatasetCsvStagingResult)
      : null;
  const dhis2Result = () =>
    p.version.stagingResult?.sourceType === "dhis2"
      ? (p.version.stagingResult as DatasetDhis2StagingResult)
      : null;

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Import information", fr: "Informations sur l'importation" })}
          </div>
          {/* <div class="ui-gap-sm flex items-center">
            <Button iconName="refresh" onClick={versions.fetch} />
          </div> */}
        </div>
      }
    >
      <div class="ui-spy ui-pad">
        <div class="ui-gap grid grid-cols-12 items-start">
          <Show when={p.version.stagingResult}>
            <div class="ui-spy-sm border-base-300 ui-pad col-span-6 rounded border text-sm">
              <div class="font-700 text-base">{t3({ en: "Import summary", fr: "Résumé de l'importation" })}</div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t3({ en: "Import source", fr: "Source de l'importation" })}</div>
                <div class="flex-1">
                  {isCSV() ? t3({ en: "CSV Import", fr: "Importation CSV" }) : t3({ en: "DHIS2 Import", fr: "Importation DHIS2" })}
                </div>
              </div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t3({ en: "Date imported", fr: "Date d'importation" })}</div>
                <div class="flex-1">
                  {new Date(
                    p.version.stagingResult!.dateImported,
                  ).toLocaleString()}
                </div>
              </div>
              <Show when={csvResult()}>
                <div class="flex items-center">
                  <div class="w-56 flex-none">{t3({ en: "File name", fr: "Nom du fichier" })}</div>
                  <div class="flex-1">{csvResult()!.assetFileName}</div>
                </div>
              </Show>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t3({ en: "Rows inserted", fr: "Lignes insérées" })}</div>
                <div class="flex-1">{toNum0(p.version.nRowsInserted ?? 0)}</div>
              </div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t3({ en: "Rows updated", fr: "Lignes mises à jour" })}</div>
                <div class="flex-1">{toNum0(p.version.nRowsUpdated ?? 0)}</div>
              </div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t3({ en: "Total rows imported", fr: "Total de lignes importées" })}</div>
                <div class="flex-1">{toNum0(p.version.nRowsTotalImported)}</div>
              </div>
            </div>
          </Show>

          {/* CSV-specific statistics */}
          <Show when={csvResult()}>
            <div class="border-base-300 ui-pad ui-spy-sm col-span-6 rounded border text-sm">
              <div class="font-700 text-base">{t3({ en: "CSV import details", fr: "Détails de l'importation CSV" })}</div>
              <div class="flex justify-between">
                <span>{t3({ en: "Raw rows processed:", fr: "Lignes brutes traitées :" })}</span>
                <span>{toNum0(csvResult()!.rawCsvRowCount)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t3({ en: "Valid rows:", fr: "Lignes valides :" })}</span>
                <span>{toNum0(csvResult()!.validCsvRowCount)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t3({ en: "Deduplicated rows:", fr: "Lignes dédupliquées :" })}</span>
                <span>{toNum0(csvResult()!.dedupedRowCount)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t3({ en: "Final staging rows:", fr: "Lignes finales de préparation :" })}</span>
                <span>{toNum0(csvResult()!.finalStagingRowCount)}</span>
              </div>
            </div>
          </Show>

          {/* DHIS2-specific statistics */}
          <Show when={dhis2Result()}>
            <div class="border-base-300 ui-pad ui-spy-sm col-span-6 rounded border text-sm">
              <div class="font-700 text-base">{t3({ en: "DHIS2 import details", fr: "Détails de l'importation DHIS2" })}</div>
              <div class="flex justify-between">
                <span>{t3({ en: "Total indicator-period combinations:", fr: "Total de combinaisons indicateur-période :" })}</span>
                <span>{toNum0(dhis2Result()!.totalIndicatorPeriodCombos)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t3({ en: "Successful fetches:", fr: "Récupérations réussies :" })}</span>
                <span>{toNum0(dhis2Result()!.successfulFetches)}</span>
              </div>
              <Show
                when={dhis2Result()!.failedFetches.length > 0}
                fallback={
                  <div class="text-success flex justify-between">
                    <span>{t3({ en: "Failed fetches:", fr: "Récupérations échouées :" })}</span>
                    <span>0</span>
                  </div>
                }
              >
                <div class="text-danger flex justify-between">
                  <span>{t3({ en: "Failed fetches:", fr: "Récupérations échouées :" })}</span>
                  <span>{dhis2Result()!.failedFetches.length}</span>
                </div>
              </Show>
              <div class="flex justify-between">
                <span>{t3({ en: "Final staging rows:", fr: "Lignes finales de préparation :" })}</span>
                <span>{toNum0(dhis2Result()!.finalStagingRowCount)}</span>
              </div>
            </div>
          </Show>
        </div>

        {/* Period Indicator Statistics */}
        <Show when={p.version.stagingResult}>
          <CollapsibleSection title={t3({ en: "Period-indicator combinations", fr: "Combinaisons période-indicateur" })}>
            <div class="ui-pad max-h-[200px] overflow-auto">
              <For each={p.version.stagingResult?.periodIndicatorStats}>
                {(stat, index) => (
                  <div
                    class="border-base-300 grid grid-cols-4 items-center py-1 text-sm data-[topborder=true]:border-t"
                    data-topborder={index() > 0}
                  >
                    <div class="truncate">
                      {stat.periodId || `Period ${index() + 1}`}
                    </div>
                    <div class="truncate">
                      {isCSV()
                        ? (stat as any).indicatorCommonId
                        : (stat as any).indicatorRawId}
                    </div>
                    <div class="truncate">{toNum0(stat.nRecords)}</div>
                    <div class="truncate">{toNum0(stat.totalCount)}</div>
                  </div>
                )}
              </For>
            </div>
          </CollapsibleSection>
        </Show>

        <CollapsibleSection title={t3({ en: "Raw import metadata", fr: "Métadonnées brutes de l'importation" })}>
          <div class="ui-pad whitespace-pre-wrap font-mono text-sm">
            {JSON.stringify(p.version, null, 2)}
          </div>
        </CollapsibleSection>
      </div>
    </FrameTop>
  );
}
