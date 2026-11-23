import { getPeriodIdFromTime, getTimeFromPeriodId } from "@timroberton/panther";
import {
  getLastFullQuarterBounds,
  getLastFullYearBounds,
  reAnchorToFormat,
} from "../get_fetch_config_from_po.ts";
import {
  isRollupEligibleResultsValue,
  type RollupDimension,
  type RollupEligibilityInputs,
} from "../rollup.ts";
import type { APIResponseWithData } from "../types/instance.ts";
import type { ResultsValue } from "../types/modules.ts";
import type {
  GenericLongFormFetchConfig,
  PeriodBounds,
} from "../types/presentation_objects.ts";
import { FILTER_ONLY_DISAGGREGATION_OPTIONS } from "../types/disaggregation_options.ts";
import { inferPeriodFormatFromValue } from "../types/period_options.ts";
import {
  type AxisSlot,
  type Dim,
  type FigureConfigBody,
  type FigurePeriodFilter,
  type FigureReplicant,
  type FigureRollup,
  rollupOfLayout,
  shownValueProps,
  slotEntries,
  VALUE_PROPS,
} from "./schema.ts";
import type { FigureMetric } from "./validate.ts";

// What a config means: the rows its query reads and how they are laid out.
// Pure functions of the config, and of the metric or the rows where a
// derivation needs them.

// The validator's metric is written out apart from the app's metric type, so
// that a module build can run it. The app's metric must remain one.
const _resultsValueIsFigureMetric: ResultsValue extends FigureMetric ? true
  : false = true;

export function isFilteredToOneValue(
  config: FigureConfigBody,
  dim: Dim,
): boolean {
  return config.data.filters.find((f) => f.dim === dim)?.values.length === 1;
}

// The replicant, unless a filter holds its dimension to one value, which makes
// it a filter.
export function effectiveReplicant(
  config: FigureConfigBody,
): FigureReplicant | undefined {
  const replicant = config.layout.replicant;
  return replicant === undefined || isFilteredToOneValue(config, replicant.dim)
    ? undefined
    : replicant;
}

// The roll-up, unless a filter holds its dimension to one value, which closes
// it.
export function openRollup(config: FigureConfigBody): FigureRollup | undefined {
  const rollup = rollupOfLayout(config);
  return rollup === undefined || isFilteredToOneValue(config, rollup.dim)
    ? undefined
    : rollup;
}

// The dimension the query totals: the open roll-up, on a metric whose values
// can be re-aggregated.
export function effectiveRollupDim(
  config: FigureConfigBody,
  metric: RollupEligibilityInputs,
): RollupDimension | undefined {
  return isRollupEligibleResultsValue(metric)
    ? openRollup(config)?.dim
    : undefined;
}

// What the query groups by: every dimension on a slot, the replicant, and
// every dimension filtered to exactly one value. A filter-only dimension is
// never grouped by.
export function groupedDims(config: FigureConfigBody): Dim[] {
  const out: Dim[] = [];
  const add = (dim: Dim) => {
    if (!out.includes(dim) && !FILTER_ONLY_DISAGGREGATION_OPTIONS.has(dim)) {
      out.push(dim);
    }
  };
  for (const { holds } of slotEntries(config)) {
    if (holds !== VALUE_PROPS) add(holds);
  }
  const replicant = config.layout.replicant;
  if (replicant !== undefined) add(replicant.dim);
  for (const f of config.data.filters) {
    if (f.values.length === 1) add(f.dim);
  }
  return out;
}

export type AxisProp = Dim | "--v";
export type FigureAxes = Partial<Record<AxisSlot, AxisProp>>;

// What each slot draws. Two or more value props shown are drawn on the slot
// that names them and nowhere else; one shown is drawn on a timeseries'
// `series` or a chart's `indicator` when nothing is laid out there. A
// dimension on a slot is laid out unless a filter holds it to one value or the
// rows hold one of its members (`singleValueDims`); `period` and `mapArea` are
// always laid out, and a chart's `indicator` keeps its dimension while the
// value props are on another slot.
export function figureAxes(
  config: FigureConfigBody,
  shown: readonly string[],
  singleValueDims: ReadonlySet<Dim>,
): FigureAxes {
  const entries = slotEntries(config);
  const multi = shown.length > 1;
  const valuePropsSlot = entries.find((e) => e.holds === VALUE_PROPS)?.slot;
  const indicatorKept = config.type === "chart" && multi &&
    valuePropsSlot !== undefined && valuePropsSlot !== "indicator";
  const axes: FigureAxes = {};
  for (const { slot, holds } of entries) {
    if (holds === VALUE_PROPS) {
      if (multi) axes[slot] = "--v";
      continue;
    }
    const laidOut = slot === "period" || slot === "mapArea" ||
      (slot === "indicator" && indicatorKept) ||
      (!isFilteredToOneValue(config, holds) && !singleValueDims.has(holds));
    if (laidOut) axes[slot] = holds;
  }
  if (shown.length === 1) {
    if (config.type === "timeseries" && axes.series === undefined) {
      axes.series = "--v";
    }
    if (config.type === "chart" && axes.indicator === undefined) {
      axes.indicator = "--v";
    }
  }
  return axes;
}

