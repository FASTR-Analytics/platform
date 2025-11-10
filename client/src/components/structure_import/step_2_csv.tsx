import { For, Match, Switch, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import {
  t,
  type CsvDetails,
  type StructureColumnMappings,
  type InstanceConfigFacilityColumns,
  encodeRawCsvHeader,
  getEnabledOptionalFacilityColumns,
} from "lib";
import {
  Button,
  Select,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
} from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  step1Result: CsvDetails;
  step2Result: StructureColumnMappings | undefined;
  maxAdminArea: number;
  facilityColumns: InstanceConfigFacilityColumns;
  silentFetch: () => Promise<void>;
};

export function Step2_Csv(p: Props) {
  // Dynamic columns based on maxAdminArea
  const requiredColumns = () => {
    const columns = ["facility_id", "admin_area_1"];

    for (let i = 2; i <= p.maxAdminArea; i++) {
      columns.push(`admin_area_${i}`);
    }

    columns.push(...getEnabledOptionalFacilityColumns(p.facilityColumns));

    return columns;
  };

  const [tempMappings, setTempMappings] = createStore<Record<string, string>>(
    requiredColumns().reduce<Record<string, string>>((obj, col) => {
      obj[col] = p.step2Result?.[col as keyof StructureColumnMappings] ?? "";
      return obj;
    }, {}),
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  const csvHeaders = () => {
    return p.step1Result.headers.map((v, i) => encodeRawCsvHeader(i, v));
  };

  function updateMappings(columnKey: string, csvCol: string) {
    setNeedsSaving(true);
    setTempMappings(columnKey, csvCol);
  }

  const save = timActionForm(async () => {
    const mappings = unwrap(tempMappings);

    // Validate all required columns
    for (const column of requiredColumns()) {
      if (!mappings[column]) {
        return { success: false, err: t(`${column} mapping is required`) };
      }
    }

    // Build column mappings from validated fields
    const columnMappings: StructureColumnMappings = requiredColumns().reduce(
      (acc, column) => {
        (acc as any)[column] = mappings[column];
        return acc;
      },
      {} as StructureColumnMappings,
    );

    return serverActions.structureStep2Csv_SetColumnMappings({
      columnMappings,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <For each={requiredColumns()}>
          {(column) => {
            return (
              <div class="flex items-center">
                <div class="w-[40%] flex-none">{column}</div>
                <div class="flex-1">
                  <Select
                    options={getSelectOptions(csvHeaders())}
                    value={tempMappings[column]}
                    onChange={(val) => updateMappings(column, val)}
                    fullWidth
                  />
                </div>
              </div>
            );
          }}
        </For>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={needsSaving()}>
            <Button
              onClick={save.click}
              intent="success"
              state={save.state()}
              iconName="save"
            >
              {t("Save and continue")}
            </Button>
          </Match>
          <Match when={true}>
            <div class="text-success">
              {t("Column mappings saved successfully")}
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
