import { SPECIAL_CHART_METRICS } from "../special_chart_metrics.ts";
import {
  type DisaggregationOption,
  FILTER_ONLY_DISAGGREGATION_OPTIONS,
  PERIOD_DISAGGREGATION_OPTIONS,
} from "../types/disaggregation_options.ts";
import {
  inferPeriodFormatFromValue,
  type PeriodOption,
} from "../types/period_options.ts";
import {
  isRollupEligibleResultsValue,
  type RollupEligibilityInputs,
} from "../rollup.ts";
import {
  conditionalFormattingOf,
  configAloneProblems,
  type Dim,
  type FigureConfigBody,
  figureConfigShapeSchema,
  type FigureType,
  rollupOfLayout,
  shownValueProps,
  type Slot,
  slotEntries,
  type TimeseriesMode,
  VALUE_PROPS,
} from "./schema.ts";

// One thing the validator finds wrong: its kind and what it names. Two
// configs' problems compare by `problemKey`, so a problem names only what
// makes it the same problem in both: a dimension, a slot, a value prop, a
// mode, or a shape issue's path and code.
export type FigureConfigProblem =
  // The config alone.
  | { kind: "shape"; path: string; code: string }
  | { kind: "onTwoPlaces"; holds: Slot; places: [string, string] }
  | { kind: "rollupOffLayout"; dim: Dim }
  | { kind: "twoFilters"; dim: Dim }
  | { kind: "periodRange" }
  | { kind: "thresholdsBuckets" }
  | { kind: "thresholdsDescend" }
  | { kind: "scaleDomain" }
  // The config and its metric.
  | { kind: "unknownValueProp"; valueProp: string }
  | { kind: "unknownDim"; dim: Dim }
  | { kind: "filterOnlyLaidOut"; dim: Dim }
  | { kind: "dimNotOnType"; dim: Dim }
  | { kind: "valuePropsOnNoSlot" }
  | { kind: "chartIndicatorEmpty" }
  | { kind: "mapValueProps" }
  | { kind: "requiredPooled"; dim: Dim }
  | { kind: "periodFilterOfYearlyData" }
  | { kind: "periodFilterWithoutTime" }
  | { kind: "rollupNotEligible" }
  | { kind: "modeNotOfMetric"; mode: SpecialMode }
  | { kind: "modeSeriesDim"; mode: SpecialMode }
  | { kind: "modeValuePropsSlot"; mode: SpecialMode }
  | { kind: "modeValueProps"; mode: SpecialMode }
  | { kind: "indicatorColoring" };

export type FigureConfigProblemKind = FigureConfigProblem["kind"];
type SpecialMode = Exclude<TimeseriesMode, "standard">;

export function problemKey(problem: FigureConfigProblem): string {
  return JSON.stringify(problem);
}

// What the checks read of a metric. Written out, not picked from the app's
// metric type, so the validator imports only files that import nothing else
// of the app's and a module build can run it; derive.ts checks that the app's
// metric is one.
export type FigureMetric = RollupEligibilityInputs & {
  id: string;
  valueProps: readonly string[];
  formatAs: "percent" | "number" | "indicator";
  disaggregationOptions: readonly {
    value: Dim;
    isRequired: boolean;
    allowedPresentationOptions?: readonly FigureType[];
  }[];
  mostGranularTimePeriodColumnInResultsFile?: PeriodOption;
};

// The band reads its series by position, so it shows exactly these, in order.
export const BAND_VALUE_PROPS = ["observed", "expected", "ppi_lwr", "ppi_upr"];

// THE validator: every problem of a config, stored or draft, on its metric. A
// value that does not fit the shape has only its shape problems, since the
// other checks read a config.
export function validateFigureConfig(
  input: unknown,
  metric: FigureMetric,
): FigureConfigProblem[] {
  const parsed = figureConfigShapeSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      kind: "shape",
      path: issue.path.map(String).join("."),
      code: issue.code,
    }));
  }
  return [
    ...configAloneProblems(parsed.data),
    ...metricProblems(parsed.data, metric),
  ];
}

// The period filter selects exactly one period of the metric's own grain.
function selectsOnePeriod(
  config: FigureConfigBody,
  metric: FigureMetric,
): boolean {
  const pf = config.data.periodFilter;
  const grain = metric.mostGranularTimePeriodColumnInResultsFile;
  if (pf === undefined || grain === undefined) return false;
  switch (pf.type) {
    case "range":
      return pf.min === pf.max && inferPeriodFormatFromValue(pf.min) === grain;
    case "from":
      return false;
    case "last":
      return pf.n === 1 && grain === "period_id";
    case "lastFull":
      return pf.n === 1 &&
        (pf.unit === "year" ? grain === "year" : grain === "quarter_id");
  }
}

