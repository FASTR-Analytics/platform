import { ADMIN_LEVELS } from "../rollup.ts";
import {
  FILTER_ONLY_DISAGGREGATION_OPTIONS,
  PERIOD_DISAGGREGATION_OPTIONS,
} from "../types/disaggregation_options.ts";
import {
  type Dim,
  type FigureConditionalFormatting,
  type FigureConfig,
  type FigureType,
  LAYOUT_SLOTS,
  type LayoutSlot,
  type Slot,
  VALUE_PROPS,
} from "./schema.ts";
import type { FigureMetric } from "./validate.ts";

export type StartingMetric = Pick<
  FigureMetric,
  | "valueProps"
  | "formatAs"
  | "disaggregationOptions"
  | "mostGranularTimePeriodColumnInResultsFile"
>;

// Where each type draws two or more value props when nothing says otherwise.
export const OWN_VALUE_PROPS_SLOT: Record<FigureType, LayoutSlot | undefined> =
  {
    timeseries: "series",
    table: "col",
    chart: "indicator",
    pie: "pane",
    map: undefined,
  };

const NO_TEXT = { title: "", subtitle: "", footnote: "" };

// The style a new figure of a type starts with. An "indicator" metric's values
// are each indicator's own quantity, so it colours by each indicator's own
// rule from the start.
export function defaultFigureStyle<T extends FigureType>(
  type: T,
  conditionalFormatting: FigureConditionalFormatting,
): Extract<FigureConfig, { type: T }>["style"];
export function defaultFigureStyle(
  type: FigureType,
  conditionalFormatting: FigureConditionalFormatting,
): FigureConfig["style"] {
  const common = { decimalPlaces: 0 as const, paneColumns: "auto" as const };
  const valueAxis = {
    valueAxisMaxAt100Percent: false,
    valueAxisMinAuto: false,
    valueAxisLimitsPerTierOrLane: true,
  };
  switch (type) {
    case "table":
      return {
        allowVerticalColHeaders: true,
        showSampleSizes: false,
        hideLegend: false,
        conditionalFormatting,
        decimalPlaces: 0,
        memberOrder: [],
      };
    case "timeseries":
      return {
        mode: "standard",
        marks: "lines",
        stacked: false,
        seriesColors: "pastel-discrete",
        colorBy: "series",
        conditionalFormatting,
        showDataLabels: false,
        hideLegend: false,
        ...common,
        memberOrder: [],
        ...valueAxis,
      };
    case "chart":
      return {
        marks: "bars",
        stacked: false,
        orientation: "vertical",
        verticalTickLabels: false,
        sortByValue: "none",
        seriesColors: "pastel-discrete",
        colorBy: "series",
        conditionalFormatting,
        showDataLabels: false,
        hideLegend: false,
        ...common,
        memberOrder: [],
        ...valueAxis,
      };
    case "map":
      return {
        projection: "equirectangular",
        conditionalFormatting,
        showMapAreaLabels: false,
        showDataLabels: false,
        labelPlacement: "centroid",
        hideLegend: false,
        ...common,
        memberOrder: [],
      };
    case "pie":
      return {
        shape: "pie",
        showCenterValue: false,
        valueAgainst100Percent: false,
        sortByValue: "none",
        groupSlicesBelow: 0,
        seriesColors: "pastel-discrete",
        showDataLabels: false,
        hideLegend: false,
        ...common,
        memberOrder: [],
      };
  }
}

