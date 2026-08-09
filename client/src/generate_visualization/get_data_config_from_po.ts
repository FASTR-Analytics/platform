import {
  ChartOHJsonDataConfig,
  ChartOVJsonDataConfig,
  HeaderSortConfig,
  type Language,
  PieJsonDataConfig,
  TableJsonDataConfig,
  TimeseriesJsonDataConfig,
} from "panther";
import {
  BLANK_SENTINEL,
  BLANK_SENTINEL_LABEL,
  CountryCodes,
  type DisaggregationOption,
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
  type IndicatorFormat,
  isPieCompletionMode,
  isRollupActive,
  PERIOD_DISAGGREGATION_OPTIONS,
  PIE_COMPLETION_TOTAL,
  periodOptionToPeriodType,
  ROLLUP_PIN_IDS,
  sampleNProp,
  TC,
} from "lib";
import { getDateLabelReplacements } from "./get_date_label_replacements";
import { getNigeriaAdminAreaLabelReplacements } from "./format_admin_area_labels";

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

// User-defined order for the dimension occupying an axis
// (config.s.customValueOrder — style layer, never in the fetch config or
// cache hash). "--v" axes carry the module-defined valueProps order and are
// never custom-ordered.
function getCustomOrderForAxis(
  config: PresentationObjectConfig,
  axisProp: DisaggregationOption | "--v" | undefined,
): string[] | undefined {
  if (!axisProp || axisProp === "--v") {
    return undefined;
  }
  const entry = config.s.customValueOrder?.find((o) => o.disOpt === axisProp);
  return entry && entry.orderedIds.length > 0 ? entry.orderedIds : undefined;
}

