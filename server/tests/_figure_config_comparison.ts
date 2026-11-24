import {
  type ConditionalFormatting,
  conditionalFormattingOf,
  type ConversionFailure,
  type ConversionNote,
  convertStoredConfig,
  type DisaggregationDisplayOption,
  type DisaggregationOption,
  effectiveRollupDim,
  figureAxes,
  type FigureConditionalFormatting,
  type FigureConfig,
  type FigureConfigProblem,
  figureConfigSchema,
  figureFetchConfig,
  FILTER_ONLY_DISAGGREGATION_OPTIONS,
  getDisaggregatorDisplayProp,
  getEffectivePOConfig,
  getEffectiveRollupDimension,
  getFetchConfigFromPresentationObjectConfig,
  getPeriodFilterExactBounds,
  getReplicateByProp,
  getRollupPosition,
  isRollupEligibleResultsValue,
  openRollup,
  periodFilterBounds,
  type PresentationObjectConfig,
  type ResultsValue,
  selectCf,
  shownValueProps,
  validateFigureConfig,
} from "lib";

// A stored config converted, checked against the schema and the validator,
// and what today's functions derive from it compared with what the figure
// config's derive from the conversion: the fetch config, the axes, the
// roll-up, the filters, the period bounds and the conditional formatting.
// Shared by the presets test and the read-only sweep of stored figures.

export type Aspect =
  | "values"
  | "groupBys"
  | "filters"
  | "rollup"
  | "axes"
  | "periodBounds"
  | "conditionalFormatting";

// A difference the conversion is meant to make, by its case. The renderer's
// own rules (two or more value props drawn only on their slot, a dimension
// laid out by its members in the rows) are left out of the comparison of
// axes by comparing with today's renderer given no date range, and a figure
// on which today's renderer draws the value props on two axes, which throws.
export type ListedCase =
  | "filteredDimGrouped"
  | "mapFirstValueProp"
  | "valuePropsOnTwoAxesToday"
  | "sharedSlotEffectiveMoved"
  | "timeAxisDimOffSlot";

export type Difference = {
  aspect: Aspect;
  listed: ListedCase | undefined;
  today: string;
  next: string;
};

export type Comparison =
  | { kind: "failed"; failure: ConversionFailure; notes: ConversionNote[] }
  | { kind: "doesNotFit"; issues: string[]; notes: ConversionNote[] }
  | {
    kind: "converted";
    config: FigureConfig;
    notes: ConversionNote[];
    problems: FigureConfigProblem[];
    differences: Difference[];
  };

export type FigureUnderComparison = {
  metric: ResultsValue;
  config: PresentationObjectConfig;
  // The dimensions laid out whose column holds one member in the figure's
  // rows: none for a config with no rows.
  singleValueDims: ReadonlySet<DisaggregationOption>;
};

const MONTHLY_DATA = { min: 201801, max: 202405 };
const YEARLY_DATA = { min: 2015, max: 2023 };

export function compareWithToday(figure: FigureUnderComparison): Comparison {
  const { metric, config, singleValueDims } = figure;
  const yearly = metric.mostGranularTimePeriodColumnInResultsFile === "year";
  const conversion = convertStoredConfig(config, {
    valueProps: metric.valueProps,
    canRollUp: isRollupEligibleResultsValue(metric),
    singleValueDims,
    yearly,
  });
  if (!conversion.ok) {
    return {
      kind: "failed",
      failure: conversion.failure,
      notes: conversion.notes,
    };
  }
  const notes = conversion.notes;
  const parsed = figureConfigSchema.safeParse(conversion.config);
  if (!parsed.success) {
    return {
      kind: "doesNotFit",
      issues: parsed.error.issues.map((i) =>
        `${i.path.join(".")}: ${i.message}`
      ),
      notes,
    };
  }
  const next = parsed.data;
  const differences: Difference[] = [];
  const differ = (
    aspect: Aspect,
    today: unknown,
    nextValue: unknown,
    listed: ListedCase | undefined,
  ) => {
    const a = canonical(today);
    const b = canonical(nextValue);
    if (a !== b) differences.push({ aspect, listed, today: a, next: b });
  };

  const todayFetch = attempt(() =>
    getFetchConfigFromPresentationObjectConfig(metric, config)
  );
  const nextFetch = figureFetchConfig(next, metric);
  const todayData = todayFetch?.success ? todayFetch.data : undefined;
  const nextData = nextFetch.success ? nextFetch.data : undefined;
  differ(
    "values",
    todayData?.values.map((v) => `${v.func}&${v.prop}`).sort(),
    nextData?.values.map((v) => `${v.func}&${v.prop}`).sort(),
    notes.includes("mapFirstValueProp") ? "mapFirstValueProp" : undefined,
  );
  const todayGroups = new Set(todayData?.groupBys ?? []);
  const filteredToOne = config.d.filterBy.filter((f) =>
    f.values.length === 1 && !FILTER_ONLY_DISAGGREGATION_OPTIONS.has(f.disOpt)
  ).map((f) => f.disOpt);
  const nextGroups = [...(nextData?.groupBys ?? [])].sort();
  const withFiltered = [...new Set([...todayGroups, ...filteredToOne])].sort();
  differ(
    "groupBys",
    todayData === undefined ? undefined : [...todayGroups].sort(),
    nextData === undefined ? undefined : nextGroups,
    canonical(withFiltered) === canonical(nextGroups)
      ? "filteredDimGrouped"
      : undefined,
  );
  // A replicant with no value chosen reads "" today and UNSELECTED in the
  // figure config: neither is a member, and the editor writes a value after
  // its first read.
  const replicant = getReplicateByProp(config);
  const todayFilters = (todayData?.filters ?? []).map((f) =>
    f.disOpt === replicant && f.values.length === 1 && f.values[0] === ""
      ? { disOpt: f.disOpt, values: ["UNSELECTED"] }
      : f
  );
  differ(
    "filters",
    canonicalFilters(todayFilters),
    canonicalFilters(nextData?.filters ?? []),
    undefined,
  );
  const todayRollup = getEffectiveRollupDimension(metric, config);
  const nextRollup = effectiveRollupDim(next, metric);
  differ(
    "rollup",
    todayRollup === undefined
      ? undefined
      : [todayRollup, getRollupPosition(config)],
    nextRollup === undefined
      ? undefined
      : [nextRollup, openRollup(next)?.position],
    undefined,
  );
  const dataBounds = yearly ? YEARLY_DATA : MONTHLY_DATA;
  differ(
    "periodBounds",
    attempt(() =>
      getPeriodFilterExactBounds(config.d.periodFilter, dataBounds)
    ),
    periodFilterBounds(next.data.periodFilter, dataBounds),
    undefined,
  );

  const today = todayAxes(config, metric, singleValueDims);
  const valuePropsOnTwoAxes =
    Object.values(today).filter((p) => p === "--v").length > 1;
  differ(
    "axes",
    today,
    figureAxes(next, shownValueProps(next, metric.valueProps), singleValueDims),
    valuePropsOnTwoAxes
      ? "valuePropsOnTwoAxesToday"
      : notes.includes("mapFirstValueProp")
      ? "mapFirstValueProp"
      : notes.includes("sharedSlotEffectiveMoved")
      ? "sharedSlotEffectiveMoved"
      : notes.includes("timeAxisDimOffSlot")
      ? "timeAxisDimOffSlot"
      : undefined,
  );

  const cf = conditionalFormattingOf(next);
  if (cf !== undefined) {
    differ(
      "conditionalFormatting",
      selectCf(config.s),
      todayFormOfConditionalFormatting(cf),
      undefined,
    );
  }
  return {
    kind: "converted",
    config: next,
    notes,
    problems: validateFigureConfig(next, metric),
    differences,
  };
}