// The config the insert wizard starts a figure with, for a metric, a type the
// metric can draw, and the dimensions the person chose. It passes the
// validator: the metric's required dimensions the type allows are laid out
// with the chosen ones, each on the first free slot of the type, else as the
// replicant, and left out where no place is free; two or more value props take
// the type's own slot; a map names its area (the finest admin level laid out,
// else the metric's coarsest) and the first value prop; a map or a pie of a
// metric that requires a period dimension shows the last full year.
export function startingFigureConfig<T extends FigureType>(
  metric: StartingMetric,
  type: T,
  chosen: readonly Dim[],
): Extract<FigureConfig, { type: T }>;
export function startingFigureConfig(
  metric: StartingMetric,
  type: FigureType,
  chosen: readonly Dim[],
): FigureConfig {
  const conditionalFormatting: FigureConditionalFormatting =
    metric.formatAs === "indicator" ? { type: "indicator" } : { type: "none" };
  const toLayOut = metric.disaggregationOptions
    .filter((o) =>
      (o.isRequired || chosen.includes(o.value)) &&
      !FILTER_ONLY_DISAGGREGATION_OPTIONS.has(o.value) &&
      (o.allowedPresentationOptions === undefined ||
        o.allowedPresentationOptions.includes(type)) &&
      !(type === "timeseries" && PERIOD_DISAGGREGATION_OPTIONS.has(o.value))
    )
    .map((o) => o.value);
  const requiresPeriod = metric.disaggregationOptions.some((o) =>
    o.isRequired && PERIOD_DISAGGREGATION_OPTIONS.has(o.value)
  );
  const data = {
    filters: [],
    ...(type === "map" ? { valueProps: metric.valueProps.slice(0, 1) } : {}),
    ...((type === "map" || type === "pie") && requiresPeriod
      ? {
        periodFilter: {
          type: "lastFull" as const,
          n: 1,
          unit: "year" as const,
        },
      }
      : {}),
  };

  const slots = new Map<LayoutSlot, Slot>();
  const own = OWN_VALUE_PROPS_SLOT[type];
  if (own !== undefined && metric.valueProps.length > 1) {
    slots.set(own, VALUE_PROPS);
  }
  let replicant: Dim | undefined;
  const place = (dim: Dim) => {
    const free = LAYOUT_SLOTS[type].find((s) => !slots.has(s));
    if (free !== undefined) slots.set(free, dim);
    else if (replicant === undefined) replicant = dim;
  };

  if (type === "map") {
    const offered = metric.disaggregationOptions.map((o) => o.value);
    const laidOutAreas = ADMIN_LEVELS.filter((l) => toLayOut.includes(l));
    const mapArea = laidOutAreas.at(-1) ??
      ADMIN_LEVELS.find((l) => offered.includes(l));
    if (mapArea === undefined) {
      throw new Error("A map needs a metric with an admin-area dimension");
    }
    for (const dim of toLayOut) if (dim !== mapArea) place(dim);
    return {
      type,
      data,
      layout: {
        mapArea,
        ...dimsOnly(slots),
        ...(replicant === undefined ? {} : { replicant: { dim: replicant } }),
      },
      style: defaultFigureStyle(type, conditionalFormatting),
      text: NO_TEXT,
    };
  }
  for (const dim of toLayOut) place(dim);
  const filled: Partial<Record<LayoutSlot, Slot>> = Object.fromEntries(slots);
  const layout = {
    ...filled,
    ...(replicant === undefined ? {} : { replicant: { dim: replicant } }),
  };
  switch (type) {
    case "timeseries": {
      const period = metric.mostGranularTimePeriodColumnInResultsFile;
      if (period === undefined) {
        throw new Error("A timeseries needs a metric with a time column");
      }
      return {
        type,
        data,
        layout: { period, ...layout },
        style: defaultFigureStyle(type, conditionalFormatting),
        text: NO_TEXT,
      };
    }
    case "table":
      return {
        type,
        data,
        layout,
        style: defaultFigureStyle(type, conditionalFormatting),
        text: NO_TEXT,
      };
    case "chart":
      return {
        type,
        data,
        layout,
        style: defaultFigureStyle(type, conditionalFormatting),
        text: NO_TEXT,
      };
    case "pie":
      return {
        type,
        data,
        layout,
        style: defaultFigureStyle(type, conditionalFormatting),
        text: NO_TEXT,
      };
  }
}

function dimsOnly(slots: ReadonlyMap<LayoutSlot, Slot>): Partial<
  Record<LayoutSlot, Dim>
> {
  const out: Partial<Record<LayoutSlot, Dim>> = {};
  for (const [slot, holds] of slots) {
    if (holds !== VALUE_PROPS) out[slot] = holds;
  }
  return out;
}
