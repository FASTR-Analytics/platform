import {
  ChartOHJsonDataConfig,
  ChartOVJsonDataConfig,
  HeaderSortConfig,
  TableJsonDataConfig,
  TimeseriesJsonDataConfig,
} from "panther";
import {
  CountryCodes,
  FigureLocalization,
  LEGACY_ROLLUP_SENTINEL,
  pickLang,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  formatNigeriaAdminAreaLabel,
  getDisaggregatorDisplayProp,
  getRollupAdminLevel,
  getRollupLabelContext,
  get_INDICATOR_COMMON_IDS_IN_SORT_ORDER,
  isRollupActive,
  periodOptionToPeriodType,
  ROLLUP_PIN_IDS,
  ROLLUP_SENTINEL,
  TC,
} from "lib";
import { getDateLabelReplacements } from "./get_date_label_replacements";
import { getNigeriaAdminAreaLabelReplacements } from "./format_admin_area_labels";

function includesIndicatorDisaggregation(config: PresentationObjectConfig): boolean {
  return config.d.disaggregateBy.some((d) => d.disOpt === "indicator_common_id");
}

function getNigeriaLabelReplacements(countryIso3: string | undefined, jsonArray?: any[]): Record<string, string> {
  if (countryIso3 === CountryCodes.Nigeria && jsonArray) {
    return getNigeriaAdminAreaLabelReplacements(jsonArray);
  }
  return {};
}

// Merges the previously-split `labelReplacementsBeforeSorting` +
// `labelReplacementsAfterSorting` into panther's single `labelReplacements` map.
// Order matters: later entries override earlier ones on key collision (matches
// the previous display behavior, since "after" was applied last).
//
// When the roll-up is active, the sentinel (plus the legacy sentinel still
// present in stored figure grids from a prior release) maps to the roll-up
// label; positioning is handled by `getRollupAwareSort` below.
function buildLabelReplacements(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
  dateLabelReplacements: Record<string, string>,
  localization: Pick<FigureLocalization, "language" | "countryIso3">,
  jsonArray?: any[],
): Record<string, string> {
  const base = {
    ...(resultsValue.valueLabelReplacements ?? {}),
    ...indicatorLabelReplacements,
    ...dateLabelReplacements,
    ...getNigeriaLabelReplacements(localization.countryIso3, jsonArray),
  };
  if (!isRollupActive(config)) {
    return base;
  }
  const rollupLabel = getRollupRowLabel(config, localization.language, localization.countryIso3);
  return {
    ...base,
    [ROLLUP_SENTINEL]: rollupLabel,
    [LEGACY_ROLLUP_SENTINEL]: rollupLabel,
  };
}

// The roll-up row's label, from getRollupLabelContext (shared with the editor
// checkbox). Scope words, not operation words ("Total" would imply SUM, but
// the row can be an AVG or a recomputed ratio): "National", "{Area} — All
// areas" for a pinned parent, "All selected areas" when admin filters subset
// the geography.
function getRollupRowLabel(config: PresentationObjectConfig, language: "en" | "fr", countryIso3: string | undefined): string {
  const ctx = getRollupLabelContext(config);
  if (ctx?.kind === "subset") {
    return pickLang(language, { en: "All selected areas", fr: "Toutes les zones sélectionnées" });
  }
  if (ctx?.kind === "pinned" && ctx.value) {
    return `${resolveAdminAreaLabel(ctx.value, countryIso3)} — ${pickLang(language, { en: "All areas", fr: "Toutes les zones" })}`;
  }
  return pickLang(language, TC.national);
}

// Display label for a raw admin-area value. Nigeria has a dedicated cleaner; every
// other country uses the raw value as-is (the existing replacement maps don't carry
// admin_area_2 names).
function resolveAdminAreaLabel(value: string, countryIso3: string | undefined): string {
  return countryIso3 === CountryCodes.Nigeria
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

// Alphabetical-by-label sort that, when the roll-up is active, pins the sentinel
// (and the legacy sentinel from stored figure grids) to the configured position.
// Declarative so it stays structuredClone-safe inside stored FigureInputs.
// Pinning by raw id is a no-op on axes without these ids.
function getRollupAwareSort(config: PresentationObjectConfig): HeaderSortConfig {
  if (!isRollupActive(config)) {
    return "by-label";
  }
  return config.d.adminAreaRollupPosition === "top"
    ? { base: "by-label", first: ROLLUP_PIN_IDS }
    : { base: "by-label", last: ROLLUP_PIN_IDS };
}

// Pin-only sort for the chart indicator axis under sortIndicatorValues "none":
// preserves the axis's data order (panther applies no base sort within the
// unpinned bucket; stable sort keeps existing order) and only moves the
// sentinel to the configured end.
function getRollupPinOnlySort(config: PresentationObjectConfig): HeaderSortConfig {
  return config.d.adminAreaRollupPosition === "top"
    ? { first: ROLLUP_PIN_IDS }
    : { last: ROLLUP_PIN_IDS };
}

export function getTimeseriesJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  localization: Pick<FigureLocalization, "language" | "countryIso3">,
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
      series: getRollupAwareSort(config),
      lane: getRollupAwareSort(config),
      tier: getRollupAwareSort(config),
      pane: getRollupAwareSort(config),
    },
    labelReplacements: buildLabelReplacements(
      resultsValue,
      config,
      indicatorLabelReplacements,
      {},
      localization,
      jsonArray,
    ),
  };
}

