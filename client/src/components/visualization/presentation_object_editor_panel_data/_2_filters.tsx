import {
  type DisaggregationPossibleValuesStatus,
  PeriodBounds,
  PresentationObjectConfig,
  PresentationObjectDetail,
  getCalendar,
  t,
  t2,
  T,
  type DisaggregationOption,
  type PresentationOption,
  type ResultsValueInfoForPresentationObject,
  type TranslatableString,
} from "lib";
import {
  Button,
  Checkbox,
  DoubleSlider,
  RadioGroup,
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
  resultsValueInfo: TimQuery<ResultsValueInfoForPresentationObject>;
  allowedFilterOptions: {
    value: DisaggregationOption;
    label: string | TranslatableString;
    isRequired: boolean;
    allowedPresentationOptions?: PresentationOption[];
  }[];
};

export function Filters(p: FiltersProps) {
  return (
    <div class="ui-spy-sm">
      <div class="text-md font-700">{t2(T.FRENCH_UI_STRINGS.filter)}</div>

      <StateHolderWrapper state={p.resultsValueInfo.state()} noPad>
        {(keyedResultsValueInfo) => {
          const excludedFilters = !!keyedResultsValueInfo.periodBounds
            ? ["year", "period_id", "quarter_id", "month"]
            : ["period_id", "quarter_id", "month"];
          const filterOptionsExcludingPeriods = () =>
            p.allowedFilterOptions.filter((opt) => {
              return !excludedFilters.includes(opt.value);
            });
          return (
            <div class="ui-spy-sm">
              <Show when={p.poDetail.resultsValue.valueProps.length > 1}>
                <DataValuesFilter
                  poDetail={p.poDetail}
                  tempConfig={p.tempConfig}
                  setTempConfig={p.setTempConfig}
                />
              </Show>

              <Show when={keyedResultsValueInfo.periodBounds} keyed>
                {(keyedPeriodBounds) => {
                  return (
                    <PeriodFilter
                      tempConfig={p.tempConfig}
                      setTempConfig={p.setTempConfig}
                      keyedPeriodBounds={keyedPeriodBounds}
                      keyedResultsValueInfo={keyedResultsValueInfo}
                    />
                  );
                }}
              </Show>

              <For each={filterOptionsExcludingPeriods()}>
                {(disOpt) => {
                  const status = () => keyedResultsValueInfo.disaggregationPossibleValues[disOpt.value];
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
          );
        }}
      </StateHolderWrapper>
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
        label={t2(T.Visualizations.filter_data_values)}
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
  keyedResultsValueInfo: any;
};

function PeriodFilter(p: PeriodFilterProps) {
  return (
    <div class="ui-spy-sm">
      <Checkbox
        label={t2(T.FRENCH_UI_STRINGS.filter_time_period)}
        checked={!!p.tempConfig.d.periodFilter}
        onChange={(checked) => {
          if (checked) {
            p.setTempConfig("d", "periodFilter", {
              filterType: "last_12_months",
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
          return (
            <div class="ui-spy-sm pb-4 pl-4">
              <RadioGroup
                value={p.tempConfig.d.periodFilter?.filterType}
                options={
                  p.keyedResultsValueInfo.periodBounds?.periodOption === "year"
                    ? [
                      {
                        value: "last_12_months",
                        label: "Last year",
                      },
                      {
                        value: "custom",
                        label: "Custom",
                      },
                    ]
                    : [
                      {
                        value: "last_12_months",
                        label: "Last 12 months",
                      },
                      {
                        value: "last_calendar_year",
                        label: "Last full calendar year",
                      },
                      {
                        value: "custom",
                        label: "Custom",
                      },
                    ]
                }
                onChange={(v) =>
                  p.setTempConfig(
                    "d",
                    "periodFilter",
                    "filterType",
                    v as "last_12_months" | "last_calendar_year" | "custom",
                  )
                }
              />
              <Switch>
                <Match
                  when={
                    p.tempConfig.d.periodFilter?.filterType === "custom" &&
                    p.keyedPeriodBounds.periodOption === "period_id"
                  }
                >
                  <PeriodFilterPeriodId
                    periodBounds={p.keyedPeriodBounds}
                    periodFilter={keyedPeriodFilter}
                    onUpdate={(v) =>
                      p.setTempConfig("d", "periodFilter", {
                        periodOption: p.keyedPeriodBounds.periodOption,
                        min: v.minPeriodId,
                        max: v.maxPeriodId,
                      })
                    }
                  />
                </Match>
                <Match
                  when={
                    p.tempConfig.d.periodFilter?.filterType === "custom" &&
                    p.keyedPeriodBounds.periodOption === "year"
                  }
                >
                  <PeriodFilterYear
                    periodBounds={p.keyedPeriodBounds}
                    periodFilter={keyedPeriodFilter}
                    onUpdate={(v) =>
                      p.setTempConfig("d", "periodFilter", {
                        periodOption: p.keyedPeriodBounds.periodOption,
                        min: v.minYear,
                        max: v.maxYear,
                      })
                    }
                  />
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
  disOpt: any;
  keyedStatus: DisaggregationPossibleValuesStatus;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function DisaggregationFilter(p: DisaggregationFilterProps) {
  return (
    <div class="ui-spy-sm">
      <Checkbox
        label={t2(p.disOpt.label)}
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
            p.setTempConfig(
              "d",
              "filterBy",
              (fil) => fil.disOpt === p.disOpt.value,
              "values",
              (prev) => {
                if (prev?.includes(val)) {
                  return prev.filter((v) => v !== val);
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
                    {t("Too many values (over 500) to display as filter options.")}
                  </div>
                </Match>
                <Match when={p.keyedStatus.status === "no_values_available"}>
                  <div class="ui-pad text-sm text-info">
                    {t("No data available for this dimension.")}
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
                            data-selected={keyedFilter.values.includes(opt)}
                          >
                            <span class="relative">
                              {keyedFilter.disOpt === "indicator_common_id"
                                ? t(opt).toUpperCase()
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

type PeriodFilterPropsPeriodId = {
  periodBounds: PeriodBounds;
  periodFilter: PeriodBounds;
  onUpdate: (v: { minPeriodId: number; maxPeriodId: number }) => void;
};

function PeriodFilterPeriodId(p: PeriodFilterPropsPeriodId) {
  const [tempMinTime, setTempMinTime] = createSignal<number>(
    getTimeFromPeriodId(
      Math.max(p.periodFilter.min, p.periodBounds.min),
      "year-month",
    ),
  );
  const [tempMaxTime, setTempMaxTime] = createSignal<number>(
    getTimeFromPeriodId(
      Math.min(p.periodFilter.max, p.periodBounds.max),
      "year-month",
    ),
  );
  const [needsSave, setNeedsSave] = createSignal<boolean>(false);

  function save() {
    p.onUpdate({
      minPeriodId: getPeriodIdFromTime(tempMinTime(), "year-month"),
      maxPeriodId: getPeriodIdFromTime(tempMaxTime(), "year-month"),
    });
    setNeedsSave(false);
  }

  return (
    <div class="">
      <DoubleSlider
        min={getTimeFromPeriodId(p.periodBounds.min, "year-month")}
        max={getTimeFromPeriodId(p.periodBounds.max, "year-month")}
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
            getPeriodIdFromTime(tempMinTime(), "year-month"),
            "year-month",
            getCalendar(),
          )}{" "}
          to{" "}
          {formatPeriod(
            getPeriodIdFromTime(tempMaxTime(), "year-month"),
            "year-month",
            getCalendar(),
          )}
        </div>
        <Show when={needsSave()}>
          <div class="">
            <Button onClick={save} intent="success">
              {t2(T.Modules.update)}
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}

type PeriodFilterPropsYear = {
  periodBounds: PeriodBounds;
  periodFilter: PeriodBounds;
  onUpdate: (v: { minYear: number; maxYear: number }) => void;
};

function PeriodFilterYear(p: PeriodFilterPropsYear) {
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
          {tempMinTime().toFixed(0)} to {tempMaxTime().toFixed(0)}
        </div>
        <Show when={needsSave()}>
          <div class="">
            <Button onClick={save} intent="success">
              {t2(T.Modules.update)}
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
