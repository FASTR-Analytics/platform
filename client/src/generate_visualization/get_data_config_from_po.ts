import {
  ChartOHJsonDataConfig,
  ChartOVJsonDataConfig,
  HeaderSortConfig,
  TableJsonDataConfig,
  TimeseriesJsonDataConfig,
} from "panther";
import {
  CountryCodes,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  formatNigeriaAdminAreaLabel,
  getDisaggregatorDisplayProp,
  getParentAdminLevel,
  getRollupAdminLevel,
  get_INDICATOR_COMMON_IDS_IN_SORT_ORDER,
  periodOptionToPeriodType,
  ROLLUP_SENTINEL_BOTTOM,
  ROLLUP_SENTINEL_TOP,
  t3,
  TC,
} from "lib";
import { instanceState } from "../state/instance/t1_store";
import { getDateLabelReplacements } from "./get_date_label_replacements";
import { getNigeriaAdminAreaLabelReplacements } from "./format_admin_area_labels";

function includesIndicatorDisaggregation(config: PresentationObjectConfig): boolean {
  return config.d.disaggregateBy.some((d) => d.disOpt === "indicator_common_id");
}

function getNigeriaLabelReplacements(jsonArray?: any[]): Record<string, string> {
  if (instanceState.countryIso3 === CountryCodes.Nigeria && jsonArray) {
    return getNigeriaAdminAreaLabelReplacements(jsonArray);
  }
  return {};
}

// Merges the previously-split `labelReplacementsBeforeSorting` +
// `labelReplacementsAfterSorting` into panther's single `labelReplacements` map.
// Order matters: later entries override earlier ones on key collision (matches
// the previous display behavior, since "after" was applied last).
//
// The two roll-up sentinels are raw-data markers for the admin-area total row;
// both translate to the same display label (see `getRollupRowLabel`). Their
// sort-positioning is handled by `rollupAwareSortByLabel` below —
// `ROLLUP_SENTINEL_TOP` → first, `ROLLUP_SENTINEL_BOTTOM` → last.
function buildLabelReplacements(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
  dateLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): Record<string, string> {
  const rollupLabel = getRollupRowLabel(config);
  return {
    ...(resultsValue.valueLabelReplacements ?? {}),
    ...indicatorLabelReplacements,
    ...dateLabelReplacements,
    ...getNigeriaLabelReplacements(jsonArray),
    [ROLLUP_SENTINEL_TOP]: rollupLabel,
    [ROLLUP_SENTINEL_BOTTOM]: rollupLabel,
  };
}

// The roll-up row's label: the parent admin area's name when the viz is pinned to a
// single parent value, otherwise "National". The parent can be pinned either by a
// single-value filterBy entry OR by being the replicant (selectedReplicantValue).
// (AA2's parent AA1 is unfilterable, so AA2 roll-ups always fall back to "National".)
function getRollupRowLabel(config: PresentationObjectConfig): string {
  const level = getRollupAdminLevel(config);
  const parentLevel = level ? getParentAdminLevel(level) : undefined;
  if (!parentLevel) {
    return t3(TC.national);
  }
  const parentDis = config.d.disaggregateBy.find(
    (d) => d.disOpt === parentLevel,
  );
  if (parentDis?.disDisplayOpt === "replicant" && config.d.selectedReplicantValue) {
    return resolveAdminAreaLabel(config.d.selectedReplicantValue);
  }
  const parentFilter = config.d.filterBy.find((f) => f.disOpt === parentLevel);
  if (parentFilter && parentFilter.values.length === 1) {
    return resolveAdminAreaLabel(String(parentFilter.values[0]));
  }
  return t3(TC.national);
}

// Display label for a raw admin-area value. Nigeria has a dedicated cleaner; every
// other country uses the raw value as-is (the existing replacement maps don't carry
// admin_area_2 names).
function resolveAdminAreaLabel(value: string): string {
  return instanceState.countryIso3 === CountryCodes.Nigeria
    ? formatNigeriaAdminAreaLabel(value)
    : value;
}

// Indicator-axis sort for charts: explicit id order when indicator
// disaggregation is on; otherwise alphabetical on display label.
function getChartIndicatorSort(config: PresentationObjectConfig): HeaderSortConfig {
  return includesIndicatorDisaggregation(config)
    ? { byIdOrder: get_INDICATOR_COMMON_IDS_IN_SORT_ORDER() }
    : "by-label";
}

// Alphabetical-by-label sort with raw-id positioning for the roll-up sentinels:
// `ROLLUP_SENTINEL_TOP` is forced first, `ROLLUP_SENTINEL_BOTTOM` last; everything
// else sorts by label. Declarative so it stays structuredClone-safe inside stored
// FigureInputs. Pinning by raw id is a no-op on axes without these ids.
const rollupAwareSortByLabel: HeaderSortConfig = {
  base: "by-label",
  first: [ROLLUP_SENTINEL_TOP],
  last: [ROLLUP_SENTINEL_BOTTOM],
};

