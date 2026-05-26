import {
  ChartOHJsonDataConfig,
  ChartOVJsonDataConfig,
  HeaderItem,
  HeaderSortConfig,
  TableJsonDataConfig,
  TimeseriesJsonDataConfig,
} from "panther";
import {
  CountryCodes,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  getDisaggregatorDisplayProp,
  get_INDICATOR_COMMON_IDS_IN_SORT_ORDER,
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
// `__NATIONAL` / `zzNATIONAL` are raw-data sentinels for the National aggregate;
// both translate to the same display label. Their sort-positioning is handled
// by `nationalAwareSortByLabel` below — `__NATIONAL` → first, `zzNATIONAL` → last.
function buildLabelReplacements(
  resultsValue: ResultsValueForVisualization,
  indicatorLabelReplacements: Record<string, string>,
  dateLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): Record<string, string> {
  return {
    ...(resultsValue.valueLabelReplacements ?? {}),
    ...indicatorLabelReplacements,
    ...dateLabelReplacements,
    ...getNigeriaLabelReplacements(jsonArray),
    __NATIONAL: t3(TC.national),
    zzNATIONAL: t3(TC.national),
  };
}

// Indicator-axis sort for charts: explicit id order when indicator
// disaggregation is on; otherwise alphabetical on display label.
function getChartIndicatorSort(config: PresentationObjectConfig): HeaderSortConfig {
  return includesIndicatorDisaggregation(config)
    ? { byIdOrder: get_INDICATOR_COMMON_IDS_IN_SORT_ORDER() }
    : "by-label";
}

// Alphabetical-by-label sort with raw-id positioning for the National sentinels:
// `__NATIONAL` is forced first, `zzNATIONAL` last; everything else sorts by label.
// Preserves the prior "sort by raw key" positioning hack under the new
// HeaderItem-based sort model.
//
// NOTE: table sort cannot use this — panther's `applyTableSort` operates on raw
// combo strings and explicitly throws on a custom HeaderSortFunc. For tables,
// position NATIONAL aggregates via `{ byIdOrder: [...] }` with an explicit list.
function nationalAwareSortByLabel(a: HeaderItem, b: HeaderItem): number {
  const aPri = a.id === "__NATIONAL" ? -1 : a.id === "zzNATIONAL" ? 1 : 0;
  const bPri = b.id === "__NATIONAL" ? -1 : b.id === "zzNATIONAL" ? 1 : 0;
  if (aPri !== bPri) {
    return aPri - bPri;
  }
  return a.label.localeCompare(b.label);
}

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

  const periodType =
    config.d.timeseriesGrouping === "period_id"
      ? "year-month"
      : config.d.timeseriesGrouping === "quarter_id"
        ? "year-quarter"
        : "year";

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
      series: nationalAwareSortByLabel,
      lane: nationalAwareSortByLabel,
      tier: nationalAwareSortByLabel,
      pane: nationalAwareSortByLabel,
    },
    labelReplacements: buildLabelReplacements(
      resultsValue,
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

  // Table sort operates on raw combo strings; byIdOrder + by-label are the
  // available shapes. customSortHeaders is a list of ids → byIdOrder.
  const colRowSort: HeaderSortConfig = customSortHeaders
    ? { byIdOrder: customSortHeaders }
    : includesIndicatorDisaggregation(config)
      ? { byIdOrder: get_INDICATOR_COMMON_IDS_IN_SORT_ORDER() }
      : "by-label";

  return {
    valueProps: effectiveValueProps,
    colProp,
    rowProp,
    colGroupProp,
    rowGroupProp,
    sort: { col: colRowSort, row: colRowSort },
    labelReplacements: buildLabelReplacements(
      resultsValue,
      indicatorLabelReplacements,
      dateLabelReplacements,
      jsonArray,
    ),
  };
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
      series: nationalAwareSortByLabel,
      lane: nationalAwareSortByLabel,
      tier: nationalAwareSortByLabel,
      pane: nationalAwareSortByLabel,
    },
    sortIndicatorValues: config.s.sortIndicatorValues,
    labelReplacements: buildLabelReplacements(
      resultsValue,
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