// The checks that need the config and its metric.
export function metricProblems(
  config: FigureConfigBody,
  metric: FigureMetric,
): FigureConfigProblem[] {
  const problems: FigureConfigProblem[] = [];
  const options = new Map<
    DisaggregationOption,
    FigureMetric["disaggregationOptions"][number]
  >(
    metric.disaggregationOptions.map((o) => [o.value, o]),
  );
  const entries = slotEntries(config);
  const replicant = config.layout.replicant;
  const type: FigureType = config.type;

  // Every dimension and value prop named is the metric's.
  for (const v of config.data.valueProps ?? []) {
    if (!metric.valueProps.includes(v)) {
      problems.push({ kind: "unknownValueProp", valueProp: v });
    }
  }
  const named = new Set<Dim>([
    ...entries.flatMap((e) => (e.holds === VALUE_PROPS ? [] : [e.holds])),
    ...(replicant === undefined ? [] : [replicant.dim]),
    ...config.data.filters.map((f) => f.dim),
    ...config.style.memberOrder.map((o) => o.dim),
  ]);
  const rollup = rollupOfLayout(config);
  if (rollup !== undefined) named.add(rollup.dim);
  for (const dim of named) {
    if (!options.has(dim)) problems.push({ kind: "unknownDim", dim });
  }

  // Where a dimension may be laid out.
  const laidOut: { place: string; dim: Dim }[] = entries.flatMap((e) =>
    e.holds === VALUE_PROPS ? [] : [{ place: e.slot, dim: e.holds }]
  );
  if (replicant !== undefined) {
    laidOut.push({ place: "replicant", dim: replicant.dim });
  }
  for (const { place, dim } of laidOut) {
    if (FILTER_ONLY_DISAGGREGATION_OPTIONS.has(dim)) {
      problems.push({ kind: "filterOnlyLaidOut", dim });
      continue;
    }
    if (place === "period") continue;
    const allowed = options.get(dim)?.allowedPresentationOptions;
    const timeOffItsAxis = type === "timeseries" &&
      PERIOD_DISAGGREGATION_OPTIONS.has(dim);
    if (timeOffItsAxis || (allowed !== undefined && !allowed.includes(type))) {
      problems.push({ kind: "dimNotOnType", dim });
    }
  }

  // Where the value props are drawn.
  const shown = shownValueProps(config, metric.valueProps);
  const valuePropsSlot = entries.find((e) => e.holds === VALUE_PROPS)?.slot;
  if (type === "map") {
    if (shown.length !== 1) problems.push({ kind: "mapValueProps" });
  } else if (shown.length > 1) {
    if (valuePropsSlot === undefined) {
      problems.push({ kind: "valuePropsOnNoSlot" });
    } else if (
      config.type === "chart" && valuePropsSlot !== "indicator" &&
      config.layout.indicator === undefined
    ) {
      problems.push({ kind: "chartIndicatorEmpty" });
    }
  }

  // A required dimension is never pooled.
  const held = new Set<Dim>(laidOut.map((l) => l.dim));
  for (const f of config.data.filters) {
    if (f.values.length === 1) held.add(f.dim);
  }
  const onePeriod = selectsOnePeriod(config, metric);
  for (const o of metric.disaggregationOptions) {
    if (!o.isRequired || held.has(o.value)) continue;
    if (PERIOD_DISAGGREGATION_OPTIONS.has(o.value) && onePeriod) continue;
    problems.push({ kind: "requiredPooled", dim: o.value });
  }

  // The period filter the metric's grain takes.
  const pf = config.data.periodFilter;
  const grain = metric.mostGranularTimePeriodColumnInResultsFile;
  if (pf !== undefined && grain === undefined) {
    problems.push({ kind: "periodFilterWithoutTime" });
  }
  if (pf !== undefined && grain === "year") {
    const rangeOfYears = pf.type === "range" &&
      inferPeriodFormatFromValue(pf.min) === "year";
    const latestYear = pf.type === "lastFull" && pf.unit === "year" &&
      pf.n === 1;
    if (!rangeOfYears && !latestYear) {
      problems.push({ kind: "periodFilterOfYearlyData" });
    }
  }

  if (rollup !== undefined && !isRollupEligibleResultsValue(metric)) {
    problems.push({ kind: "rollupNotEligible" });
  }

  // The special timeseries modes.
  if (config.type === "timeseries" && config.style.mode !== "standard") {
    const mode = config.style.mode;
    if (!SPECIAL_CHART_METRICS[mode].includes(metric.id)) {
      problems.push({ kind: "modeNotOfMetric", mode });
    }
    if (mode !== "percentChange") {
      const series = config.layout.series;
      if (series !== undefined && series !== VALUE_PROPS) {
        problems.push({ kind: "modeSeriesDim", mode });
      }
      if (
        shown.length > 1 && valuePropsSlot !== undefined &&
        valuePropsSlot !== "series"
      ) {
        problems.push({ kind: "modeValuePropsSlot", mode });
      }
    }
    if (mode === "disruptions" && shown.length < 2) {
      problems.push({ kind: "modeValueProps", mode });
    }
    if (
      mode === "disruptionsBand" &&
      (shown.length !== BAND_VALUE_PROPS.length ||
        BAND_VALUE_PROPS.some((p, i) => shown[i] !== p))
    ) {
      problems.push({ kind: "modeValueProps", mode });
    }
  }

  if (
    conditionalFormattingOf(config)?.type === "indicator" &&
    metric.formatAs !== "indicator"
  ) {
    problems.push({ kind: "indicatorColoring" });
  }
  return problems;
}
