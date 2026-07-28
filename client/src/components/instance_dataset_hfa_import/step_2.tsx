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
  createFormAction,
} from "panther";
import { For, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  step1Result: DatasetHfaStep1Result;
  step2Result: HfaCsvMappingParams | undefined;
  silentFetch: () => Promise<void>;
};

export function Step2(p: Props) {
  // An old saved step2Result (from before the filter/dedup deploy) gets the
  // same defaults as a fresh attempt. Strategy and overrides have no UI here
  // (they belong to the step-3 review) but ride along in the saved mappings.
  const [tempMappings, setTempMappings] = createStore<HfaCsvMappingParams>(
    p.step2Result
      ? {
          facilityIdColumn: p.step2Result.facilityIdColumn,
          timePoint: p.step2Result.timePoint,
          rowFilters: structuredClone(p.step2Result.rowFilters ?? []),
          dedupStrategy: p.step2Result.dedupStrategy ?? "first",
          dedupOverrides: structuredClone(p.step2Result.dedupOverrides ?? []),
        }
      : {
          facilityIdColumn: "",
          timePoint: "",
          rowFilters: [],
          dedupStrategy: "first",
          dedupOverrides: [],
        },
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

  // Editing the facility column or any filter invalidates the duplicate
  // structure the step-3 review's overrides were picked against
  function markStructureChanged() {
    setNeedsSaving(true);
    setTempMappings("dedupOverrides", []);
  }

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
    for (const f of mappings.rowFilters) {
      if (!f.column || !f.value.trim()) {
        return {
          success: false,
          err: t3({ en: "Each filter condition needs a column and a value", fr: "Chaque condition de filtre nécessite une colonne et une valeur", pt: "Cada condição de filtro necessita de uma coluna e de um valor" }),
        };
      }
    }
    return serverActions.updateDatasetHfaMappings({
      mappings,
      reviewConfirmed: false,
    });
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
                markStructureChanged();
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
        <div>
          <h3 class="font-700 text-lg mb-2">{t3({ en: "Row Filter (optional)", fr: "Filtre de lignes (facultatif)", pt: "Filtro de linhas (opcional)" })}</h3>
          <div class="text-base-content-muted mb-3 text-sm">
            {t3({ en: "Rows failing any condition are dropped before duplicate handling — for example, keep only surveyed facilities by requiring the consent column to equal 1. Values are compared as exact text (1 does not match 1.0).", fr: "Les lignes ne satisfaisant pas toutes les conditions sont supprimées avant le traitement des doublons — par exemple, ne conservez que les établissements enquêtés en exigeant que la colonne de consentement soit égale à 1. Les valeurs sont comparées comme du texte exact (1 ne correspond pas à 1.0).", pt: "As linhas que não cumpram qualquer condição são eliminadas antes do tratamento dos duplicados — por exemplo, mantenha apenas os estabelecimentos inquiridos exigindo que a coluna de consentimento seja igual a 1. Os valores são comparados como texto exato (1 não corresponde a 1.0)." })}
          </div>
          <div class="ui-spy-sm">
            <For each={tempMappings.rowFilters}>
              {(filter, i) => (
                <div class="ui-gap-sm flex items-center">
                  <div class="w-80">
                    <Select
                      options={getSelectOptions(csvHeaders())}
                      value={filter.column}
                      onChange={(val) => {
                        markStructureChanged();
                        setTempMappings("rowFilters", i(), "column", val);
                      }}
                      placeholder={t3({ en: "Select column", fr: "Sélectionnez une colonne", pt: "Selecione uma coluna" })}
                      fullWidth
                    />
                  </div>
                  <Select<"equals" | "not_equals">
                    options={[
                      { value: "equals", label: t3({ en: "equals", fr: "égal à", pt: "igual a" }) },
                      { value: "not_equals", label: t3({ en: "does not equal", fr: "différent de", pt: "diferente de" }) },
                    ]}
                    value={filter.op}
                    onChange={(val) => {
                      markStructureChanged();
                      setTempMappings("rowFilters", i(), "op", val);
                    }}
                  />
                  <Input
                    value={filter.value}
                    onChange={(val) => {
                      markStructureChanged();
                      setTempMappings("rowFilters", i(), "value", val);
                    }}
                    placeholder={t3({ en: "Value", fr: "Valeur", pt: "Valor" })}
                  />
                  <Button
                    iconName="trash"
                    onClick={() => {
                      markStructureChanged();
                      setTempMappings("rowFilters", (prev) =>
                        prev.filter((_, idx) => idx !== i()),
                      );
                    }}
                  />
                </div>
              )}
            </For>
            <Button
              iconName="plus"
              onClick={() => {
                markStructureChanged();
                setTempMappings("rowFilters", [
                  ...tempMappings.rowFilters,
                  { column: "", op: "equals", value: "" },
                ]);
              }}
            >
              {t3({ en: "Add condition", fr: "Ajouter une condition", pt: "Adicionar uma condição" })}
            </Button>
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