export type FigureFetchConfig =
  & Omit<GenericLongFormFetchConfig, "periodFilter">
  & { periodFilter: FigurePeriodFilter | undefined };

export type FetchMetric = Pick<
  ResultsValue,
  | "valueProps"
  | "valueFunc"
  | "postAggregationExpression"
  | "catalogExpressionEvaluation"
  | "hasFacilityLevelRows"
>;

// The query a config reads. With `excludeReplicantFilter`, the replicant's
// value is left out, for the read of the replicant's own options.
export function figureFetchConfig(
  config: FigureConfigBody,
  metric: FetchMetric,
  options?: { excludeReplicantFilter?: boolean },
): APIResponseWithData<FigureFetchConfig> {
  const filters = config.data.filters.map((f) => ({
    disOpt: f.dim,
    values: f.values,
  }));
  const replicant = effectiveReplicant(config);
  if (replicant !== undefined && options?.excludeReplicantFilter !== true) {
    filters.push({
      disOpt: replicant.dim,
      values: [replicant.value ?? "UNSELECTED"],
    });
  }
  const shared = {
    groupBys: groupedDims(config),
    filters,
    periodFilter: config.data.periodFilter,
    rollupDim: effectiveRollupDim(config, metric),
  };
  // A catalog-evaluated metric reads its declared ingredients, summed, and the
  // server applies each indicator's own expression, so the value props shown
  // do not narrow it.
  if (metric.catalogExpressionEvaluation) {
    return {
      success: true,
      data: {
        values: metric.catalogExpressionEvaluation.ingredientProps.map((
          prop,
        ) => ({ prop, func: "SUM" as const })),
        postAggregationExpression: undefined,
        ...shared,
      },
    };
  }
  if (metric.postAggregationExpression) {
    return {
      success: true,
      data: {
        values: metric.postAggregationExpression.ingredientValues,
        postAggregationExpression: metric.postAggregationExpression.expression,
        ...shared,
      },
    };
  }
  const values = shownValueProps(config, metric.valueProps).map((prop) => ({
    prop,
    func: metric.valueFunc,
  }));
  if (values.length === 0) {
    return {
      success: false,
      err: `The visualization's value props (${
        (config.data.valueProps ?? []).join(", ")
      }) match none of this metric's values (${metric.valueProps.join(", ")})`,
    };
  }
  return {
    success: true,
    data: { values, postAggregationExpression: undefined, ...shared },
  };
}

// The periods a filter selects, given the bounds of the data. On yearly data
// every filter but a range selects the latest year, and on quarterly data a
// `last` or `lastFull` filter selects all of it.
export function periodFilterBounds(
  filter: FigurePeriodFilter | undefined,
  dataBounds: PeriodBounds | undefined,
): PeriodBounds | undefined {
  if (filter === undefined) return dataBounds;
  if (filter.type === "range") return { min: filter.min, max: filter.max };
  if (dataBounds === undefined) return undefined;
  const grain = inferPeriodFormatFromValue(dataBounds.max);
  if (grain === "year") return { min: dataBounds.max, max: dataBounds.max };
  if (filter.type === "from") {
    return { min: reAnchorToFormat(filter.min, grain), max: dataBounds.max };
  }
  if (grain === "quarter_id") return dataBounds;
  if (filter.type === "last") {
    const time = getTimeFromPeriodId(dataBounds.max, "year-month");
    return {
      min: getPeriodIdFromTime(time - (filter.n - 1), "year-month"),
      max: dataBounds.max,
    };
  }
  const full = filter.unit === "year"
    ? getLastFullYearBounds(dataBounds)
    : getLastFullQuarterBounds(dataBounds);
  const monthsPerUnit = filter.unit === "year" ? 12 : 3;
  const start = getTimeFromPeriodId(full.min, "year-month");
  return {
    min: getPeriodIdFromTime(
      start - (filter.n - 1) * monthsPerUnit,
      "year-month",
    ),
    max: full.max,
  };
}
