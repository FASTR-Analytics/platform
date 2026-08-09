import {
  ChartOHJsonDataConfig,
  ChartOVJsonDataConfig,
  HeaderSortConfig,
  type Language,
  TableJsonDataConfig,
  TimeseriesJsonDataConfig,
} from "panther";
import {
  BLANK_SENTINEL,
  BLANK_SENTINEL_LABEL,
  CountryCodes,
  FigureLocalization,
  pickLang,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  formatNigeriaAdminAreaLabel,
  getDisaggregatorDisplayProp,
  getRollupDimension,
  getRollupLabelContext,
  getRollupPosition,
  get_INDICATOR_COMMON_IDS_IN_SORT_ORDER,
  isRollupActive,
  PERIOD_DISAGGREGATION_OPTIONS,
  periodOptionToPeriodType,
  ROLLUP_PIN_IDS,
  sampleNProp,
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

// Display text for a group whose column had no value. `""` is mapped alongside
// the sentinel because figures stored before the blank fold kept the raw empty
// string as their group key, and panther keys label replacements by raw id —
// same reason LEGACY_ROLLUP_SENTINEL is still carried below. Placed first in
// the merge so a metric's own valueLabelReplacements can still override it.
//
// The string "null" is deliberately NOT mapped: unlike "" it is a value a real
// group can legitimately carry (an indicator id, a facility_custom_* cell), so
// claiming it would mislabel real data to rescue a stored-figure case that the
// table renderer cannot reach anyway (panther's resolveId drops null ids before
// any replacement is consulted).
function getBlankLabelReplacements(language: Language): Record<string, string> {
  const label = pickLang(language, BLANK_SENTINEL_LABEL);
  return { [BLANK_SENTINEL]: label, "": label };
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
    ...getBlankLabelReplacements(localization.language),
    ...(resultsValue.valueLabelReplacements ?? {}),
    ...indicatorLabelReplacements,
    ...dateLabelReplacements,
    ...getNigeriaLabelReplacements(localization.countryIso3, jsonArray),
  };
  if (!isRollupActive(config)) {
    return base;
  }
  // All pin ids (current admin + facility sentinels + render-compat legacy)
  // map to the one active roll-up's label — only one roll-up can be active,
  // and a grid only ever carries the sentinel its own dimension emitted.
  const rollupLabel = getRollupRowLabel(config, localization.language, localization.countryIso3);
  return {
    ...base,
    ...Object.fromEntries(ROLLUP_PIN_IDS.map((id) => [id, rollupLabel])),
  };
}

