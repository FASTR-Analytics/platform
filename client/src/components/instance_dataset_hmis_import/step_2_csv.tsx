import { CsvDetails,
  encodeRawCsvHeader,
  t, t2, T,
  type HmisCsvMappingParams } from "lib";
import {
  Button,
  Select,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
} from "panther";
import { For, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";

type Props = {
  step1Result: CsvDetails;
  step2Result: Record<string, string> | undefined;
  silentFetch: () => Promise<void>;
};

export function Step2_Csv(p: Props) {
  const _HMIS_SQL_COL_NAMES: (keyof HmisCsvMappingParams)[] = [
    "facility_id",
    "raw_indicator_id",
    "period_id",
    "count",
  ];

  const [tempMappings, setTempMappings] = createStore<HmisCsvMappingParams>(
    p.step2Result
      ? (structuredClone(p.step2Result) as HmisCsvMappingParams)
      : {
          facility_id: "",
          raw_indicator_id: "",
          period_id: "",
          count: "",
        },
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  const csvHeaders = () => {
    return p.step1Result.headers.map((v, i) => encodeRawCsvHeader(i, v));
  };

  function updateMappings(
    hmisSqlColName: keyof HmisCsvMappingParams,
    csvCol: string,
  ) {
    setNeedsSaving(true);
    setTempMappings(hmisSqlColName, csvCol);
  }

  const save = timActionForm(async () => {
    const mappings = unwrap(tempMappings);

    for (const hmisSqlColName of _HMIS_SQL_COL_NAMES) {
      if (!mappings[hmisSqlColName]) {
        return {
          success: false,
          err: `${t("Missing value for")} ${hmisSqlColName}`,
        };
      }
    }

    return serverActions.updateDatasetMappings({
      mappings,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <For each={_HMIS_SQL_COL_NAMES}>
          {(hmisSqlColName) => {
            return (
              <div class="flex items-center">
                <div class="w-[40%] flex-none">{hmisSqlColName}</div>
                <div class="flex-1">
                  <Select
                    options={getSelectOptions(csvHeaders())}
                    value={tempMappings[hmisSqlColName]}
                    onChange={(val) => updateMappings(hmisSqlColName, val)}
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
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving()}
          iconName="save"
        >
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
      </div>
    </div>
  );
}
