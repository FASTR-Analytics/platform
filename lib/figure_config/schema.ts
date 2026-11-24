import { z } from "zod";
import {
  zColorKeyOrHex,
  zContinuousPaletteName,
  zHexColor,
  zLongTableFilter,
  zMapDataLabelMode,
  zMapProjection,
  zNColsOrAuto,
  zPeriodFilter,
  zValueSort,
} from "@timroberton/panther";
import { ADMIN_LEVELS, ROLLUP_DIMENSIONS, ROLLUP_PIN_IDS } from "../rollup.ts";
import {
  ALL_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
} from "../types/disaggregation_options.ts";
import { inferPeriodFormatFromValue } from "../types/period_options.ts";
import type { FigureConfigProblem } from "./validate.ts";

// The figure config: the one description of a figure. `type` decides every
// other part: `data` is which rows are read, `layout` where each dimension
// goes (one thing per slot), `style` how it is drawn (each type and timeseries
// mode holds the fields its drawing reads and no others), `text` the three
// texts drawn around it. Every object is closed.

export const FIGURE_TYPES = [
  "table",
  "timeseries",
  "chart",
  "map",
  "pie",
] as const;
export type FigureType = (typeof FIGURE_TYPES)[number];

// What a slot holds when the value props are laid out there. They take it only
// while two or more are shown; with one shown the slot counts as free.
export const VALUE_PROPS = "valueProps";

// The slots of each type that take a dimension or the value props, in the
// order a dimension is given the first free one. A timeseries also has
// `period` and a map `mapArea`, which take a dimension only.
export const LAYOUT_SLOTS = {
  table: ["row", "col", "rowGroup", "colGroup"],
  timeseries: ["series", "pane", "tier", "lane"],
  chart: ["indicator", "series", "pane", "tier", "lane"],
  map: ["pane", "tier", "lane"],
  pie: ["series", "indicator", "pane", "tier", "lane"],
} as const satisfies Record<FigureType, readonly string[]>;
export type LayoutSlot = (typeof LAYOUT_SLOTS)[FigureType][number];
export type AxisSlot = LayoutSlot | "period" | "mapArea";

export const PERIOD_AXIS_DIMS = ["period_id", "quarter_id", "year"] as const;
export type PeriodAxisDim = (typeof PERIOD_AXIS_DIMS)[number];

const zDim = z.enum(ALL_DISAGGREGATION_OPTIONS);
const zSlot = z.union([z.literal(VALUE_PROPS), zDim]);

const [zRange, zFrom, zLast, zLastFull] = zPeriodFilter.options;
// Panther's four shapes, narrowed to what the query engine resolves.
const zFigurePeriodFilter = z.union([
  zRange,
  zFrom,
  zLast.extend({ n: z.int().min(1).max(24), unit: z.literal("month") }),
  zLastFull.extend({ n: z.int().min(1).max(20), unit: z.literal("quarter") }),
  zLastFull.extend({ n: z.int().min(1).max(10), unit: z.literal("year") }),
]);

const zData = z.strictObject({
  // Absent: every value prop of the metric.
  valueProps: z.array(z.string()).min(1).optional(),
  filters: z.array(
    zLongTableFilter.extend({
      dim: zDim,
      values: zLongTableFilter.shape.values.min(1),
    }),
  ),
  periodFilter: zFigurePeriodFilter.optional(),
});

// One value of the dimension is shown at a time. The value is absent until one
// is chosen, since a preset cannot know an instance's members.
const zReplicant = z.strictObject({
  dim: zDim,
  value: z.string().min(1).optional(),
});

// A total row or series over a dimension laid out on a slot.
const zRollup = z.strictObject({
  dim: z.enum(ROLLUP_DIMENSIONS),
  position: z.enum(["top", "bottom"]),
});

// A person's own order for a dimension's members; members not listed follow.
// Roll-up sentinels are refused: panther's rank map is last-wins on
// duplicates, so a sentinel listed here would defeat the roll-up's pin.
const zMemberOrder = z.array(
  z.strictObject({
    dim: zDim,
    memberIds: z.array(
      z.string().refine((id) => !ROLLUP_PIN_IDS.includes(id), {
        message: "Roll-up sentinel ids are not orderable",
      }),
    ),
  }),
);

const zDecimalPlaces = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const zSeriesColors = z.union([
  z.enum([
    "pastel-discrete",
    "alt-discrete",
    "red-green",
    "blue-green",
    "single-grey",
  ]),
  z.strictObject({ custom: z.array(zHexColor).min(1) }),
]);

