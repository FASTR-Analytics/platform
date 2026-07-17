import {
 type BoundedPeriodFilter,
 type DisaggregationPossibleValuesStatus,
 inferPeriodFormatFromValue,
 PeriodBounds,
 periodFilterHasBounds,
 PresentationObjectConfig,
 PresentationObjectDetail,
 ResultsValue,
 getCalendar,
 t3,
 TC,
 type ResultsValueInfoForPresentationObject,
} from"lib";
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
 type Query,
} from"panther";
import { For, Match, Show, Switch, createMemo, createSignal } from"solid-js";
import { SetStoreFunction } from"solid-js/store";
import { getDisplayDisaggregationLabel } from"~/state/instance/_util_disaggregation_label";

// Extract the calendar year from any period value (year YYYY / quarter_id YYYYQ /
// period_id YYYYMM), keyed by digit length now that the three formats are disjoint.
function periodToYear(v: number): number {
 const len = String(v).length;
 if (len <= 4) return v;
 if (len === 5) return Math.floor(v / 10);
 return Math.floor(v / 100);
}

type FiltersProps = {
 poDetail: PresentationObjectDetail;
 tempConfig: PresentationObjectConfig;
 setTempConfig: SetStoreFunction<PresentationObjectConfig>;
 resultsValueInfo: ResultsValueInfoForPresentationObject;
 allowedFilterOptions: ResultsValue["disaggregationOptions"];
};

