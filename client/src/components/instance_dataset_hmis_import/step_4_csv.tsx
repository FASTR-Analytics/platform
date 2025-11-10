import { t, type DatasetCsvStagingResult } from "lib";
import { Button, timActionButton, toNum0 } from "panther";
import { Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetCsvStagingResult;
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step4_Csv(p: Props) {
  const save = timActionButton(
    () => serverActions.finalizeDatasetIntegration({}),
    p.silentFetch,
  );

  const totalRecords = () => {
    return p.step3Result.periodIndicatorStats.reduce(
      (sum, stat) => sum + Number(stat.nRecords),
      0,
    );
  };

  const uniquePeriods = () => {
    const periods = new Set(
      p.step3Result.periodIndicatorStats.map((s) => s.periodId),
    );
    return periods.size;
  };

  const uniqueIndicators = () => {
    const indicators = new Set(
      p.step3Result.periodIndicatorStats.map((s) => s.indicatorRawId),
    );
    return indicators.size;
  };

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-spy">
        <div class="font-700 text-lg">{t("Staging Complete")}</div>

        <div class="ui-pad bg-base-200 rounded">
          <div class="flex justify-between">
            <span class="text-base-content">{t("Source:")}</span>
            <span class="font-mono">CSV Import</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">{t("File:")}</span>
            <span class="font-mono">{p.step3Result.assetFileName}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content">{t("Import Date:")}</span>
            <span class="font-mono">
              {new Date(p.step3Result.dateImported).toLocaleString()}
            </span>
          </div>
        </div>

        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("CSV Import Statistics")}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">
                {t("Raw csv rows processed:")}
              </span>
              <span class="font-mono">
                {toNum0(p.step3Result.rawCsvRowCount)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">
                {t("Valid rows in the csv:")}
              </span>
              <span class="font-mono">
                {toNum0(p.step3Result.validCsvRowCount)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t("Non-duplicate rows:")}</span>
              <span class="font-mono">
                {toNum0(p.step3Result.dedupedRowCount)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">
                {t("Final rows ready for integrating:")}
              </span>
              <span class="font-700 text-success font-mono">
                {toNum0(p.step3Result.finalStagingRowCount)}
              </span>
            </div>
          </div>
        </div>

        <Show
          when={
            p.step3Result.validation &&
            ((p.step3Result.validation.missingRequiredFields?.rowsDropped ||
              0) > 0 ||
              (p.step3Result.validation.invalidCounts?.rowsDropped || 0) > 0 ||
              (p.step3Result.validation.invalidPeriods?.rowsDropped || 0) > 0 ||
              (p.step3Result.validation.invalidFacilities?.rowsDropped || 0) >
                0 ||
              (p.step3Result.validation.unmappedIndicators?.rowsDropped || 0) >
                0)
              ? p.step3Result.validation
              : undefined
          }
        >
          {(validation) => (
            <div class="ui-pad border-danger bg-base-200 rounded">
              <div class="font-700 text-danger mb-3">
                {t("Validation Issues")}
              </div>
              <div class="ui-spy-sm">
                <Show when={validation().missingRequiredFields?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>
                      {t(
                        "Invalid rows in csv file (because of missing required fields):",
                      )}
                    </span>
                    <span class="font-mono">
                      {toNum0(validation().missingRequiredFields.rowsDropped)}{" "}
                      {t("rows dropped")}
                    </span>
                  </div>
                </Show>
                <Show when={validation().invalidCounts?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>
                      {t(
                        "Invalid rows in csv file (because of invalid values):",
                      )}
                    </span>
                    <span class="font-mono">
                      {toNum0(validation().invalidCounts.rowsDropped)}{" "}
                      {t("rows dropped")}
                    </span>
                  </div>
                </Show>
                <Show when={validation().invalidPeriods?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>{t("Invalid periods:")}</span>
                    <span class="font-mono">
                      {toNum0(validation().invalidPeriods.rowsDropped)}{" "}
                      {t("rows dropped")}
                    </span>
                  </div>
                </Show>
                <Show when={validation().invalidFacilities?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>{t("Invalid facilities:")}</span>
                    <span class="font-mono">
                      {toNum0(validation().invalidFacilities.rowsDropped)}{" "}
                      {t("rows dropped")}
                    </span>
                  </div>
                  <Show when={validation().invalidFacilities.sample?.length}>
                    <div class="text-base-content ml-4 text-sm">
                      <div class="mb-1">{t("Sample invalid facilities:")}</div>
                      <div class="font-mono">
                        {validation()
                          .invalidFacilities.sample.slice(0, 5)
                          .map(
                            (facility: {
                              facility_id: string;
                              row_count: number;
                            }) =>
                              `${facility.facility_id} (${toNum0(facility.row_count)} ${t("rows")})`,
                          )
                          .join(", ")}
                      </div>
                    </div>
                  </Show>
                </Show>
                <Show when={validation().unmappedIndicators?.rowsDropped}>
                  <div class="text-danger flex justify-between">
                    <span>{t("Unmapped indicators:")}</span>
                    <span class="font-mono">
                      {toNum0(validation().unmappedIndicators.rowsDropped)}{" "}
                      {t("rows dropped")}
                    </span>
                  </div>
                  <Show when={validation().unmappedIndicators.sample?.length}>
                    <div class="text-base-content ml-4 text-sm">
                      <div class="mb-1">{t("Sample unmapped indicators:")}</div>
                      <div class="font-mono">
                        {validation()
                          .unmappedIndicators.sample.slice(0, 5)
                          .map(
                            (indicator: {
                              indicator_raw_id: string;
                              row_count: number;
                            }) =>
                              `${indicator.indicator_raw_id} (${toNum0(indicator.row_count)} ${t("rows")})`,
                          )
                          .join(", ")}
                      </div>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          )}
        </Show>

        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("Staged Data To Import")}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t("Total records:")}</span>
              <span class="font-700 font-mono">
                {totalRecords().toLocaleString()}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t("Unique periods:")}</span>
              <span class="font-mono">{uniquePeriods()}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t("Unique indicators:")}</span>
              <span class="font-mono">{uniqueIndicators()}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.finalStagingRowCount > 0}>
            <div class="ui-spy border-primary bg-primary/10 rounded border p-4">
              <div class="text-primary text-sm">
                {t(
                  "Review the staging results above. Click 'Integrate and finalize' to complete the import process and make this data available in the dataset.",
                )}
              </div>
              <div class="">
                <Button
                  onClick={save.click}
                  intent="success"
                  state={save.state()}
                  iconName="save"
                >
                  {t("Integrate and finalize")}
                </Button>
              </div>
            </div>
          </Match>
          <Match when={true}>
            <div class="border-danger bg-danger/10 rounded border p-4">
              <div class="text-danger text-sm">
                {t(
                  "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.",
                )}
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