// The slot whose members the series colours follow.
const zColorBy = z.enum(["series", "pane", "tier", "lane"]);

const zConditionalFormatting = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("none") }),
  // Each indicator's own rule, from the catalog.
  z.strictObject({ type: z.literal("indicator") }),
  z.strictObject({
    type: z.literal("thresholds"),
    // In stored units (a percent is 0 to 1), ascending.
    cutoffs: z.array(z.number()),
    // Absent label: the legend prints the range the cutoffs give.
    buckets: z.array(
      z.strictObject({
        color: zColorKeyOrHex,
        label: z.string().min(1).optional(),
      }),
    ),
    // Which side of a cutoff a value equal to it falls on.
    direction: z.enum(["higher-is-better", "lower-is-better"]),
    noDataColor: zHexColor.optional(),
  }),
  z.strictObject({
    type: z.literal("scale"),
    palette: z.union([
      z.strictObject({ preset: zContinuousPaletteName }),
      z.strictObject({
        from: zHexColor,
        mid: zHexColor.optional(),
        to: zHexColor,
      }),
    ]),
    reverse: z.boolean(),
    // Absent: a continuous scale.
    steps: z.int().min(2).optional(),
    domain: z.union([
      z.literal("auto"),
      z.strictObject({ min: z.number(), max: z.number() }),
    ]),
    noDataColor: zHexColor.optional(),
  }),
]);

const zCommon = {
  decimalPlaces: zDecimalPlaces,
  paneColumns: zNColsOrAuto,
  memberOrder: zMemberOrder,
};

const zValueAxis = {
  valueAxisMaxAt100Percent: z.boolean(),
  valueAxisMinAuto: z.boolean(),
  valueAxisLimitsPerTierOrLane: z.boolean(),
};

const zTableStyle = z.strictObject({
  allowVerticalColHeaders: z.boolean(),
  // "(n=55)" in column headers, where the rows carry sample sizes.
  showSampleSizes: z.boolean(),
  hideLegend: z.boolean(),
  conditionalFormatting: zConditionalFormatting,
  decimalPlaces: zDecimalPlaces,
  memberOrder: zMemberOrder,
});

const zTimeseriesStyle = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("standard"),
    marks: z.enum(["bars", "lines", "lines-points", "lines-area"]),
    stacked: z.boolean(),
    seriesColors: zSeriesColors,
    colorBy: zColorBy,
    conditionalFormatting: zConditionalFormatting,
    showDataLabels: z.boolean(),
    hideLegend: z.boolean(),
    ...zCommon,
    ...zValueAxis,
  }),
  // Survey, projected and HMIS coverage lines.
  z.strictObject({
    mode: z.literal("coverage"),
    valueAxisMaxAt100Percent: z.boolean(),
    valueAxisMinAuto: z.boolean(),
    paneColumns: zNColsOrAuto,
    memberOrder: zMemberOrder,
  }),
  // Bars coloured by their change from the period before.
  z.strictObject({
    mode: z.literal("percentChange"),
    // A change beyond this fraction is coloured.
    threshold: z.number().min(0),
    invertColors: z.boolean(),
    showDataLabels: z.boolean(),
    labelOnlyBeyondThreshold: z.boolean(),
    seriesColors: zSeriesColors,
    colorBy: zColorBy,
    ...zCommon,
    ...zValueAxis,
  }),
  // Actual against expected, the gap shaded.
  z.strictObject({
    mode: z.literal("disruptions"),
    invertColors: z.boolean(),
    showDataLabels: z.boolean(),
    ...zCommon,
    ...zValueAxis,
  }),
  // Observed against expected, with its interval as a band.
  z.strictObject({
    mode: z.literal("disruptionsBand"),
    invertColors: z.boolean(),
    showDataLabels: z.boolean(),
    ...zCommon,
    ...zValueAxis,
  }),
]);

const zChartStyle = z.strictObject({
  marks: z.enum([
    "bars",
    "lines",
    "lines-points",
    "lines-area",
    "points",
    "points-connectors",
  ]),
  stacked: z.boolean(),
  orientation: z.enum(["vertical", "horizontal"]),
  verticalTickLabels: z.boolean(),
  sortByValue: zValueSort,
  seriesColors: zSeriesColors,
  colorBy: zColorBy,
  conditionalFormatting: zConditionalFormatting,
  showDataLabels: z.boolean(),
  hideLegend: z.boolean(),
  ...zCommon,
  ...zValueAxis,
});