// The roll-up row's label, from getRollupLabelContext (shared with the editor
// checkbox). Scope words, not operation words ("Total" would imply SUM, but
// the row can be an AVG or a recomputed ratio): "National", "{Area} — All
// areas" for a pinned parent, "All facilities" for a facility dimension.
// Filters never change the label — see getRollupLabelContextForDimension.
function getRollupRowLabel(config: PresentationObjectConfig, language: Language, countryIso3: string | undefined): string {
  const ctx = getRollupLabelContext(config);
  if (ctx?.kind === "pinned" && ctx.value) {
    return `${resolveAdminAreaLabel(ctx.value, countryIso3)} — ${pickLang(language, { en: "All areas", fr: "Toutes les zones" })}`;
  }
  if (ctx?.kind === "all_facilities") {
    return pickLang(language, { en: "All facilities", fr: "Tous les établissements", pt: "Todos os estabelecimentos" });
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
  return getRollupPosition(config) === "top"
    ? { base: "by-label", first: ROLLUP_PIN_IDS }
    : { base: "by-label", last: ROLLUP_PIN_IDS };
}

// Pin-only sort for the chart indicator axis under sortIndicatorValues "none":
// preserves the axis's data order (panther applies no base sort within the
// unpinned bucket; stable sort keeps existing order) and only moves the
// sentinel to the configured end.
function getRollupPinOnlySort(config: PresentationObjectConfig): HeaderSortConfig {
  return getRollupPosition(config) === "top"
    ? { first: ROLLUP_PIN_IDS }
    : { last: ROLLUP_PIN_IDS };
}

// Period axes are ordered chronologically, always — never by display label, and
// never by an indicator `byIdOrder`. Both of the sorts this overrides get a
// period axis wrong:
//   - "by-label" compares the text getDateLabelReplacements produced, so a
//     month axis reads Apr, Feb, Jan, Jun.
//   - { byIdOrder: indicatorIds } (the scorecard order, applied to every axis)
//     matches no period id, so every header ties at POSITIVE_INFINITY and falls
//     through to sortByIdOrder's localeCompare(label) tie-break — identically
//     alphabetical.
//
// The order is a RULE, not an id list derived from the rows. Stored figures are
// FigureBundles rebuilt through buildFigureInputs at every render (nothing
// persists a sort config any more — the legacy stored figureInputs were
// converted away by data_transforms/_figure_block.ts), so a derived order would
// not go stale. It is simply worse: it rescans every row on each build, and it
// is only correct for the periods that happened to be present. A rule is
// total — and declarative, so it survives the structuredClone in the export
// path, same as getRollupAwareSort.
//
// Every period id is FIXED-WIDTH, so panther's "by-id" string compare is
// already chronological and no per-dimension order list is needed:
//
//   period_id   6-digit YYYYMM     quarter_id  5-digit YYYYQ
//   year        4-digit YYYY       month       2-digit, ZERO-PADDED "01".."12"
//
// `month` is zero-padded because it is derived, not stored:
// PERIOD_COLUMN_EXPRESSIONS.month is `LPAD((period_id % 100)::text, 2, '0')`
// (server_only_funcs_presentation_objects/period_helpers.ts — the single source;
// run_module_iterator excludes any physical `month` column from RO tables). Do
// not "fix" this to an explicit 1..12 order list: those ids do not exist, and
// such a list matches only "10".."12", pinning Q4 to the front and dropping
// "01".."09" onto the very label tie-break this code exists to avoid. The
// comment in get_date_label_replacements.ts claiming values are 1-12 is wrong;
// it is harmless only because that path uses parseInt.
function getPeriodAxisSort(prop: string | undefined): HeaderSortConfig | undefined {
  return prop !== undefined && PERIOD_DISAGGREGATION_OPTIONS.has(prop)
    ? "by-id"
    : undefined;
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

  const seriesProp =
    getDisaggregatorDisplayProp(resultsValue, config, ["series"], effectiveValueProps) ?? "--v";
  const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"], effectiveValueProps);
  const laneProp = getDisaggregatorDisplayProp(resultsValue, config, ["col", "colGroup"], effectiveValueProps);
  const tierProp = getDisaggregatorDisplayProp(resultsValue, config, ["row", "rowGroup"], effectiveValueProps);

  const axisSort = (prop: string | undefined): HeaderSortConfig =>
    getPeriodAxisSort(prop) ?? getRollupAwareSort(config);

  return {
    valueProps: effectiveValueProps,
    periodProp: config.d.timeseriesGrouping,
    periodType,
    seriesProp,
    paneProp,
    laneProp,
    tierProp,
    sort: {
      series: axisSort(seriesProp),
      lane: axisSort(laneProp),
      tier: axisSort(tierProp),
      pane: axisSort(paneProp),
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

  // Only force the value-prop axis onto columns when there's more than one value
  // prop to differentiate — otherwise this created a column header even when the
  // user configured no col/row disaggregator at all.
  const colProp =
    getDisaggregatorDisplayProp(resultsValue, config, ["col"], effectiveValueProps) ??
    (effectiveValueProps.length > 1 ? "--v" : undefined);
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

  // Pin the roll-up sentinel on whichever table axis carries the rolled-up
  // dimension — `byIdOrder` can't also carry first/last, so the rolled axis
  // uses the pinned sort while other axes keep `tableSort`. On other axes the
  // pins would be no-ops anyway; restricting to the rolled axis avoids
  // clobbering an indicator axis's `byIdOrder`. The rolled axis is never the
  // indicator axis (indicator dims are not roll-up dimensions).
  const rollupAxis = getTableRollupAxis(config);
  // An axis with no prop does not exist, so it gets NO sort — not a default
  // one. This is load-bearing, not tidiness: panther's
  // promoteGroupPropIfNoItemProp collapses a group axis that has no item axis
  // and carries `itemSort ?? groupSort`, so supplying a sort for the absent
  // item axis would discard the group's own sort. That is exactly how a period
  // dimension placed on rowGroup/colGroup alone kept sorting alphabetically.
  const axisSort = (
    axis: "row" | "rowGroup" | "col" | "colGroup",
    prop: string | undefined,
  ): HeaderSortConfig | undefined =>
    prop === undefined ? undefined : getPeriodAxisSort(prop) ??
      (axis === rollupAxis ? getRollupAwareSort(config) : tableSort);

  // No eligibility check: the server only emits __n_* for HFA facility-level
  // fetches, and panther drops the matrix when nothing resolves. Stored figures
  // from before the feature therefore render exactly as they did.
  const nProps = config.s.showNValues
    ? Object.fromEntries(
        effectiveValueProps.map((prop) => [prop, sampleNProp(prop)]),
      )
    : undefined;

  return {
    valueProps: effectiveValueProps,
    colProp,
    rowProp,
    colGroupProp,
    rowGroupProp,
    nProps,
    sort: {
      colGroup: axisSort("colGroup", colGroupProp),
      col: axisSort("col", colProp),
      rowGroup: axisSort("rowGroup", rowGroupProp),
      row: axisSort("row", rowProp),
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

// The table axis (row/rowGroup/col/colGroup) displaying the rolled-up
// dimension — i.e. where the roll-up sentinel row appears — or undefined if
// none.
function getTableRollupAxis(
  config: PresentationObjectConfig,
): "row" | "rowGroup" | "col" | "colGroup" | undefined {
  const dim = getRollupDimension(config);
  // Match the FLAGGED entry, not just the disOpt — stored data may carry
  // duplicate disOpt entries on different axes, and the sentinel appears on
  // the flagged one's axis.
  const displayOpt = dim
    ? config.d.disaggregateBy.find(
        (d) => d.disOpt === dim && d.rollup === true,
      )?.disDisplayOpt
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
  // valueProps order). So when the rolled-up dimension sits on this axis and
  // the user hasn't chosen a value sort, we pass undefined + a PIN-ONLY sort:
  // data order is preserved exactly, only the sentinel moves to the chosen end.
  // With asc/desc value sorting, the total bar participates in value order.
  const rollupOnIndicatorAxis =
    isRollupActive(config) &&
    config.d.disaggregateBy.find(
      (d) => d.disOpt === getRollupDimension(config) && d.rollup === true,
    )?.disDisplayOpt === "indicator";
  const pinIndicatorAxis =
    rollupOnIndicatorAxis && config.s.sortIndicatorValues === "none";

  // A PERIOD dimension on the bars axis is the one case where data order is not
  // acceptable under "none": the chronological rule is total (see
  // getPeriodAxisSort), and the items query has no ORDER BY, so data order is
  // arbitrary Postgres aggregate output. Pass sortIndicatorValues: undefined so
  // panther honours sort.indicator, and sort "by-id". Mutually exclusive with
  // pinIndicatorAxis: roll-up dimensions are admin levels + facility columns,
  // never a period dim. "ascending"/"descending" (an explicit user choice of
  // value ranking) still override chronology — the guard applies under "none"
  // only. Non-period dims keep data order under "none" as before; a defined
  // natural order for those axes is tim-branch work (Q1 in the hotfix plan).
  const periodIndicatorSort =
    config.s.sortIndicatorValues === "none"
      ? getPeriodAxisSort(indicatorProp)
      : undefined;

  const axisSort = (prop: string | undefined): HeaderSortConfig =>
    getPeriodAxisSort(prop) ?? getRollupAwareSort(config);

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
        : periodIndicatorSort ?? getChartIndicatorSort(config),
      series: axisSort(seriesProp),
      lane: axisSort(laneProp),
      tier: axisSort(tierProp),
      pane: axisSort(paneProp),
    },
    sortIndicatorValues: pinIndicatorAxis || periodIndicatorSort
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
  return {
    ...getChartJsonDataConfig(resultsValue, config, effectiveValueProps, indicatorLabelReplacements, localization, jsonArray),
    membership: { indicator: "unbalanced", lane: "unbalanced" },
    proportional: { bands: true, panes: true },
  };
}

export function getChartOHJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  localization: FigureLocalization,
  jsonArray?: any[],
): ChartOHJsonDataConfig {
  return {
    ...getChartJsonDataConfig(resultsValue, config, effectiveValueProps, indicatorLabelReplacements, localization, jsonArray),
    membership: { indicator: "unbalanced", tier: "unbalanced" },
    proportional: { bands: true, panes: true },
  };
}