export function getTimeseriesJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): TimeseriesJsonDataConfig {
  if (config.d.type !== "timeseries") {
    throw new Error("Bad config type");
  }
  if (!config.d.timeseriesGrouping) {
    throw new Error("Timeseries config missing timeseriesGrouping");
  }

  const periodType = periodOptionToPeriodType(config.d.timeseriesGrouping);

  return {
    valueProps: effectiveValueProps,
    periodProp: config.d.timeseriesGrouping,
    periodType,
    seriesProp:
      getDisaggregatorDisplayProp(resultsValue, config, ["series"], effectiveValueProps) ?? "--v",
    paneProp: getDisaggregatorDisplayProp(resultsValue, config, ["cell"], effectiveValueProps),
    laneProp: getDisaggregatorDisplayProp(resultsValue, config, ["col", "colGroup"], effectiveValueProps),
    tierProp: getDisaggregatorDisplayProp(resultsValue, config, ["row", "rowGroup"], effectiveValueProps),
    sort: {
      series: rollupAwareSortByLabel,
      lane: rollupAwareSortByLabel,
      tier: rollupAwareSortByLabel,
      pane: rollupAwareSortByLabel,
    },
    labelReplacements: buildLabelReplacements(
      resultsValue,
      config,
      indicatorLabelReplacements,
      {},
      jsonArray,
    ),
  };
}

export function getTableJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
  customSortHeaders?: string[],
): TableJsonDataConfig {
  if (config.d.type !== "table") {
    throw new Error("Bad config type");
  }

  const colProp =
    getDisaggregatorDisplayProp(resultsValue, config, ["col"], effectiveValueProps) ?? "--v";
  const rowProp = getDisaggregatorDisplayProp(resultsValue, config, ["row"], effectiveValueProps);
  const colGroupProp = getDisaggregatorDisplayProp(resultsValue, config, ["colGroup"], effectiveValueProps);
  const rowGroupProp = getDisaggregatorDisplayProp(resultsValue, config, ["rowGroup"], effectiveValueProps);

  const dateLabelReplacements = jsonArray
    ? getDateLabelReplacements(jsonArray, [colProp, rowProp, colGroupProp, rowGroupProp])
    : {};

  const tableSort: HeaderSortConfig = customSortHeaders
    ? { byIdOrder: customSortHeaders }
    : includesIndicatorDisaggregation(config)
      ? { byIdOrder: get_INDICATOR_COMMON_IDS_IN_SORT_ORDER() }
      : "by-label";

  // Pin the roll-up sentinel on whichever table axis carries the (finest) admin
  // level — `byIdOrder` can't also carry first/last, so the admin axis uses the
  // pinned sort while other axes keep `tableSort`. On non-admin axes the pins would
  // be no-ops anyway; restricting to the admin axis avoids clobbering an indicator
  // axis's `byIdOrder`. The admin axis is never the indicator axis.
  const adminAxis = getTableAdminAxis(config);
  const axisSort = (
    axis: "row" | "rowGroup" | "col" | "colGroup",
  ): HeaderSortConfig => (axis === adminAxis ? rollupAwareSortByLabel : tableSort);

  return {
    valueProps: effectiveValueProps,
    colProp,
    rowProp,
    colGroupProp,
    rowGroupProp,
    sort: {
      colGroup: axisSort("colGroup"),
      col: axisSort("col"),
      rowGroup: axisSort("rowGroup"),
      row: axisSort("row"),
    },
    labelReplacements: buildLabelReplacements(
      resultsValue,
      config,
      indicatorLabelReplacements,
      dateLabelReplacements,
      jsonArray,
    ),
  };
}

// The table axis (row/rowGroup/col/colGroup) displaying the finest grouped admin
// level — i.e. where the roll-up sentinel row appears — or undefined if none.
function getTableAdminAxis(
  config: PresentationObjectConfig,
): "row" | "rowGroup" | "col" | "colGroup" | undefined {
  const level = getRollupAdminLevel(config);
  const displayOpt = level
    ? config.d.disaggregateBy.find((d) => d.disOpt === level)?.disDisplayOpt
    : undefined;
  return displayOpt === "row" ||
    displayOpt === "rowGroup" ||
    displayOpt === "col" ||
    displayOpt === "colGroup"
    ? displayOpt
    : undefined;
}

function getChartJsonDataConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): ChartOVJsonDataConfig {
  if (config.d.type !== "chart") {
    throw new Error("Bad config type");
  }

  const indicatorProp =
    getDisaggregatorDisplayProp(resultsValue, config, ["indicator"], effectiveValueProps) ?? "--v";
  const seriesProp = getDisaggregatorDisplayProp(resultsValue, config, ["series"], effectiveValueProps);
  const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"], effectiveValueProps);
  const laneProp = getDisaggregatorDisplayProp(resultsValue, config, ["col", "colGroup"], effectiveValueProps);
  const tierProp = getDisaggregatorDisplayProp(resultsValue, config, ["row", "rowGroup"], effectiveValueProps);

  const dateLabelReplacements = jsonArray
    ? getDateLabelReplacements(jsonArray, [indicatorProp, seriesProp, paneProp, laneProp, tierProp])
    : {};

  return {
    valueProps: effectiveValueProps,
    indicatorProp,
    seriesProp,
    paneProp,
    laneProp,
    tierProp,
    sort: {
      indicator: getChartIndicatorSort(config),
      series: rollupAwareSortByLabel,
      lane: rollupAwareSortByLabel,
      tier: rollupAwareSortByLabel,
      pane: rollupAwareSortByLabel,
    },
    sortIndicatorValues: config.s.sortIndicatorValues,
    labelReplacements: buildLabelReplacements(
      resultsValue,
      config,
      indicatorLabelReplacements,
      dateLabelReplacements,
      jsonArray,
    ),
  };
}

export function getChartOVJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): ChartOVJsonDataConfig {
  return getChartJsonDataConfig(resultsValue, config, effectiveValueProps, indicatorLabelReplacements, jsonArray);
}

export function getChartOHJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): ChartOHJsonDataConfig {
  return getChartJsonDataConfig(resultsValue, config, effectiveValueProps, indicatorLabelReplacements, jsonArray);
}