const zMapStyle = z.strictObject({
  projection: zMapProjection,
  conditionalFormatting: zConditionalFormatting,
  showMapAreaLabels: z.boolean(),
  showDataLabels: z.boolean(),
  labelPlacement: zMapDataLabelMode.exclude(["none"]),
  hideLegend: z.boolean(),
  ...zCommon,
});

const zPieStyle = z.strictObject({
  shape: z.enum(["pie", "doughnut"]),
  // In a doughnut's hole.
  showCenterValue: z.boolean(),
  // Each value drawn as its share of 100%. Percent values only.
  valueAgainst100Percent: z.boolean(),
  sortByValue: zValueSort,
  // Slices under this share of the whole are grouped. 0: none.
  groupSlicesBelow: z.number().min(0).max(0.2),
  seriesColors: zSeriesColors,
  showDataLabels: z.boolean(),
  hideLegend: z.boolean(),
  ...zCommon,
});

const zTranslatedText = z.strictObject({
  en: z.string(),
  fr: z.string(),
  pt: z.string().optional(),
});

// The figure config with `text` of one kind: a plain string in a stored
// figure, a translated string in a preset. DATE_RANGE in a text is replaced by
// the period shown, REPLICANT by the replicant's value.
function makeFigureConfigShape<T extends z.ZodType>(zText: T) {
  const text = z.strictObject({
    title: zText,
    subtitle: zText,
    footnote: zText,
  });
  const chartSlots = {
    series: zSlot.optional(),
    pane: zSlot.optional(),
    tier: zSlot.optional(),
    lane: zSlot.optional(),
  };
  return z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("table"),
      data: zData,
      layout: z.strictObject({
        row: zSlot.optional(),
        col: zSlot.optional(),
        rowGroup: zSlot.optional(),
        colGroup: zSlot.optional(),
        replicant: zReplicant.optional(),
        rollup: zRollup.optional(),
      }),
      style: zTableStyle,
      text,
    }),
    z.strictObject({
      type: z.literal("timeseries"),
      data: zData,
      layout: z.strictObject({
        // The time axis.
        period: z.enum(PERIOD_AXIS_DIMS),
        ...chartSlots,
        replicant: zReplicant.optional(),
        rollup: zRollup.optional(),
      }),
      style: zTimeseriesStyle,
      text,
    }),
    z.strictObject({
      type: z.literal("chart"),
      data: zData,
      layout: z.strictObject({
        // The category axis.
        indicator: zSlot.optional(),
        ...chartSlots,
        replicant: zReplicant.optional(),
        rollup: zRollup.optional(),
      }),
      style: zChartStyle,
      text,
    }),
    z.strictObject({
      type: z.literal("map"),
      data: zData,
      layout: z.strictObject({
        // The dimension matched to the boundaries.
        mapArea: z.enum(ADMIN_LEVELS),
        // A map draws one value prop, so its slots take a dimension only.
        pane: zDim.optional(),
        tier: zDim.optional(),
        lane: zDim.optional(),
        replicant: zReplicant.optional(),
      }),
      style: zMapStyle,
      text,
    }),
    z.strictObject({
      type: z.literal("pie"),
      data: zData,
      layout: z.strictObject({
        // The slices.
        series: zSlot.optional(),
        // One pie per member.
        indicator: zSlot.optional(),
        pane: zSlot.optional(),
        tier: zSlot.optional(),
        lane: zSlot.optional(),
        replicant: zReplicant.optional(),
      }),
      style: zPieStyle,
      text,
    }),
  ]);
}

function withConfigAloneChecks<S extends z.ZodType<FigureConfigBody>>(
  shape: S,
) {
  return shape.superRefine((config, ctx) => {
    for (const problem of configAloneProblems(config)) {
      ctx.addIssue({ code: "custom", message: problem.kind, params: problem });
    }
  });
}

// Without the config-alone checks, for the validator, which reads them as
// problems rather than as parse issues.
export const figureConfigShapeSchema = makeFigureConfigShape(z.string());
export const figureConfigSchema = withConfigAloneChecks(
  figureConfigShapeSchema,
);
export const figureConfigPresetSchema = withConfigAloneChecks(
  makeFigureConfigShape(zTranslatedText),
);

export type FigureConfig = z.infer<typeof figureConfigShapeSchema>;
export type FigureConfigPreset = z.infer<typeof figureConfigPresetSchema>;
export type FigureText<T = string> = { title: T; subtitle: T; footnote: T };

type WithoutText<C> = C extends unknown ? Omit<C, "text"> : never;
// A config of either kind: everything the checks and the derivations read.
export type FigureConfigBody = WithoutText<FigureConfig>;

