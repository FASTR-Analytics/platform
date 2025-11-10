import { DatasetHmisVersion,
  DatasetCsvStagingResult,
  DatasetDhis2StagingResult, t2, T } from "lib";
import { Button, EditorComponentProps, FrameTop, toNum0 } from "panther";
import { Show, For } from "solid-js";
import { t } from "lib";
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
            {t2(T.FRENCH_UI_STRINGS.import_information)}
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
              <div class="font-700 text-base">{t("Import summary")}</div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t("Import source")}</div>
                <div class="flex-1">
                  {isCSV() ? "CSV Import" : "DHIS2 Import"}
                </div>
              </div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t2(T.FRENCH_UI_STRINGS.date_imported)}</div>
                <div class="flex-1">
                  {new Date(
                    p.version.stagingResult!.dateImported,
                  ).toLocaleString()}
                </div>
              </div>
              <Show when={csvResult()}>
                <div class="flex items-center">
                  <div class="w-56 flex-none">{t("File name")}</div>
                  <div class="flex-1">{csvResult()!.assetFileName}</div>
                </div>
              </Show>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t("Rows inserted")}</div>
                <div class="flex-1">{toNum0(p.version.nRowsInserted ?? 0)}</div>
              </div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t("Rows updated")}</div>
                <div class="flex-1">{toNum0(p.version.nRowsUpdated ?? 0)}</div>
              </div>
              <div class="flex items-center">
                <div class="w-56 flex-none">{t("Total rows imported")}</div>
                <div class="flex-1">{toNum0(p.version.nRowsTotalImported)}</div>
              </div>
            </div>
          </Show>

          {/* CSV-specific statistics */}
          <Show when={csvResult()}>
            <div class="border-base-300 ui-pad ui-spy-sm col-span-6 rounded border text-sm">
              <div class="font-700 text-base">{t("CSV import details")}</div>
              <div class="flex justify-between">
                <span>{t("Raw rows processed:")}</span>
                <span>{toNum0(csvResult()!.rawCsvRowCount)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t("Valid rows:")}</span>
                <span>{toNum0(csvResult()!.validCsvRowCount)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t("Deduplicated rows:")}</span>
                <span>{toNum0(csvResult()!.dedupedRowCount)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t("Final staging rows:")}</span>
                <span>{toNum0(csvResult()!.finalStagingRowCount)}</span>
              </div>
            </div>
          </Show>

          {/* DHIS2-specific statistics */}
          <Show when={dhis2Result()}>
            <div class="border-base-300 ui-pad ui-spy-sm col-span-6 rounded border text-sm">
              <div class="font-700 text-base">{t("DHIS2 import details")}</div>
              <div class="flex justify-between">
                <span>{t("Total indicator-period combinations:")}</span>
                <span>{toNum0(dhis2Result()!.totalIndicatorPeriodCombos)}</span>
              </div>
              <div class="flex justify-between">
                <span>{t("Successful fetches:")}</span>
                <span>{toNum0(dhis2Result()!.successfulFetches)}</span>
              </div>
              <Show
                when={dhis2Result()!.failedFetches.length > 0}
                fallback={
                  <div class="text-success flex justify-between">
                    <span>{t("Failed fetches:")}</span>
                    <span>0</span>
                  </div>
                }
              >
                <div class="text-danger flex justify-between">
                  <span>{t("Failed fetches:")}</span>
                  <span>{dhis2Result()!.failedFetches.length}</span>
                </div>
              </Show>
              <div class="flex justify-between">
                <span>{t("Final staging rows:")}</span>
                <span>{toNum0(dhis2Result()!.finalStagingRowCount)}</span>
              </div>
            </div>
          </Show>
        </div>

        {/* Period Indicator Statistics */}
        <Show when={p.version.stagingResult}>
          <CollapsibleSection title={t("Period-indicator combinations")}>
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

        <CollapsibleSection title={t("Raw import metadata")}>
          <div class="ui-pad whitespace-pre-wrap font-mono text-sm">
            {JSON.stringify(p.version, null, 2)}
          </div>
        </CollapsibleSection>
      </div>
    </FrameTop>
  );
}
