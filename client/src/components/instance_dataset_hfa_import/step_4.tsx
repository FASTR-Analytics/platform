import { t, type DatasetHfaCsvStagingResult } from "lib";
import { Button, timActionButton, toNum0 } from "panther";
import { Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetHfaCsvStagingResult;
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step4(p: Props) {
  const save = timActionButton(
    () => serverActions.finalizeDatasetHfaIntegration({}),
    p.silentFetch,
  );
  return (
    <div class="ui-spy ui-pad">
      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t("Staging Results Summary")}</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t("Import Date")}</span>
            <span class="font-mono text-base">
              {new Date(p.step3Result.dateImported).toLocaleString()}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t("Staging Table")}</span>
            <span class="font-mono text-base">
              {p.step3Result.stagingTableName}
            </span>
          </div>
        </div>
      </div>

      <div class="ui-pad bg-base-200 rounded">
        <h3 class="font-700 mb-4 text-lg">{t("Row Statistics")}</h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t("Total Rows in File")}
            </span>
            <span class="font-700 font-mono text-xl">
              {toNum0(p.step3Result.nRowsInFile)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t("Valid Rows")}</span>
            <span class="font-700 text-success font-mono text-xl">
              {toNum0(p.step3Result.nRowsValid)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t("Total Values to Import (approx. equal to cols x rows)")}
            </span>
            <span class="font-700 text-primary font-mono text-xl">
              {toNum0(p.step3Result.nRowsTotal)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t("Invalid: Missing Facility ID")}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsInvalidMissingFacilityId)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">
              {t("Invalid: Facility Not Found")}
            </span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsInvalidFacilityNotFound)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-base-content text-sm">{t("Duplicate Rows")}</span>
            <span class="font-700 text-danger font-mono text-xl">
              {toNum0(p.step3Result.nRowsDuplicated)}
            </span>
          </div>
        </div>

        {(p.step3Result.nRowsInvalidMissingFacilityId > 0 ||
          p.step3Result.nRowsInvalidFacilityNotFound > 0 ||
          p.step3Result.nRowsDuplicated > 0) && (
          <div class="border-danger/30 bg-danger/5 mt-4 rounded border p-3">
            <div class="text-danger text-sm">
              {t(
                "Warning: " +
                  toNum0(
                    p.step3Result.nRowsInvalidMissingFacilityId +
                      p.step3Result.nRowsInvalidFacilityNotFound +
                      p.step3Result.nRowsDuplicated,
                  ) +
                  " rows will be skipped due to validation errors or duplicates",
              )}
            </div>
          </div>
        )}
      </div>

      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.nRowsTotal > 0}>
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
