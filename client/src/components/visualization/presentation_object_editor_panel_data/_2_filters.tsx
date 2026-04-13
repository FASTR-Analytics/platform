import {
  type DisaggregationPossibleValuesStatus,
  PeriodBounds,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ResultsValue,
  getCalendar,
  t3,
  TC,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import {
  Button,
  Checkbox,
  DoubleSlider,
  RadioGroup,
  Slider,
  StateHolderWrapper,
  formatPeriod,
  getPeriodIdFromTime,
  getTimeFromPeriodId,
  type TimQuery,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

type FiltersProps = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  allowedFilterOptions: ResultsValue["disaggregationOptions"];
};

export function Filters(p: FiltersProps) {
  const excludedFilters = !!p.resultsValueInfo.periodBounds
    ? ["year", "period_id", "quarter_id", "month"]
    : ["period_id", "quarter_id", "month"];
  const filterOptionsExcludingPeriods = () =>
    p.allowedFilterOptions.filter((opt) => {
      return !excludedFilters.includes(opt.value);
    });

  return (
    <div class="ui-spy-sm">
      <div class="text-md font-700">{t3({ en: "Filter (subset)", fr: "Filtre (sous-ensemble)" })}</div>

      <div class="ui-spy-sm">
        <Show when={p.poDetail.resultsValue.valueProps.length > 1}>
          <DataValuesFilter
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
          />
        </Show>

        <Show when={p.resultsValueInfo.periodBounds} keyed>
          {(keyedPeriodBounds) => {
            return (
              <PeriodFilter
                tempConfig={p.tempConfig}
                setTempConfig={p.setTempConfig}
                keyedPeriodBounds={keyedPeriodBounds}
                resultsValueInfo={p.resultsValueInfo}
              />
            );
          }}
        </Show>

        <For each={filterOptionsExcludingPeriods()}>
          {(disOpt) => {
            const status = () =>
              p.resultsValueInfo.disaggregationPossibleValues[disOpt.value];
            return (
              <Show when={status()} keyed>
                {(keyedStatus) => {
                  return (
                    <DisaggregationFilter
                      disOpt={disOpt}
                      keyedStatus={keyedStatus}
                      tempConfig={p.tempConfig}
                      setTempConfig={p.setTempConfig}
                    />
                  );
                }}
              </Show>
            );
          }}
        </For>
      </div>
    </div>
  );
}

type DataValuesFilterProps = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function DataValuesFilter(p: DataValuesFilterProps) {
  return (
    <div class="ui-spy-sm">
      <Checkbox
        label={t3({ en: "Filter data values", fr: "Filtrer les valeurs des données" })}
        checked={!!p.tempConfig.d.valuesFilter}
        onChange={(checked) => {
          if (checked) {
            p.setTempConfig("d", "valuesFilter", []);
          } else {
            p.setTempConfig("d", "valuesFilter", undefined);
          }
        }}
      />
      <Show when={p.tempConfig.d.valuesFilter} keyed>
        {(keyedValuesFilter) => {
          function toggleVal(val: string) {
            p.setTempConfig("d", "valuesFilter", (prev) => {
              if (prev?.includes(val)) {
                return prev.filter((v) => v !== val);
              }
              return [...(prev ?? []), val];
            });
          }
          return (
            <div class="pb-4">
              <div class="ui-gap-sm ui-pad border-base-300 flex max-h-[300px] flex-wrap overflow-auto rounded border font-mono text-xs">
                <For each={p.poDetail.resultsValue.valueProps}>
                  {(opt) => {
                    return (
                      <div
                        class="ui-hoverable bg-base-200 data-[selected=true]:bg-success data-[selected=true]:text-base-100 rounded px-2 py-1"
                        onClick={() => toggleVal(opt)}
                        data-selected={keyedValuesFilter.includes(opt)}
                      >
                        <span class="relative">{opt}</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

type PeriodFilterProps = {
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  keyedPeriodBounds: PeriodBounds;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
};

function PeriodFilter(p: PeriodFilterProps) {
  return (
    <div class="ui-spy-sm">
      <Checkbox
        label={t3({ en: "Filter time period", fr: "Filtrer par période" })}
        checked={!!p.tempConfig.d.periodFilter}
        onChange={(checked) => {
          if (checked) {
            p.setTempConfig("d", "periodFilter", {
              filterType: "last_n_months",
              periodOption: p.keyedPeriodBounds.periodOption,
              min: p.keyedPeriodBounds.min,
              max: p.keyedPeriodBounds.max,
            });
          } else {
            p.setTempConfig("d", "periodFilter", undefined);
          }
        }}
      />
      <Show when={p.tempConfig.d.periodFilter} keyed>
        {(keyedPeriodFilter) => {
          const displayFilterType = () => {
            const ft = p.tempConfig.d.periodFilter?.filterType;
            if (ft === "last_calendar_year") return "last_n_calendar_years";
            if (ft === "last_calendar_quarter") return "last_n_calendar_quarters";
            return ft;
          };
          const periodOption = p.keyedPeriodBounds.periodOption;
          return (
            <div class="ui-spy-sm pb-4 pl-4">
              <RadioGroup
                value={displayFilterType()}
                options={
                  periodOption === "year"
                    ? [
                      {
                        value: "last_n_months",
                        label: t3({ en: "Last year", fr: "Dernière année" }),
                      },
                      {
                        value: "custom",
                        label: t3({ en: "Custom", fr: "Personnalisé" }),
                      },
                    ]
                    : periodOption === "quarter_id"
                      ? [
                        {
                          value: "last_n_months",
                          label: t3({ en: "Last N quarters", fr: "Derniers N trimestres" }),
                        },
                        {
                          value: "from_month",
                          label: t3({ en: "From specific quarter", fr: "À partir d'un trimestre spécifique" }),
                        },
                        {
                          value: "custom",
                          label: t3({ en: "Custom", fr: "Personnalisé" }),
                        },
                      ]
                      : [
                        {
                          value: "last_n_months",
                          label: t3({ en: "Last N months", fr: "Derniers N mois" }),
                        },
                        {
                          value: "from_month",
                          label: t3({ en: "From specific month to present", fr: "À partir d'un mois spécifique jusqu'à aujourd'hui" }),
                        },
                        {
                          value: "last_n_calendar_years",
                          label: t3({ en: "Last N full calendar years", fr: "Dernières N années civiles complètes" }),
                        },
                        {
                          value: "last_n_calendar_quarters",
                          label: t3({ en: "Last N full calendar quarters", fr: "Derniers N trimestres civils complets" }),
                        },
                        {
                          value: "custom",
                          label: t3({ en: "Custom", fr: "Personnalisé" }),
                        },
                      ]
                }
                onChange={(v) => {
                  p.setTempConfig(
                    "d",
                    "periodFilter",
                    "filterType",
                    v as NonNullable<PresentationObjectConfig["d"]["periodFilter"]>["filterType"],
                  );
                  if (v === "last_n_calendar_years") p.setTempConfig("d", "periodFilter", "nYears", 1);
                  if (v === "last_n_calendar_quarters") p.setTempConfig("d", "periodFilter", "nQuarters", 1);
                }}
              />
              <Show
                when={
                  p.tempConfig.d.periodFilter?.filterType === "last_n_months" &&
                  periodOption !== "year"
                }
              >
                <NMonthsSelector
                  nMonths={keyedPeriodFilter.nMonths}
                  label={periodOption === "quarter_id" ? t3({ en: "Number of quarters", fr: "Nombre de trimestres" }) : undefined}
                  max={periodOption === "quarter_id" ? 20 : 24}
                  onUpdate={(nMonths) =>
                    p.setTempConfig("d", "periodFilter", "nMonths", nMonths)
                  }
                />
              </Show>
              <Show
                when={
                  p.tempConfig.d.periodFilter?.filterType === "last_n_calendar_years" ||
                  p.tempConfig.d.periodFilter?.filterType === "last_calendar_year"
                }
              >
                <NYearsSelector
                  nYears={keyedPeriodFilter.nYears}
                  onUpdate={(nYears) => {
                    p.setTempConfig("d", "periodFilter", "filterType", "last_n_calendar_years");
                    p.setTempConfig("d", "periodFilter", "nYears", nYears);
                  }}
                />
              </Show>
              <Show
                when={
                  p.tempConfig.d.periodFilter?.filterType === "last_n_calendar_quarters" ||
                  p.tempConfig.d.periodFilter?.filterType === "last_calendar_quarter"
                }
              >
                <NQuartersSelector
                  nQuarters={keyedPeriodFilter.nQuarters}
                  onUpdate={(nQuarters) => {
                    p.setTempConfig("d", "periodFilter", "filterType", "last_n_calendar_quarters");
                    p.setTempConfig("d", "periodFilter", "nQuarters", nQuarters);
                  }}
                />
              </Show>
              <Show
                when={p.tempConfig.d.periodFilter?.filterType === "from_month"}
              >
                <div class="ui-gap-sm ui-pad border-base-300 rounded border">
                  <PeriodFilterPeriodIdSingle
                    periodBounds={p.keyedPeriodBounds}
                    periodFilter={keyedPeriodFilter}
                    periodType={periodOption === "quarter_id" ? "year-quarter" : "year-month"}
                    onUpdate={(v) =>
                      p.setTempConfig("d", "periodFilter", {
                        periodOption: p.keyedPeriodBounds.periodOption,
                        filterType: "from_month",
                        min: v.minPeriodId,
                        max: p.keyedPeriodBounds.max,
                      })
                    }
                  />
                </div>
              </Show>
              <Switch>
                <Match
                  when={
                    p.tempConfig.d.periodFilter?.filterType === "custom" &&
                    (periodOption === "period_id" || periodOption === "quarter_id")
                  }
                >
                  <div class="ui-gap-sm ui-pad border-base-300 rounded border">
                    <PeriodFilterPeriodId
                      periodBounds={p.keyedPeriodBounds}
                      periodFilter={keyedPeriodFilter}
                      periodType={periodOption === "quarter_id" ? "year-quarter" : "year-month"}
                      onUpdate={(v) =>
                        p.setTempConfig("d", "periodFilter", {
                          periodOption: p.keyedPeriodBounds.periodOption,
                          min: v.minPeriodId,
                          max: v.maxPeriodId,
                        })
                      }
                    /></div>
                </Match>
                <Match
                  when={p.tempConfig.d.periodFilter?.filterType === "custom"}
                >
                  {(() => {
                    const toYear = (v: number) => String(v).length <= 4 ? v : Math.floor(v / 100);
                    return (
                      <PeriodFilterYear
                        periodBounds={{
                          periodOption: "year",
                          min: toYear(p.keyedPeriodBounds.min),
                          max: toYear(p.keyedPeriodBounds.max),
                        }}
                        periodFilter={{
                          ...keyedPeriodFilter,
                          periodOption: "year",
                          min: toYear(keyedPeriodFilter.min),
                          max: toYear(keyedPeriodFilter.max),
                        }}
                        onUpdate={(v) =>
                          p.setTempConfig("d", "periodFilter", {
                            periodOption: p.tempConfig.d.periodFilter?.periodOption ?? "year",
                            min: v.minYear,
                            max: v.maxYear,
                          })
                        }
                      />
                    );
                  })()}
                </Match>
              </Switch>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

type DisaggregationFilterProps = {
  disOpt: FiltersProps["allowedFilterOptions"][number];
  keyedStatus: DisaggregationPossibleValuesStatus;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function DisaggregationFilter(p: DisaggregationFilterProps) {
  return (
    <div class="ui-spy-sm">
      <Checkbox
        label={t3(p.disOpt.label)}
        checked={
          !!p.tempConfig.d.filterBy.some((fil) => fil.disOpt === p.disOpt.value)
        }
        onChange={(checked) => {
          if (checked) {
            p.setTempConfig("d", "filterBy", (prev) => [
              ...prev.filter((d) => d.disOpt !== p.disOpt.value),
              { disOpt: p.disOpt.value, values: [] },
            ]);
            p.setTempConfig("d", "selectedReplicantValue", undefined);
          } else {
            p.setTempConfig("d", "filterBy", (prev) =>
              prev.filter((d) => d.disOpt !== p.disOpt.value),
            );
            p.setTempConfig("d", "selectedReplicantValue", undefined);
          }
        }}
      />
      <Show
        when={p.tempConfig.d.filterBy.find(
          (fil) => fil.disOpt === p.disOpt.value,
        )}
        keyed
      >
        {(keyedFilter) => {
          function toggleVal(val: string) {
            const normalized = String(val).toLowerCase();
            p.setTempConfig(
              "d",
              "filterBy",
              (fil) => fil.disOpt === p.disOpt.value,
              "values",
              (prev) => {
                if (prev?.some(v => String(v).toLowerCase() === normalized)) {
                  return prev.filter(v => String(v).toLowerCase() !== normalized);
                }
                return [...(prev ?? []), val];
              },
            );
            p.setTempConfig("d", "selectedReplicantValue", undefined);
          }
          return (
            <div class="pb-4">
              <Switch>
                <Match when={p.keyedStatus.status === "too_many_values"}>
                  <div class="ui-pad text-sm text-warning">
                    {t3({ en: "Too many values (over 500) to display as filter options.", fr: "Trop de valeurs (plus de 500) pour les afficher comme options de filtre." })}
                  </div>
                </Match>
                <Match when={p.keyedStatus.status === "no_values_available"}>
                  <div class="ui-pad text-sm text-info">
                    {t3({ en: "No data available for this dimension.", fr: "Aucune donnée disponible pour cette dimension." })}
                  </div>
                </Match>
                <Match when={p.keyedStatus.status === "ok"}>
                  <div class="ui-gap-sm ui-pad border-base-300 flex max-h-[300px] flex-wrap overflow-auto rounded border font-mono text-xs">
                    <For each={(p.keyedStatus as Extract<DisaggregationPossibleValuesStatus, { status: "ok" }>).values}>
                      {(opt) => {
                        return (
                          <div
                            class="ui-hoverable bg-base-200 data-[selected=true]:bg-success data-[selected=true]:text-base-100 rounded px-2 py-1"
                            onClick={() => toggleVal(opt)}
                            data-selected={keyedFilter.values.some(
                              v => String(v).toLowerCase() === String(opt).toLowerCase()
                            )}
                          >
                            <span class="relative">
                              {keyedFilter.disOpt === "indicator_common_id"
                                ? String(opt).toUpperCase()
                                : opt}
                            </span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Match>
              </Switch>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

export type PeriodFilterPropsPeriodId = {
  periodBounds: PeriodBounds;
  periodFilter: PeriodBounds;
  periodType: "year-month" | "year-quarter";
  onUpdate: (v: { minPeriodId: number; maxPeriodId: number }) => void;
};

export function PeriodFilterPeriodId(p: PeriodFilterPropsPeriodId) {
  const [tempMinTime, setTempMinTime] = createSignal<number>(
    getTimeFromPeriodId(
      Math.max(p.periodFilter.min, p.periodBounds.min),
      p.periodType,
    ),
  );
  const [tempMaxTime, setTempMaxTime] = createSignal<number>(
    getTimeFromPeriodId(
      Math.min(p.periodFilter.max, p.periodBounds.max),
      p.periodType,
    ),
  );
  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  function save() {
    p.onUpdate({
      minPeriodId: getPeriodIdFromTime(tempMinTime(), p.periodType),
      maxPeriodId: getPeriodIdFromTime(tempMaxTime(), p.periodType),
    });
    setNeedsSave(false);
  }

  return (
    <div class="">
      <DoubleSlider
        min={getTimeFromPeriodId(p.periodBounds.min, p.periodType)}
        max={getTimeFromPeriodId(p.periodBounds.max, p.periodType)}
        increment={1}
        valueLow={tempMinTime()}
        valueHigh={tempMaxTime()}
        onChangeLow={(v) => {
          setTempMinTime(v);
          setNeedsSave(true);
        }}
        onChangeHigh={(v) => {
          setTempMaxTime(v);
          setNeedsSave(true);
        }}
      />
      <div class="ui-gap-sm flex pt-1 text-sm">
        <div class="flex-1 truncate">
          {formatPeriod(
            getPeriodIdFromTime(tempMinTime(), p.periodType),
            p.periodType,
            getCalendar(),
          )}{" "}
          {t3({ en: "to", fr: "à" })}{" "}
          {formatPeriod(
            getPeriodIdFromTime(tempMaxTime(), p.periodType),
            p.periodType,
            getCalendar(),
          )}
        </div>
        <Show when={needsSave()}>
          <div class="">
            <Button onClick={save} intent="success">
              {t3(TC.update)}
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}

export type PeriodFilterPropsPeriodIdSingle = {
  periodBounds: PeriodBounds;
  periodFilter: PeriodBounds;
  periodType: "year-month" | "year-quarter";
  onUpdate: (v: { minPeriodId: number; maxPeriodId: number }) => void;
};

export function PeriodFilterPeriodIdSingle(p: PeriodFilterPropsPeriodIdSingle) {
  const [tempTime, setTempTime] = createSignal<number>(
    getTimeFromPeriodId(
      Math.max(p.periodFilter.min, p.periodBounds.min),
      p.periodType,
    ),
  );
  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  function save() {
    p.onUpdate({
      minPeriodId: getPeriodIdFromTime(tempTime(), p.periodType),
      maxPeriodId: p.periodBounds.max,
    });
    setNeedsSave(false);
  }

  return (
    <div class="">
      <Slider
        value={tempTime()}
        onChange={(v) => {
          setTempTime(v);
          setNeedsSave(true);
        }}
        min={getTimeFromPeriodId(p.periodBounds.min, p.periodType)}
        max={getTimeFromPeriodId(p.periodBounds.max, p.periodType)}
        step={1}
        fullWidth
      />
      <div class="ui-gap-sm flex pt-1 text-sm">
        <div class="flex-1 truncate">
          {t3({ en: "From:", fr: "De :" })}{" "}
          {formatPeriod(
            getPeriodIdFromTime(tempTime(), p.periodType),
            p.periodType,
            getCalendar(),
          )}
        </div>
        <Show when={needsSave()}>
          <div class="">
            <Button onClick={save} intent="success">
              {t3(TC.update)}
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}

export type NMonthsSelectorProps = {
  nMonths: number | undefined;
  label?: string;
  max?: number;
  onUpdate: (nMonths: number) => void;
};

export function NMonthsSelector(p: NMonthsSelectorProps) {
  const max = p.max ?? 24;
  const [tempNMonths, setTempNMonths] = createSignal<number>(
    p.nMonths ?? 12,
  );
  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  function save() {
    p.onUpdate(tempNMonths());
    setNeedsSave(false);
  }

  return (
    <div class="ui-gap-sm ui-pad border-base-300 rounded border">
      <Slider
        label={p.label ?? t3({ en: "Number of months", fr: "Nombre de mois" })}
        showValueInLabel
        valueInLabelFormatter={v => String(v)}
        value={tempNMonths()}
        onChange={(val) => {
          if (val >= 1 && val <= max) {
            setTempNMonths(val);
            setNeedsSave(true);
          }
        }}
        min={1}
        max={max}
        fullWidth
      />
      <Show when={needsSave()}>
        <div class="flex justify-end">
          <Button onClick={save} intent="success">
            {t3(TC.update)}
          </Button>
        </div>
      </Show>
    </div>
  );
}

export type NYearsSelectorProps = {
  nYears: number | undefined;
  onUpdate: (nYears: number) => void;
};

export function NYearsSelector(p: NYearsSelectorProps) {
  const [tempNYears, setTempNYears] = createSignal<number>(
    p.nYears ?? 1,
  );
  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  function save() {
    p.onUpdate(tempNYears());
    setNeedsSave(false);
  }

  return (
    <div class="ui-gap-sm ui-pad border-base-300 rounded border">
      <Slider
        label={t3({ en: "Number of years", fr: "Nombre d'années" })}
        showValueInLabel
        valueInLabelFormatter={v => String(v)}
        value={tempNYears()}
        onChange={(val) => {
          if (val >= 1 && val <= 10) {
            setTempNYears(val);
            setNeedsSave(true);
          }
        }}
        min={1}
        max={10}
        fullWidth
      />
      <Show when={needsSave()}>
        <div class="flex justify-end">
          <Button onClick={save} intent="success">
            {t3(TC.update)}
          </Button>
        </div>
      </Show>
    </div>
  );
}

export type NQuartersSelectorProps = {
  nQuarters: number | undefined;
  onUpdate: (nQuarters: number) => void;
};

export function NQuartersSelector(p: NQuartersSelectorProps) {
  const [tempNQuarters, setTempNQuarters] = createSignal<number>(
    p.nQuarters ?? 1,
  );
  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  function save() {
    p.onUpdate(tempNQuarters());
    setNeedsSave(false);
  }

  return (
    <div class="ui-gap-sm ui-pad border-base-300 rounded border">
      <Slider
        label={t3({ en: "Number of quarters", fr: "Nombre de trimestres" })}
        showValueInLabel
        valueInLabelFormatter={v => String(v)}
        value={tempNQuarters()}
        onChange={(val) => {
          if (val >= 1 && val <= 20) {
            setTempNQuarters(val);
            setNeedsSave(true);
          }
        }}
        min={1}
        max={20}
        fullWidth
      />
      <Show when={needsSave()}>
        <div class="flex justify-end">
          <Button onClick={save} intent="success">
            {t3(TC.update)}
          </Button>
        </div>
      </Show>
    </div>
  );
}

export type PeriodFilterPropsYear = {
  periodBounds: PeriodBounds;
  periodFilter: PeriodBounds;
  onUpdate: (v: { minYear: number; maxYear: number }) => void;
};

export function PeriodFilterYear(p: PeriodFilterPropsYear) {
  const [tempMinTime, setTempMinTime] = createSignal<number>(
    p.periodFilter.min,
  );
  const [tempMaxTime, setTempMaxTime] = createSignal<number>(
    p.periodFilter.max,
  );
  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  function save() {
    p.onUpdate({
      minYear: tempMinTime(),
      maxYear: tempMaxTime(),
    });
    setNeedsSave(false);
  }

  return (
    <div class="">
      <DoubleSlider
        min={p.periodBounds.min}
        max={p.periodBounds.max}
        increment={1}
        valueLow={tempMinTime()}
        valueHigh={tempMaxTime()}
        onChangeLow={(v) => {
          setTempMinTime(v);
          setNeedsSave(true);
        }}
        onChangeHigh={(v) => {
          setTempMaxTime(v);
          setNeedsSave(true);
        }}
      />
      <div class="ui-gap-sm flex pt-3">
        <div class="flex-1 truncate">
          {tempMinTime().toFixed(0)} {t3({ en: "to", fr: "à" })} {tempMaxTime().toFixed(0)}
        </div>
        <Show when={needsSave()}>
          <div class="">
            <Button onClick={save} intent="success">
              {t3(TC.update)}
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