function attempt<T>(f: () => T): T | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

// JSON with sorted keys and no undefined members.
export function canonical(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) =>
      v !== null && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
          Object.entries(v).filter(([, x]) => x !== undefined).sort((
            [a],
            [b],
          ) => a < b ? -1 : a > b ? 1 : 0),
        )
        : v,
  ) ?? "undefined";
}

function canonicalFilters(
  filters: { disOpt: string; values: (string | number)[] }[],
): [string, string[]][] {
  return filters
    .map((f): [string, string[]] => [f.disOpt, f.values.map(String).sort()])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// Today's renderer's axes, in the figure config's slot names, given no date
// range.
function todayAxes(
  config: PresentationObjectConfig,
  metric: ResultsValue,
  singleValueDims: ReadonlySet<DisaggregationOption>,
): Record<string, string | undefined> {
  const { config: effective, effectiveValueProps } = getEffectivePOConfig(
    config,
    { valueProps: metric.valueProps, singleValueDims },
  );
  const at = (...props: DisaggregationDisplayOption[]) =>
    getDisaggregatorDisplayProp(metric, effective, props, effectiveValueProps);
  switch (config.d.type) {
    case "timeseries":
      return {
        period: config.d.timeseriesGrouping,
        series: at("series") ?? "--v",
        pane: at("cell"),
        tier: at("row", "rowGroup"),
        lane: at("col", "colGroup"),
      };
    case "table":
      return {
        row: at("row"),
        col: at("col") ?? (effectiveValueProps.length > 1 ? "--v" : undefined),
        rowGroup: at("rowGroup"),
        colGroup: at("colGroup"),
      };
    case "chart":
      return {
        indicator: at("indicator") ?? "--v",
        series: at("series"),
        pane: at("cell"),
        tier: at("row", "rowGroup"),
        lane: at("col", "colGroup"),
      };
    case "map":
      return {
        mapArea: at("mapArea") ?? "admin_area_2",
        pane: at("cell"),
        tier: at("row"),
        lane: at("col"),
      };
    case "pie":
      return {
        series: at("series"),
        indicator: at("indicator"),
        pane: at("cell"),
        tier: at("row"),
        lane: at("col"),
      };
  }
}

// The figure config's conditional formatting as today's union says it, for
// the comparison with `selectCf`.
function todayFormOfConditionalFormatting(
  cf: FigureConditionalFormatting,
): ConditionalFormatting {
  switch (cf.type) {
    case "none":
    case "indicator":
      return cf;
    case "thresholds":
      return {
        type: "thresholds",
        cutoffs: cf.cutoffs,
        buckets: cf.buckets,
        direction: cf.direction,
        noDataColor: cf.noDataColor,
      };
    case "scale":
      return {
        type: "scale",
        scale: "preset" in cf.palette
          ? { palette: cf.palette.preset, reverse: cf.reverse }
          : cf.palette.mid === undefined
          ? { min: cf.palette.from, max: cf.palette.to, reverse: cf.reverse }
          : {
            min: cf.palette.from,
            mid: cf.palette.mid,
            max: cf.palette.to,
            reverse: cf.reverse,
          },
        steps: cf.steps,
        domain: cf.domain === "auto"
          ? { kind: "auto" }
          : { kind: "fixed", min: cf.domain.min, max: cf.domain.max },
        noDataColor: cf.noDataColor,
      };
  }
}