export function getTableJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  localization: FigureLocalization,
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
    ? getDateLabelReplacements(jsonArray, [colProp, rowProp, colGroupProp, rowGroupProp], localization.calendar)
    : {};

  const tableSort: HeaderSortConfig = customSortHeaders
    ? { byIdOrder: customSortHeaders }
    : includesIndicatorDisaggregation(config)
      ? { byIdOrder: get_INDICATOR_COMMON_IDS_IN_SORT_ORDER() }
      : "by-label";

  // Pin the roll-up sentinel on whichever table axis carries the rolled-up admin
  // level — `byIdOrder` can't also carry first/last, so the admin axis uses the
  // pinned sort while other axes keep `tableSort`. On non-admin axes the pins would
  // be no-ops anyway; restricting to the admin axis avoids clobbering an indicator
  // axis's `byIdOrder`. The admin axis is never the indicator axis.
  const adminAxis = getTableAdminAxis(config);
  const axisSort = (
    axis: "row" | "rowGroup" | "col" | "colGroup",
  ): HeaderSortConfig =>
    axis === adminAxis ? getRollupAwareSort(config) : tableSort;

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
    // The total row must not stretch auto conditional-formatting domains.
    liveDomainExcludeIds: isRollupActive(config) ? ROLLUP_PIN_IDS : undefined,
    labelReplacements: buildLabelReplacements(
      resultsValue,
      config,
      indicatorLabelReplacements,
      dateLabelReplacements,
      localization,
      jsonArray,
    ),
  };
}

// The table axis (row/rowGroup/col/colGroup) displaying the rolled-up admin
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
  localization: FigureLocalization,
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
    ? getDateLabelReplacements(jsonArray, [indicatorProp, seriesProp, paneProp, laneProp, tierProp], localization.calendar)
    : {};

  // The indicator ("Bars") axis: panther applies sort.indicator only when
  // sortIndicatorValues is undefined — any string (incl. "none") keeps the
  // axis in DATA order, which is deliberate ("--v" axes carry the module-defined
  // valueProps order). So when the rolled-up admin level sits on this axis and
  // the user hasn't chosen a value sort, we pass undefined + a PIN-ONLY sort:
  // data order is preserved exactly, only the sentinel moves to the chosen end.
  // With asc/desc value sorting, the total bar participates in value order.
  const rollupOnIndicatorAxis =
    isRollupActive(config) &&
    config.d.disaggregateBy.find(
      (d) => d.disOpt === getRollupAdminLevel(config),
    )?.disDisplayOpt === "indicator";
  const pinIndicatorAxis =
    rollupOnIndicatorAxis && config.s.sortIndicatorValues === "none";

  return {
    valueProps: effectiveValueProps,
    indicatorProp,
    seriesProp,
    paneProp,
    laneProp,
    tierProp,
    sort: {
      indicator: pinIndicatorAxis
        ? getRollupPinOnlySort(config)
        : getChartIndicatorSort(config),
      series: getRollupAwareSort(config),
      lane: getRollupAwareSort(config),
      tier: getRollupAwareSort(config),
      pane: getRollupAwareSort(config),
    },
    sortIndicatorValues: pinIndicatorAxis
      ? undefined
      : config.s.sortIndicatorValues,
    labelReplacements: buildLabelReplacements(
      resultsValue,
      config,
      indicatorLabelReplacements,
      dateLabelReplacements,
      localization,
      jsonArray,
    ),
  };
}

export function getChartOVJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  localization: FigureLocalization,
  jsonArray?: any[],
): ChartOVJsonDataConfig {
  return getChartJsonDataConfig(resultsValue, config, effectiveValueProps, indicatorLabelReplacements, localization, jsonArray);
}

export function getChartOHJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  localization: FigureLocalization,
  jsonArray?: any[],
): ChartOHJsonDataConfig {
  return getChartJsonDataConfig(resultsValue, config, effectiveValueProps, indicatorLabelReplacements, localization, jsonArray);
}
