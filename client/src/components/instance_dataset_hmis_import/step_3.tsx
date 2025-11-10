import { t, type DatasetStagingResult } from "lib";
import { Button, RadioGroup, timActionButton, toNum0 } from "panther";
import { Match, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetStagingResult | undefined;
  sourceType: "csv" | "dhis2";
  silentFetch: () => Promise<void>;
  close: () => void;
};

export function Step3(p: Props) {
  const [failFastMode, setFailFastMode] = createSignal<
    "fail-fast" | "continue-on-error"
  >("fail-fast");

  const save = timActionButton(
    () =>
      serverActions.updateDatasetStaging({
        failFastMode: p.sourceType === "dhis2" ? failFastMode() : undefined,
      }),
    p.silentFetch,
  );

  const isCSV = () => p.sourceType === "csv";
  const needsSaving = () => !p.step3Result;

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-spy-sm">
        <div class="font-700 text-lg">{t("Data Staging")}</div>
        <Switch>
          <Match when={!p.step3Result}>
            <div class="border-base-300 rounded border p-4">
              <Switch>
                <Match when={isCSV()}>
                  <div class="">
                    {t(
                      "Ready to stage CSV data. This will validate and prepare the data for import.",
                    )}
                  </div>
                </Match>
                <Match when={true}>
                  <div class="ui-spy">
                    <div class="">
                      {t(
                        "Ready to fetch data from DHIS2. This will retrieve the selected indicators and periods.",
                      )}
                    </div>
                    <div class="ui-spy-sm">
                      <div class="">
                        What should happen if any period-indicator combination
                        fails?
                      </div>
                      <RadioGroup
                        options={[
                          {
                            value: "fail-fast",
                            label: "Abort the entire import attempt",
                          },
                          {
                            value: "continue-on-error",
                            label:
                              "Keep any period-indicator combindations that succeed, and report the errors",
                          },
                        ]}
                        value={failFastMode()}
                        onChange={setFailFastMode}
                      />
                    </div>
                  </div>
                </Match>
              </Switch>
            </div>
          </Match>
          <Match when={p.step3Result}>
            <div class="bg-success-50 border-success-300 rounded border p-4">
              <div class="text-success-700 flex items-center gap-2">
                <span>✓</span>
                <span>
                  {isCSV()
                    ? t("CSV data staged successfully")
                    : t("DHIS2 data fetched successfully")}
                </span>
              </div>
              <div class="text-success mt-2 text-sm">
                {t("Total rows staged")}:{" "}
                {toNum0(p.step3Result!.finalStagingRowCount)}
              </div>
            </div>
          </Match>
        </Switch>
      </div>
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving()}
          iconName="database"
        >
          {isCSV() ? t("Start staging") : t("Start fetching from DHIS2")}
        </Button>
      </div>
    </div>
  );
}
