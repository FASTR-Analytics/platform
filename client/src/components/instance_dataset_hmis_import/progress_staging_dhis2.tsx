import { t } from "lib";
import type { DatasetUploadAttemptStatus } from "lib";
import { to100Pct0 } from "panther";
import { ProgressBar } from "panther";
import { For } from "solid-js";

export function ProgressStaging_Dhis2(p: {
  status: Extract<DatasetUploadAttemptStatus, { status: "staging_dhis2" }>;
}) {
  const formatElapsedTime = (dateStr: string) => {
    const elapsed = Date.now() - new Date(dateStr).getTime();
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div class="ui-pad ui-spy">
      <div class="flex items-center justify-between">
        <div class="font-700 text-xl">{t("Staging DHIS2 Data")}</div>
        <div class="font-700 text-2xl">{to100Pct0(p.status.progress)}</div>
      </div>

      <ProgressBar progressFrom0To100={p.status.progress} />

      <div class="mt-4 grid grid-cols-3 gap-4">
        <div class="border-base-300 rounded border p-4 text-center">
          <div class="text-base-content text-sm">Total indicator-months</div>
          <div class="font-700 text-xl">{p.status.totalWorkItems}</div>
        </div>
        <div class="border-base-300 rounded border p-4 text-center">
          <div class="text-success text-sm">Completed indicator-months</div>
          <div class="font-700 text-success text-xl">
            {p.status.completedWorkItems}
          </div>
        </div>
        <div class="border-base-300 rounded border p-4 text-center">
          <div class="text-danger text-sm">Failed indicator-months</div>
          <div class="font-700 text-danger text-xl">
            {p.status.failedWorkItems}
          </div>
        </div>
      </div>

      {p.status.activeWorkItems.length > 0 && (
        <div class="mt-6">
          <div class="font-700 mb-3">
            Active indicator-months ({p.status.activeWorkItems.length})
          </div>
          <div class="space-y-3">
            <For each={p.status.activeWorkItems}>
              {(item) => {
                const batchProgress =
                  (item.facilityBatchesCompleted / item.totalFacilityBatches) *
                  100;
                return (
                  <div class="border-base-300 rounded border p-4">
                    <div class="mb-3 flex items-start justify-between">
                      <div>
                        <span class="font-mono text-sm">
                          Indicator: {item.indicatorId}
                        </span>
                        <span class="ml-6 font-mono text-sm">
                          Month: {item.periodId}
                        </span>
                      </div>
                      <span class="text-base-content text-sm">
                        {formatElapsedTime(item.startTime)}
                      </span>
                    </div>
                    <div class="flex items-center gap-4">
                      <div class="flex-1">
                        <ProgressBar progressFrom0To100={batchProgress} small />
                      </div>
                      <span class="text-sm">
                        {item.facilityBatchesCompleted}/
                        {item.totalFacilityBatches}
                      </span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      )}
    </div>
  );
}
