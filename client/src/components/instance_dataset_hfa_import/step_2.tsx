import { type DatasetHfaStep1Result,
  encodeRawCsvHeader,
  t, t2, T,
  type HfaCsvMappingParams } from "lib";
import {
  Button,
  Input,
  Select,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";

type Props = {
  step1Result: DatasetHfaStep1Result;
  step2Result: Record<string, string> | undefined;
  silentFetch: () => Promise<void>;
};

export function Step2(p: Props) {
  const [tempMappings, setTempMappings] = createStore<HfaCsvMappingParams>(
    p.step2Result
      ? (structuredClone(p.step2Result) as HfaCsvMappingParams)
      : {
          facility_id: "",
          timePointId: "",
          timePointLabel: "",
        },
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  const csvHeaders = () => {
    return p.step1Result.csv.headers.map((v, i) => encodeRawCsvHeader(i, v));
  };

  const save = timActionForm(async () => {
    const mappings = unwrap(tempMappings);
    if (!mappings.facility_id) {
      return {
        success: false,
        err: `${t("Missing value for")} facility_id`,
      };
    }
    if (!mappings.timePointId) {
      return {
        success: false,
        err: t("You must enter a time point ID"),
      };
    }
    if (!mappings.timePointLabel) {
      return {
        success: false,
        err: t("You must enter a time point label"),
      };
    }
    return serverActions.updateDatasetHfaMappings({
      mappings,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <div class="flex items-center">
          <div class="w-[40%] flex-none">facility_id</div>
          <div class="flex-1">
            <Select
              options={getSelectOptions(csvHeaders())}
              value={tempMappings.facility_id}
              onChange={(val) => {
                setNeedsSaving(true);
                setTempMappings("facility_id", val);
              }}
              fullWidth
            />
          </div>
        </div>
      </div>
      <div class="ui-spy-sm">
        <h3 class="font-700 text-lg">{t("Time Point")}</h3>
        <div class="w-96">
          <Input
            label={t("Time point ID (e.g. 1, 2, round_1)")}
            value={tempMappings.timePointId}
            onChange={(val) => {
              setNeedsSaving(true);
              setTempMappings("timePointId", val);
            }}
            fullWidth
          />
        </div>
        <div class="w-96">
          <Input
            label={t("Time point label (e.g. December 2025, Round 3)")}
            value={tempMappings.timePointLabel}
            onChange={(val) => {
              setNeedsSaving(true);
              setTempMappings("timePointLabel", val);
            }}
            fullWidth
          />
        </div>
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