export function Filters(p: FiltersProps) {
 const excludedFilters = !!p.resultsValueInfo.periodBounds
    ? ["year","period_id","quarter_id","month"]
    : ["period_id","quarter_id","month"];
 const filterOptionsExcludingPeriods = () =>
 p.allowedFilterOptions.filter((opt) => {
 return !excludedFilters.includes(opt.value);
    });

 return (
    <div class="ui-spy-sm">
      <div class="text-md font-700">{t3({ en:"Filter (subset)", fr:"Filtre (sous-ensemble)", pt:"Filtro (subconjunto)"})}</div>

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
 label={t3({ en:"Data values", fr:"Valeurs des données", pt:"Valores dos dados"})}
 checked={!!p.tempConfig.d.valuesFilter}
 onChange={(checked) => {
 if (checked) {
 p.setTempConfig("d","valuesFilter", []);
          } else {
 p.setTempConfig("d","valuesFilter", undefined);
          }
        }}
      />
      <Show when={p.tempConfig.d.valuesFilter} keyed>
        {(keyedValuesFilter) => {
 function toggleVal(val: string) {
 p.setTempConfig("d","valuesFilter", (prev) => {
 if (prev?.includes(val)) {
 return prev.filter((v) => v !== val);
              }
 return [...(prev ?? []), val];
            });
          }
 return (
            <div class="pb-4">
              <div class="ui-gap-sm ui-pad flex max-h-[300px] flex-wrap overflow-auto rounded border font-mono text-xs">
                <For each={p.poDetail.resultsValue.valueProps}>
                  {(opt) => {
 return (
                      <div
 class="cursor-pointer rounded px-2 py-1"
 classList={{
"bg-success text-base-100": keyedValuesFilter.includes(opt),
"ui-hoverable-base-200": !keyedValuesFilter.includes(opt),
                        }}
 onClick={() => toggleVal(opt)}
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
 label={t3({ en:"Time period", fr:"Période", pt:"Período"})}
 checked={!!p.tempConfig.d.periodFilter}
 onChange={(checked) => {
 if (checked) {
 if (inferPeriodFormatFromValue(p.keyedPeriodBounds.min) ==="quarter_id") {
 p.setTempConfig("d","periodFilter", { filterType:"last_n_calendar_quarters", nQuarters: 4 });
            } else {
 p.setTempConfig("d","periodFilter", { filterType:"last_n_months", nMonths: 12 });
            }
          } else {
 p.setTempConfig("d","periodFilter", undefined);
          }
        }}
      />
      <Show when={p.tempConfig.d.periodFilter} keyed>
        {(rawPeriodFilter) => {
 const displayFilterType = () => {
 const ft = p.tempConfig.d.periodFilter?.filterType;
 if (ft ==="last_calendar_year") return"last_n_calendar_years";
 if (ft ==="last_calendar_quarter") return"last_n_calendar_quarters";
 return ft;
          };
 const periodOption = inferPeriodFormatFromValue(p.keyedPeriodBounds.min);
 const boundedFilter = createMemo(() =>
 periodFilterHasBounds(rawPeriodFilter) ? rawPeriodFilter : undefined
          );
 return (
            <div class="ui-spy-sm pb-4 pl-4">
              <RadioGroup
 value={displayFilterType()}
 options={
 periodOption ==="year"
                    ? [
                      {
 value:"last_n_months",
 label: t3({ en:"Last year", fr:"Dernière année", pt:"Último ano"}),
                      },
                      {
 value:"custom",
 label: t3({ en:"Custom", fr:"Personnalisé", pt:"Personalizado"}),
                      },
                    ]
                    : periodOption ==="quarter_id"
                      ? [
                        {
 value:"last_n_calendar_quarters",
 label: t3({ en:"Last N calendar quarters", fr:"Derniers N trimestres civils", pt:"Últimos N trimestres civis"}),
                        },
                        {
 value:"from_month",
 label: t3({ en:"From specific quarter", fr:"À partir d'un trimestre spécifique", pt:"A partir de um trimestre específico"}),
                        },
                        {
 value:"custom",
 label: t3({ en:"Custom", fr:"Personnalisé", pt:"Personalizado"}),
                        },
                      ]
                      : [
                        {
 value:"last_n_months",
 label: t3({ en:"Last N months", fr:"Derniers N mois", pt:"Últimos N meses"}),
                        },
                        {
 value:"from_month",
 label: t3({ en:"From specific month to present", fr:"À partir d'un mois spécifique jusqu'à aujourd'hui", pt:"De um mês específico até ao presente"}),
                        },
                        {
 value:"last_n_calendar_years",
 label: t3({ en:"Last N full calendar years", fr:"Dernières N années civiles complètes", pt:"Últimos N anos civis completos"}),
                        },
                        {
 value:"last_n_calendar_quarters",
 label: t3({ en:"Last N full calendar quarters", fr:"Derniers N trimestres civils complets", pt:"Últimos N trimestres civis completos"}),
                        },
                        {
 value:"custom",
 label: t3({ en:"Custom", fr:"Personnalisé", pt:"Personalizado"}),
                        },
                      ]
                }
 onChange={(v) => {
 const newType = v as NonNullable<PresentationObjectConfig["d"]["periodFilter"]>["filterType"];
 if (newType ==="custom"|| newType ==="from_month") {
 p.setTempConfig("d","periodFilter", {
 filterType: newType,
 min: p.keyedPeriodBounds.min,
 max: p.keyedPeriodBounds.max,
                    });
                  } else if (newType ==="last_n_months") {
 p.setTempConfig("d","periodFilter", { filterType: newType, nMonths: 12 });
                  } else if (newType ==="last_n_calendar_years") {
 p.setTempConfig("d","periodFilter", { filterType: newType, nYears: 1 });
                  } else if (newType ==="last_n_calendar_quarters") {
 p.setTempConfig("d","periodFilter", { filterType: newType, nQuarters: 4 });
                  } else {
 p.setTempConfig("d","periodFilter", { filterType: newType });
                  }
                }}
              />
              <Show
 when={
 rawPeriodFilter.filterType ==="last_n_months"&&
 periodOption ==="period_id"
                }
              >
                <NMonthsSelector
 nMonths={rawPeriodFilter.filterType ==="last_n_months"? rawPeriodFilter.nMonths : undefined}
 onUpdate={(nMonths) =>
 p.setTempConfig("d","periodFilter", { filterType:"last_n_months", nMonths })
                  }
                />
              </Show>
              <Show
 when={
 rawPeriodFilter.filterType ==="last_n_calendar_years"||
 rawPeriodFilter.filterType ==="last_calendar_year"
                }
              >
                <NYearsSelector
 nYears={
 rawPeriodFilter.filterType ==="last_n_calendar_years"
                      ? rawPeriodFilter.nYears
                      : undefined
                  }
 onUpdate={(nYears) => {
 p.setTempConfig("d","periodFilter", { filterType:"last_n_calendar_years", nYears });
                  }}
                />
              </Show>
              <Show
 when={
 rawPeriodFilter.filterType ==="last_n_calendar_quarters"||
 rawPeriodFilter.filterType ==="last_calendar_quarter"
                }
              >
                <NQuartersSelector
 nQuarters={
 rawPeriodFilter.filterType ==="last_n_calendar_quarters"
                      ? rawPeriodFilter.nQuarters
                      : undefined
                  }
 onUpdate={(nQuarters) => {
 p.setTempConfig("d","periodFilter", { filterType:"last_n_calendar_quarters", nQuarters });
                  }}
                />
              </Show>
              <Show
 when={rawPeriodFilter.filterType ==="from_month"&& boundedFilter()}
 keyed
              >
                {(bf) => (
                  <div class="ui-gap-sm ui-pad rounded border">
                    <PeriodFilterPeriodIdSingle
 periodBounds={p.keyedPeriodBounds}
 periodFilter={bf}
 periodType={periodOption ==="quarter_id"?"year-quarter":"year-month"}
 onUpdate={(v) =>
 p.setTempConfig("d","periodFilter", {
 filterType:"from_month",
 min: v.minPeriodId,
 max: p.keyedPeriodBounds.max,
                        })
                      }
                    />
                  </div>
                )}
              </Show>
              <Switch>
                <Match
 when={
 rawPeriodFilter.filterType ==="custom"&&
                    (periodOption ==="period_id"|| periodOption ==="quarter_id") &&
 boundedFilter()
                  }
 keyed
                >
                  {(bf) => (
                    <div class="ui-gap-sm ui-pad rounded border">
                      <PeriodFilterPeriodId
 periodBounds={p.keyedPeriodBounds}
 periodFilter={bf}
 periodType={periodOption ==="quarter_id"?"year-quarter":"year-month"}
 onUpdate={(v) =>
 p.setTempConfig("d","periodFilter", {
 filterType:"custom",
 min: v.minPeriodId,
 max: v.maxPeriodId,
                          })
                        }
                      />
                    </div>
                  )}
                </Match>
                <Match
 when={rawPeriodFilter.filterType ==="custom"&& boundedFilter()}
 keyed
                >
                  {(bf) => {
 const toYear = periodToYear;
 return (
                      <PeriodFilterYear
 periodBounds={{
 min: toYear(p.keyedPeriodBounds.min),
 max: toYear(p.keyedPeriodBounds.max),
                        }}
 periodFilter={{
                          ...bf,
 min: toYear(bf.min),
 max: toYear(bf.max),
                        }}
 onUpdate={(v) =>
 p.setTempConfig("d","periodFilter", {
 filterType:"custom",
 min: v.minYear,
 max: v.maxYear,
                          })
                        }
                      />
                    );
                  }}
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
 label={t3(getDisplayDisaggregationLabel(p.disOpt.value))}
 checked={
          !!p.tempConfig.d.filterBy.some((fil) => fil.disOpt === p.disOpt.value)
        }
 onChange={(checked) => {
 if (checked) {
 p.setTempConfig("d","filterBy", (prev) => [
              ...prev.filter((d) => d.disOpt !== p.disOpt.value),
              { disOpt: p.disOpt.value, values: [] },
            ]);
          } else {
 p.setTempConfig("d","filterBy", (prev) =>
 prev.filter((d) => d.disOpt !== p.disOpt.value),
            );
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
 function toggleVal(id: string) {
 const normalized = String(id).toLowerCase();
 p.setTempConfig(
"d",
"filterBy",
              (fil) => fil.disOpt === p.disOpt.value,
"values",
              (prev) => {
 if (prev?.some(v => String(v).toLowerCase() === normalized)) {
 return prev.filter(v => String(v).toLowerCase() !== normalized);
                }
 return [...(prev ?? []), id];
              },
            );
          }
 return (
            <div class="pb-4">
              <Switch>
                <Match when={p.keyedStatus.status ==="too_many_values"}>
                  <div class="ui-pad text-sm text-warning">
                    {t3({ en:"Too many values (over 500) to display as filter options.", fr:"Trop de valeurs (plus de 500) pour les afficher comme options de filtre.", pt:"Demasiados valores (mais de 500) para apresentar como opções de filtro."})}
                  </div>
                </Match>
                <Match when={p.keyedStatus.status ==="no_values_available"}>
                  <div class="ui-pad text-sm text-base-content-muted">
                    {t3({ en:"No data available for this dimension.", fr:"Aucune donnée disponible pour cette dimension.", pt:"Nenhum dado disponível para esta dimensão."})}
                  </div>
                </Match>
                <Match when={p.keyedStatus.status ==="error"}>
                  <div class="ui-pad text-sm text-danger">
                    {t3({ en:"Error loading values:", fr:"Erreur lors du chargement des valeurs :", pt:"Erro ao carregar os valores:"})}
                    {(p.keyedStatus as Extract<DisaggregationPossibleValuesStatus, { status:"error"}>).message}
                  </div>
                </Match>
                <Match when={p.keyedStatus.status ==="ok"}>
                  <div class="ui-gap-sm ui-pad flex max-h-[300px] flex-wrap overflow-auto rounded border text-xs">
                    <For each={(p.keyedStatus as Extract<DisaggregationPossibleValuesStatus, { status:"ok"}>).values}>
                      {(opt) => {
 return (
                          <div
 class="cursor-pointer rounded px-2 py-1"
 classList={{
"bg-success text-base-100": keyedFilter.values.some(
 v => String(v).toLowerCase() === String(opt.id).toLowerCase()
                              ),
"ui-hoverable-base-200": !keyedFilter.values.some(
 v => String(v).toLowerCase() === String(opt.id).toLowerCase()
                              ),
                            }}
 onClick={() => toggleVal(opt.id)}
                          >
                            <span class="relative">{opt.label}</span>
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
 periodType:"year-month"|"year-quarter";
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
          )}{""}
          {t3({ en:"to", fr:"à", pt:"a"})}{""}
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
 periodType:"year-month"|"year-quarter";
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
          {t3({ en:"From:", fr:"De :", pt:"De:"})}{""}
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
    <div class="ui-gap-sm ui-pad rounded border">
      <Slider
 label={p.label ?? t3({ en:"Number of months", fr:"Nombre de mois", pt:"Número de meses"})}
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
    <div class="ui-gap-sm ui-pad rounded border">
      <Slider
 label={t3({ en:"Number of years", fr:"Nombre d'années", pt:"Número de anos"})}
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
    <div class="ui-gap-sm ui-pad rounded border">
      <Slider
 label={t3({ en:"Number of quarters", fr:"Nombre de trimestres", pt:"Número de trimestres"})}
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
          {tempMinTime().toFixed(0)} {t3({ en:"to", fr:"à", pt:"a"})} {tempMaxTime().toFixed(0)}
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
