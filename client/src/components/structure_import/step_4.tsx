import {
  t,
  t2,
  T,
  type StructureStagingResult,
  type StructureIntegrateStrategy,
  type SelectableColumn,
} from "lib";
import {
  Button,
  MultiSelect,
  RadioGroup,
  StateHolderFormError,
  timActionForm,
  toNum0,
} from "panther";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: StructureStagingResult;
  close: () => void;
  silentRefresUploadAttempt: () => Promise<void>;
  silentRefreshInstance: () => Promise<void>;
};

export function Step4(p: Props) {
  const [strategyType, setStrategyType] = createSignal<
    StructureIntegrateStrategy["type"]
  >("add_all_and_update_all_as_needed");
  const [selectedColumns, setSelectedColumns] = createSignal<
    SelectableColumn[]
  >([]);

  const strategyOptions = [
    {
      value: "first_delete_all_then_add_all" as const,
      label: t(
        "Replace all existing facilities and admin areas with these (i.e. delete and then add)",
      ),
    },
    {
      value: "add_all_and_update_all_as_needed" as const,
      label: t("Add new facilities and update existing ones as needed"),
    },
    {
      value: "add_all_new_rows_and_ignore_conflicts" as const,
      label: t("Add new facilities only, ignore conflicts"),
    },
    {
      value: "add_all_new_rows_and_error_if_any_conflicts" as const,
      label: t(
        "Add new facilities only, error if any facilities already exists",
      ),
    },
    {
      value:
        "only_update_optional_facility_cols_by_existing_facility_id" as const,
      label: t("Only update optional facility columns by existing facility ID"),
    },
    {
      value: "only_update_selected_cols_by_existing_facility_id" as const,
      label: t("Update selected columns only by existing facility ID"),
    },
  ];

  const columnOptions: { value: SelectableColumn; label: string }[] = [
    { value: "all_admin_areas", label: t("All Admin Areas") },
    { value: "facility_name", label: t("Facility Name") },
    { value: "facility_type", label: t("Facility Type") },
    { value: "facility_ownership", label: t("Facility Ownership") },
    { value: "facility_custom_1", label: t("Facility Custom 1") },
    { value: "facility_custom_2", label: t("Facility Custom 2") },
    { value: "facility_custom_3", label: t("Facility Custom 3") },
    { value: "facility_custom_4", label: t("Facility Custom 4") },
    { value: "facility_custom_5", label: t("Facility Custom 5") },
  ];

  const executeImport = timActionForm(
    async () => {
      const currentStrategy = strategyType();
      let finalStrategy: StructureIntegrateStrategy;

      if (
        currentStrategy === "only_update_selected_cols_by_existing_facility_id"
      ) {
        finalStrategy = {
          type: "only_update_selected_cols_by_existing_facility_id",
          selectedColumns: selectedColumns(),
        };
      } else {
        finalStrategy = { type: currentStrategy };
      }

      const res = await serverActions.structureStep4_ImportData({
        strategy: finalStrategy,
      });
      if (res.success === false) {
        await p.silentRefresUploadAttempt();
      }
      return res;
    },
    p.silentRefreshInstance,
    p.close,
  );

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-spy">
        <div class="font-700 text-lg">{t("Staging Complete")}</div>

        {/* Summary Section */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("Import Summary")}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t("Staging table:")}</span>
              <span class="font-mono">{p.step3Result.stagingTableName}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t("Import date:")}</span>
              <span class="font-mono">{new Date().toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Import Statistics */}
        {/* <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("Import Statistics")}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t("Total rows staged:")}</span>
              <span class="font-700 text-success font-mono">
                {toNum0(p.step3Result.totalRowsStaged)}
              </span>
            </div>
            <Show when={p.step3Result.invalidRowsSkipped > 0}>
              <div class="flex justify-between">
                <span class="text-base-content">
                  {t("Invalid rows skipped:")}
                </span>
                <span class="text-danger font-mono">
                  {toNum0(p.step3Result.invalidRowsSkipped)}
                </span>
              </div>
            </Show>
          </div>
        </div> */}

        {/* Admin Areas Breakdown */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("Administrative Areas")}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t("Admin Area 1s:")}</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level1)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t("Admin Area 2s:")}</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level2)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t("Admin Area 3s:")}</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level3)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t("Admin Area 4s:")}</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level4)}
              </span>
            </div>
          </div>
        </div>

        {/* Facilities */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("Health Facilities")}</div>
          <div class="flex justify-between">
            <span class="text-base-content">{t("Total facilities:")}</span>
            <span class="font-700 font-mono">
              {toNum0(p.step3Result.facilitiesPreview)}
            </span>
          </div>
        </div>

        {/* Validation Warnings */}
        <Show
          when={
            p.step3Result.validationWarnings &&
            p.step3Result.validationWarnings.length > 0
          }
        >
          <div class="ui-pad border-danger bg-base-200 rounded">
            <div class="font-700 text-danger mb-3">
              {t("Validation Warnings")}
            </div>
            <div class="ui-spy-sm">
              <For each={p.step3Result.validationWarnings}>
                {(warning) => (
                  <div class="text-danger text-sm">• {warning}</div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Integration Strategy Selection */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("Integration Strategy")}</div>
          <div class="text-base-content mb-4 text-sm">
            {t(
              "Choose how to handle the integration of the staged data into your existing structure:",
            )}
          </div>
          <RadioGroup
            value={strategyType()}
            options={strategyOptions}
            onChange={(v) => {
              setStrategyType(v as StructureIntegrateStrategy["type"]);
              if (v !== "only_update_selected_cols_by_existing_facility_id") {
                setSelectedColumns([]);
              }
            }}
            label=""
          />

          {/* Column Selection for Selective Update Strategy */}
          <Show
            when={
              strategyType() ===
              "only_update_selected_cols_by_existing_facility_id"
            }
          >
            <div class="ui-pad bg-base-100 mt-4 rounded border">
              <div class="font-700 mb-3">{t("Select Columns to Update")}</div>
              <div class="text-base-content mb-4 text-sm">
                {t("Choose which columns to update for existing facilities:")}
              </div>
              <MultiSelect
                values={selectedColumns()}
                options={columnOptions}
                onChange={setSelectedColumns}
                label={t2(T.FRENCH_UI_STRINGS.columns)}
                showSelectAll={true}
              />
            </div>
          </Show>
        </div>
      </div>

      <StateHolderFormError state={executeImport.state()} />
      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.totalRowsStaged > 0}>
            <div class="ui-spy border-primary bg-primary/10 rounded border p-4">
              <div class="text-primary text-sm">
                {t(
                  "Review the staging results above. Click 'Finalize and integrate' to complete the import process and update the structure data.",
                )}
              </div>
              <div>
                <Button
                  onClick={executeImport.click}
                  intent="success"
                  state={executeImport.state()}
                  iconName="save"
                >
                  {t("Finalize and integrate")}
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
