import { type DatasetHfaStep1Result,
  encodeRawCsvHeader,
  t3, TC,
  type HfaCsvMappingParams } from "lib";
import {
  Button,
  Select,
  StateHolderFormError,
  getSelectOptions,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  step1Result: DatasetHfaStep1Result;
  step2Result: Record<string, string> | undefined;
  silentFetch: () => Promise<void>;
};

export function Step2(p: Props) {
  const [tempMappings, setTempMappings] = createStore<HfaCsvMappingParams>(
    p.step2Result
      ? (structuredClone(p.step2Result) as HfaCsvMappingParams)
      : { facilityIdColumn: "", timePoint: "" },
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  const csvHeaders = () =>
    p.step1Result.csv.headers.map((v, i) => encodeRawCsvHeader(i, v));

  const timePointOptions = () =>
    [...instanceState.hfaTimePoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tp) => ({
        value: tp.label,
        label: `${tp.label} (${tp.periodId.slice(0, 4)}-${tp.periodId.slice(4, 6)})`,
      }));

  const save = createFormAction(async () => {
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
        err: t3({ en: "Select a time point", fr: "Sélectionnez un point temporel", pt: "Selecione um ponto temporal" }),
      };
    }
    return serverActions.updateDatasetHfaMappings({ mappings });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="max-w-2xl space-y-6">
        <div>
          <h3 class="font-700 text-lg mb-2">{t3({ en: "Facility ID Column", fr: "Colonne ID établissement", pt: "Coluna do ID do estabelecimento" })}</h3>
          <div class="w-80">
            <Select
              label={t3({ en: "Select the column containing facility IDs", fr: "Sélectionnez la colonne contenant les ID des établissements", pt: "Selecione a coluna que contém os ID dos estabelecimentos" })}
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
        <div>
          <h3 class="font-700 text-lg mb-2">{t3({ en: "Time Point", fr: "Point temporel", pt: "Ponto temporal" })}</h3>
          <div class="w-96">
            <Select
              label={t3({ en: "Select the time point this data belongs to", fr: "Sélectionnez le point temporel auquel ces données appartiennent", pt: "Selecione o ponto temporal a que estes dados pertencem" })}
              options={timePointOptions()}
              value={tempMappings.timePoint}
              onChange={(val) => {
                setNeedsSaving(true);
                setTempMappings("timePoint", val);
              }}
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