export type Dim = DisaggregationOption;
export type Slot = Dim | typeof VALUE_PROPS;
export type FigureData = FigureConfig["data"];
export type FigurePeriodFilter = NonNullable<FigureData["periodFilter"]>;
export type FigureFilter = FigureData["filters"][number];
export type FigureReplicant = z.infer<typeof zReplicant>;
export type FigureRollup = z.infer<typeof zRollup>;
export type FigureMemberOrder = z.infer<typeof zMemberOrder>;
export type FigureConditionalFormatting = z.infer<
  typeof zConditionalFormatting
>;
export type FigureSeriesColors = z.infer<typeof zSeriesColors>;
export type TimeseriesMode = z.infer<typeof zTimeseriesStyle>["mode"];

export type SlotEntry = { slot: AxisSlot; holds: Slot };

// Every slot the config fills, `period` and `mapArea` included, in the type's
// slot order.
export function slotEntries(config: FigureConfigBody): SlotEntry[] {
  const layout: Partial<Record<LayoutSlot, Slot>> = config.layout;
  const out: SlotEntry[] = [];
  if (config.type === "timeseries") {
    out.push({ slot: "period", holds: config.layout.period });
  }
  if (config.type === "map") {
    out.push({ slot: "mapArea", holds: config.layout.mapArea });
  }
  for (const slot of LAYOUT_SLOTS[config.type]) {
    const holds = layout[slot];
    if (holds !== undefined) out.push({ slot, holds });
  }
  return out;
}

// A map and a pie have no roll-up.
export function rollupOfLayout(
  config: FigureConfigBody,
): FigureRollup | undefined {
  return config.type === "map" || config.type === "pie"
    ? undefined
    : config.layout.rollup;
}

// The value props the figure shows, in the metric's order.
export function shownValueProps(
  config: FigureConfigBody,
  metricValueProps: readonly string[],
): string[] {
  const named = config.data.valueProps;
  return named === undefined
    ? [...metricValueProps]
    : metricValueProps.filter((v) => named.includes(v));
}

export function conditionalFormattingOf(
  config: FigureConfigBody,
): FigureConditionalFormatting | undefined {
  const style = config.style;
  return "conditionalFormatting" in style
    ? style.conditionalFormatting
    : undefined;
}

// The checks that need the config alone. They run inside the schema, so
// wherever a config is parsed.
export function configAloneProblems(
  config: FigureConfigBody,
): FigureConfigProblem[] {
  const problems: FigureConfigProblem[] = [];
  const placed = new Map<Slot, string>();
  const places = (holds: Slot, place: string) => {
    const prior = placed.get(holds);
    if (prior !== undefined) {
      problems.push({ kind: "onTwoPlaces", holds, places: [prior, place] });
    } else {
      placed.set(holds, place);
    }
  };
  for (const { slot, holds } of slotEntries(config)) places(holds, slot);
  const replicant = config.layout.replicant;
  if (replicant !== undefined) places(replicant.dim, "replicant");

  const rollup = rollupOfLayout(config);
  if (
    rollup !== undefined &&
    !slotEntries(config).some((e) => e.holds === rollup.dim)
  ) {
    problems.push({ kind: "rollupOffLayout", dim: rollup.dim });
  }

  const filtered = new Set<Dim>();
  for (const f of config.data.filters) {
    if (filtered.has(f.dim)) problems.push({ kind: "twoFilters", dim: f.dim });
    filtered.add(f.dim);
  }

  const pf = config.data.periodFilter;
  if (pf?.type === "range") {
    const min = inferPeriodFormatFromValue(pf.min);
    const max = inferPeriodFormatFromValue(pf.max);
    if (min === undefined || min !== max || pf.min > pf.max) {
      problems.push({ kind: "periodRange" });
    }
  }
  if (pf?.type === "from" && inferPeriodFormatFromValue(pf.min) === undefined) {
    problems.push({ kind: "periodRange" });
  }

  const cf = conditionalFormattingOf(config);
  if (cf?.type === "thresholds") {
    if (cf.buckets.length !== cf.cutoffs.length + 1) {
      problems.push({ kind: "thresholdsBuckets" });
    }
    if (cf.cutoffs.some((c, i) => i > 0 && cf.cutoffs[i - 1] > c)) {
      problems.push({ kind: "thresholdsDescend" });
    }
  }
  if (cf?.type === "scale" && cf.domain !== "auto") {
    if (cf.domain.min >= cf.domain.max) {
      problems.push({ kind: "scaleDomain" });
    }
  }
  return problems;
}
