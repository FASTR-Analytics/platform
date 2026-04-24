import { type DatasetHfaStep1Result,
  encodeRawCsvHeader,
  t3, TC,
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

const YEARS = Array.from({ length: 16 }, (_, i) => String(2020 + i));
const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function Step2(p: Props) {
  const [tempMappings, setTempMappings] = createStore<HfaCsvMappingParams>(
    p.step2Result
      ? (structuredClone(p.step2Result) as HfaCsvMappingParams)
      : {
          facilityIdColumn: "",
          timePoint: "",
          periodId: "",
        },
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  const csvHeaders = () => {
    return p.step1Result.csv.headers.map((v, i) => encodeRawCsvHeader(i, v));
  };

  const selectedYear = () => tempMappings.periodId?.slice(0, 4) || "";
  const selectedMonth = () => tempMappings.periodId?.slice(4, 6) || "";

  const updatePeriodId = (year: string, month: string) => {
    if (year && month) {
      setTempMappings("periodId", `${year}${month}`);
    } else {
      setTempMappings("periodId", "");
    }
    setNeedsSaving(true);
  };

  const save = timActionForm(async () => {
    const mappings = unwrap(tempMappings);
    if (!mappings.facilityIdColumn) {
      return {
        success: false,
        err: `${t3({ en: "Missing value for", fr: "Valeur manquante pour" })} facility_id`,
      };
    }
    if (!mappings.timePoint) {
      return {
        success: false,
        err: t3({ en: "You must enter a time point label", fr: "Vous devez saisir un libellé de point temporel" }),
      };
    }
    if (!mappings.periodId || mappings.periodId.length !== 6) {
      return {
        success: false,
        err: t3({ en: "You must select a year and month", fr: "Vous devez sélectionner une année et un mois" }),
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
              value={tempMappings.facilityIdColumn}
              onChange={(val) => {
                setNeedsSaving(true);
                setTempMappings("facilityIdColumn", val);
              }}
              fullWidth
            />
          </div>
        </div>
      </div>
      <div class="ui-spy-sm">
        <h3 class="font-700 text-lg">{t3({ en: "Time Point", fr: "Point temporel" })}</h3>
        <div class="w-96">
          <Input
            label={t3({ en: "Time point label (e.g. Round 1, Baseline Dec 2024)", fr: "Libellé du point temporel (ex. Cycle 1, Référence Déc 2024)" })}
            value={tempMappings.timePoint}
            onChange={(val) => {
              setNeedsSaving(true);
              setTempMappings("timePoint", val);
            }}
            fullWidth
          />
        </div>
        <div class="flex gap-4 w-96">
          <div class="flex-1">
            <Select
              label={t3({ en: "Year", fr: "Année" })}
              options={getSelectOptions(YEARS)}
              value={selectedYear()}
              onChange={(val) => updatePeriodId(val, selectedMonth())}
              fullWidth
            />
          </div>
          <div class="flex-1">
            <Select
              label={t3({ en: "Month", fr: "Mois" })}
              options={MONTHS.map((m) => ({ value: m.value, label: m.label }))}
              value={selectedMonth()}
              onChange={(val) => updatePeriodId(selectedYear(), val)}
              fullWidth
            />
          </div>
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
          {t3(TC.save)}
        </Button>
      </div>
    </div>
  );
}
