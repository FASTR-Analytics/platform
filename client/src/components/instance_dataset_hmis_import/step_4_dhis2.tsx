import { t, type DatasetDhis2StagingResult } from "lib";
import { Button, timActionButton } from "panther";
import { For, Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetDhis2StagingResult;
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step4_Dhis2(p: Props) {
  const save = timActionButton(
    () => serverActions.finalizeDatasetIntegration({}),
    p.silentFetch,
  );

  return (
    <div class="ui-spy ui-pad flex flex-col">
      <div class="ui-pad border-base-300 rounded border">
        <h2 class="font-700 mb-4 text-lg">Import Summary</h2>

        <div class="ui-gap grid grid-cols-12">
          <div class="col-span-12">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">Source Type:</span>
                <span class="font-mono text-sm">
                  {p.step3Result.sourceType}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">Date Imported:</span>
                <span class="font-mono text-sm">
                  {new Date(p.step3Result.dateImported).toLocaleString()}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  Total Indicator-Period Combos:
                </span>
                <span class="font-mono text-sm">
                  {p.step3Result.totalIndicatorPeriodCombos}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  Successful Fetches:
                </span>
                <span class="font-mono text-sm" data-intent="success">
                  {p.step3Result.successfulFetches}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">Failed Fetches:</span>
                <span
                  class="font-mono text-sm"
                  data-intent={
                    p.step3Result.failedFetches.length > 0
                      ? "danger"
                      : "neutral"
                  }
                >
                  {p.step3Result.failedFetches.length}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  Final Staging Row Count:
                </span>
                <span class="font-700 font-mono text-sm">
                  {p.step3Result.finalStagingRowCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {p.step3Result.failedFetches.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 text-danger mb-3 text-base">Failed Fetches</h3>
          <div class="max-h-48 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">Indicator ID</th>
                  <th class="font-700 p-2 text-left">Period ID</th>
                  <th class="font-700 p-2 text-left">Error</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.failedFetches}>
                  {(fail) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">
                        {fail.indicatorRawId}
                      </td>
                      <td class="p-2 font-mono text-xs">{fail.periodId}</td>
                      <td class="text-danger p-2 text-xs">{fail.error}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.step3Result.periodIndicatorStats.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 mb-3 text-base">Period-Indicator Statistics</h3>
          <div class="max-h-64 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">Period ID</th>
                  <th class="font-700 p-2 text-left">Indicator ID</th>
                  <th class="font-700 p-2 text-right">Records</th>
                  <th class="font-700 p-2 text-right">Total Count</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.periodIndicatorStats}>
                  {(stat) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">{stat.periodId}</td>
                      <td class="p-2 font-mono text-xs">
                        {stat.indicatorRawId}
                      </td>
                      <td class="p-2 text-right font-mono text-xs">
                        {stat.nRecords}
                      </td>
                      <td class="p-2 text-right font-mono text-xs">
                        {stat.totalCount}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.step3Result.workItemHistory.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 mb-3 text-base">Work Item History</h3>
          <div class="max-h-48 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">Indicator ID</th>
                  <th class="font-700 p-2 text-left">Period ID</th>
                  <th class="font-700 p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.workItemHistory}>
                  {(item) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">{item.indicatorId}</td>
                      <td class="p-2 font-mono text-xs">{item.periodId}</td>
                      <td class="p-2 text-center">
                        <span
                          class="text-xs"
                          data-intent={item.success ? "success" : "danger"}
                        >
                          {item.success ? "Success" : "Failed"}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.finalStagingRowCount > 0}>
            <Button
              onClick={save.click}
              intent="success"
              state={save.state()}
              iconName="save"
            >
              {t("Integrate and finalize")}
            </Button>
          </Match>
          <Match when={true}>
            <div class="bg-warning-50 border-warning-300 rounded border p-3 text-sm">
              There are no rows to import. Either go back and edit this upload
              config, or delete the upload attempt.
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
