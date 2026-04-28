import { type DatasetHfaStep1Result,
  encodeRawCsvHeader,
  t3, TC,
  type HfaCsvMappingParams } from "lib";
import {
  Button,
  Input,
  PeriodSelect,
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
          facilityIdColumn: "",
          timePoint: "",
          periodId: "",
        },
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  const csvHeaders = () => {
    return p.step1Result.csv.headers.map((v, i) => encodeRawCsvHeader(i, v));
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
      <div class="max-w-2xl space-y-6">
        <div>
          <h3 class="font-700 text-lg mb-2">{t3({ en: "Facility ID Column", fr: "Colonne ID établissement" })}</h3>
          <div class="w-80">
            <Select
              label={t3({ en: "Select the column containing facility IDs", fr: "Sélectionnez la colonne contenant les ID des établissements" })}
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
        <div class="space-y-3">
          <h3 class="font-700 text-lg">{t3({ en: "Time Point", fr: "Point temporel" })}</h3>
          <div class="w-96">
            <Input
              label={t3({ en: "Label (e.g. Round 1, Baseline Dec 2024)", fr: "Libellé (ex. Cycle 1, Référence Déc 2024)" })}
              value={tempMappings.timePoint}
              onChange={(val) => {
                setNeedsSaving(true);
                setTempMappings("timePoint", val);
              }}
              fullWidth
            />
          </div>
          <PeriodSelect
            value={tempMappings.periodId}
            onChange={(val) => {
              setNeedsSaving(true);
              setTempMappings("periodId", val);
            }}
            yearLabel={t3({ en: "Year", fr: "Année" })}
            monthLabel={t3({ en: "Month", fr: "Mois" })}
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
          {t3(TC.save)}
        </Button>
      </div>
    </div>
  );
}