// Custom order composed with the roll-up pin. `byIdOrder` can't also carry
// first/last, so when the rolled-up dimension sits on this axis the sentinel
// ids are folded into the id order at the pinned end. Unranked ids (values the
// data gained after the user ordered) sink to the end alphabetically — with a
// bottom pin they land below the sentinel, accepted until the user re-orders.
// Duplicate disOpt entries read the same grid column, so a duplicate axis
// carries the sentinel too and the fold pins it there as well — matching the
// pre-custom-order behavior, where getRollupAwareSort pinned on every axis.
function getCustomOrderSort(
  config: PresentationObjectConfig,
  customOrder: string[],
  axisProp: DisaggregationOption | "--v" | undefined,
): HeaderSortConfig {
  if (isRollupActive(config) && getRollupDimension(config) === axisProp) {
    return getRollupPosition(config) === "top"
      ? { byIdOrder: [...ROLLUP_PIN_IDS, ...customOrder] }
      : { byIdOrder: [...customOrder, ...ROLLUP_PIN_IDS] };
  }
  return { byIdOrder: customOrder };
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
// (server_only_funcs_presentation_objects/period_helpers.ts — the single
// source; computeResultsObjectColumnsToExclude drops any physical `month`
// column from results tables). Do
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

// THE axis-sort dispatcher — the one authoritative home for the ordering
// precedence (2026-08-09 ruling, PLAN_AXIS_SORT_DISPATCHER.md). Ordering is a
// property of the dimension, not of the axis; every figure axis routes
// through here. Precedence:
//
//   1. An absent axis gets NO sort. Load-bearing for tables: panther's group
//      promotion carries `itemSort ?? groupSort`, so a sort supplied for an
//      absent item axis would discard the group's own sort.
//   2. "--v" gets NO sort: panther emits value props in declared order, and
//      the module author's declared order IS the natural order of the
//      value-props dimension.
//   3. The user's customValueOrder wins (an explicit choice beats every rule,
//      chronology included), with the roll-up sentinel folded in by
//      getCustomOrderSort. Suppressed in scorecard mode, whose
//      customSortHeaders own whole-table ordering.
//   4. Period dims are chronological, always — see getPeriodAxisSort for why
//      fixed-width ids make plain "by-id" chronological.
//   5. The rolled-up dimension is alphabetical with the sentinel pinned —
//      checked before the scorecard base so a scorecard's rolled axis keeps
//      its pin. Dimension-keyed, so a duplicate disOpt entry on another axis
//      pins there too (it reads the same grid column, sentinel included).
//   6. Scorecard mode: every remaining axis gets the whole-table
//      customSortHeaders byIdOrder. Deliberately a spray, not
//      indicator-axis-only: buildIndicatorSortOrder emits [id, label] pairs
//      so it matches whichever axis carries indicator ids OR labels, and
//      non-matching axes fall into the by-label tie-break.
//   7. indicator_common_id gets the catalog order on whichever axis it
//      occupies. hfa/iceh indicator dims stay by-label — no client-side
//      catalog order exists for them.
//   8. Everything else is alphabetical by displayed label, sentinel-pinned
//      when the roll-up is active (the pins are id-keyed no-ops on axes
//      without sentinel rows).
export function getAxisSort(
  config: PresentationObjectConfig,
  axisProp: DisaggregationOption | "--v" | undefined,
  scorecardSortHeaders?: string[],
): HeaderSortConfig | undefined {
  if (axisProp === undefined || axisProp === "--v") {
    return undefined;
  }
  const customOrder = scorecardSortHeaders
    ? undefined
    : getCustomOrderForAxis(config, axisProp);
  if (customOrder) {
    return getCustomOrderSort(config, customOrder, axisProp);
  }
  const periodSort = getPeriodAxisSort(axisProp);
  if (periodSort) {
    return periodSort;
  }
  if (isRollupActive(config) && getRollupDimension(config) === axisProp) {
    return getRollupAwareSort(config);
  }
  if (scorecardSortHeaders) {
    return { byIdOrder: scorecardSortHeaders };
  }
  if (axisProp === "indicator_common_id") {
    return { byIdOrder: get_INDICATOR_COMMON_IDS_IN_SORT_ORDER() };
  }
  return getRollupAwareSort(config);
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

  const seriesProp = getDisaggregatorDisplayProp(resultsValue, config, ["series"], effectiveValueProps);
  const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"], effectiveValueProps);
  const laneProp = getDisaggregatorDisplayProp(resultsValue, config, ["col", "colGroup"], effectiveValueProps);
  const tierProp = getDisaggregatorDisplayProp(resultsValue, config, ["row", "rowGroup"], effectiveValueProps);

  return {
    valueProps: effectiveValueProps,
    periodProp: config.d.timeseriesGrouping,
    periodType,
    seriesProp: seriesProp ?? "--v",
    paneProp,
    laneProp,
    tierProp,
    sort: {
      series: getAxisSort(config, seriesProp),
      lane: getAxisSort(config, laneProp),
      tier: getAxisSort(config, tierProp),
      pane: getAxisSort(config, paneProp),
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
      colGroup: getAxisSort(config, colGroupProp, customSortHeaders),
      col: getAxisSort(config, colProp, customSortHeaders),
      rowGroup: getAxisSort(config, rowGroupProp, customSortHeaders),
      row: getAxisSort(config, rowProp, customSortHeaders),
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

  const indicatorPropRaw = getDisaggregatorDisplayProp(resultsValue, config, ["indicator"], effectiveValueProps);
  const indicatorProp = indicatorPropRaw ?? "--v";
  const seriesProp = getDisaggregatorDisplayProp(resultsValue, config, ["series"], effectiveValueProps);
  const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"], effectiveValueProps);
  const laneProp = getDisaggregatorDisplayProp(resultsValue, config, ["col", "colGroup"], effectiveValueProps);
  const tierProp = getDisaggregatorDisplayProp(resultsValue, config, ["row", "rowGroup"], effectiveValueProps);

  const dateLabelReplacements = jsonArray
    ? getDateLabelReplacements(jsonArray, [indicatorProp, seriesProp, paneProp, laneProp, tierProp], localization.calendar)
    : {};

  return {
    valueProps: effectiveValueProps,
    indicatorProp,
    seriesProp,
    paneProp,
    laneProp,
    tierProp,
    sort: {
      // The bars axis rides one seam: panther honours sort.indicator only
      // when sortIndicatorValues is undefined. "none" means the dimension's
      // natural order (2026-08-09 ruling), so it maps to undefined + the
      // dispatcher's sort; asc/desc (an explicit value ranking) pass through
      // below and panther ignores sort.indicator entirely.
      indicator: getAxisSort(config, indicatorPropRaw),
      series: getAxisSort(config, seriesProp),
      lane: getAxisSort(config, laneProp),
      tier: getAxisSort(config, tierProp),
      pane: getAxisSort(config, paneProp),
    },
    sortIndicatorValues: config.s.sortIndicatorValues === "none"
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

// Pie: slices are the series axis and `indicator` is the repeat dimension
// (one pie per indicator, tiled inside each sub-chart, costing no
// disaggregation axis); no roll-up (a total slice inside its own parts would
// double the whole — the gate in isRollupCandidateDimension keeps rollup off
// pie, so plain sorts suffice) and no date label replacements (time dims are
// never offered for pie). Slot lookups are single-slot: pie's slot set has no
// group slots and convertVisualizationType remaps rowGroup/colGroup on the way
// in. No "--v" fallback on seriesProp — with values defaulting to "cell", that
// would put "--v" on two axes; an empty Slices slot rendering one full circle
// per pie is the accepted degenerate case, and the normal one in completion
// mode.
//
// `total` is set only in completion mode: panther otherwise defaults to "sum",
// normalizing each pie by its own slice sum.
export function getPieJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
  localization: Pick<FigureLocalization, "language" | "countryIso3">,
  effectiveFormatAs: IndicatorFormat,
  jsonArray?: any[],
): PieJsonDataConfig {
  if (config.d.type !== "pie") {
    throw new Error("Bad config type");
  }
  const seriesProp = getDisaggregatorDisplayProp(resultsValue, config, ["series"], effectiveValueProps);
  const indicatorProp = getDisaggregatorDisplayProp(resultsValue, config, ["indicator"], effectiveValueProps);
  const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"], effectiveValueProps);
  const laneProp = getDisaggregatorDisplayProp(resultsValue, config, ["col"], effectiveValueProps);
  const tierProp = getDisaggregatorDisplayProp(resultsValue, config, ["row"], effectiveValueProps);
  return {
    valueProps: effectiveValueProps,
    seriesProp,
    indicatorProp,
    paneProp,
    laneProp,
    tierProp,
    total: isPieCompletionMode(config, effectiveFormatAs) ? PIE_COMPLETION_TOTAL : undefined,
    sort: {
      // Slices sort applies under "none" only (panther gates sort.series on
      // sortSeriesValues); the Pies repeat axis is always sorted.
      series: getAxisSort(config, seriesProp),
      indicator: getAxisSort(config, indicatorProp),
      pane: getAxisSort(config, paneProp),
      tier: getAxisSort(config, tierProp),
      lane: getAxisSort(config, laneProp),
    },
    sortSeriesValues: config.s.sortIndicatorValues,
    groupSmallSlices: config.s.pieGroupSmallSlices
      ? {
          threshold: config.s.pieGroupSmallSlices,
          label: pickLang(localization.language, { en: "Other", fr: "Autre", pt: "Outro" }),
        }
      : undefined,
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
