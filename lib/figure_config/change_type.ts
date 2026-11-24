import { ADMIN_LEVELS, type AdminLevel } from "../rollup.ts";
import {
  FILTER_ONLY_DISAGGREGATION_OPTIONS,
  PERIOD_DISAGGREGATION_OPTIONS,
} from "../types/disaggregation_options.ts";
import {
  type AxisSlot,
  type Dim,
  type FigureConditionalFormatting,
  type FigureConfig,
  type FigureReplicant,
  type FigureRollup,
  type FigureType,
  LAYOUT_SLOTS,
  type LayoutSlot,
  PERIOD_AXIS_DIMS,
  type PeriodAxisDim,
  rollupOfLayout,
  type Slot,
  slotEntries,
  VALUE_PROPS,
} from "./schema.ts";
import {
  defaultFigureStyle,
  OWN_VALUE_PROPS_SLOT,
  type StartingMetric,
} from "./starting_config.ts";

// Where a dimension goes when a figure changes to a type without its slot: the
// display-option fallbacks of today's change of type, in the figure config's
// slot names. A slot the new type has keeps its dimension. A timeseries'
// `period` has no fallback: its dimension is not carried.
const SLOT_FALLBACKS: Record<
  FigureType,
  Partial<Record<AxisSlot, LayoutSlot>>
> = {
  table: {
    series: "row",
    pane: "row",
    tier: "row",
    lane: "col",
    indicator: "col",
    mapArea: "row",
  },
  timeseries: {
    indicator: "series",
    row: "tier",
    col: "lane",
    rowGroup: "tier",
    colGroup: "lane",
    mapArea: "pane",
  },
  chart: {
    row: "tier",
    col: "lane",
    rowGroup: "tier",
    colGroup: "lane",
    mapArea: "pane",
  },
  map: {
    series: "pane",
    indicator: "pane",
    row: "tier",
    col: "lane",
    rowGroup: "tier",
    colGroup: "lane",
  },
  pie: {
    mapArea: "series",
    row: "tier",
    col: "lane",
    rowGroup: "tier",
    colGroup: "lane",
  },
};

function slotsOf(type: FigureType): readonly LayoutSlot[] {
  return LAYOUT_SLOTS[type];
}

function isSlotOf(type: FigureType, slot: AxisSlot): slot is LayoutSlot {
  return (slotsOf(type) as readonly AxisSlot[]).includes(slot);
}

// A figure changed to another type. Each dimension goes to the slot today's
// change of type gives it, or the first free slot when that one is taken; a
// dimension the type does not allow is dropped, and a required dimension the
// type allows is added on the first free slot. A dimension for which no slot
// and no replicant is free is left out. The value props take the type's own
// slot. A timeseries takes as `period` the finest period dimension laid out,
// else the metric's own; a map takes as `mapArea` the finest admin level laid
// out, else the replicant's when that is an admin level, else the metric's
// coarsest. The data and the text are kept and the style is the type's
// default; a problem the change leaves is the validator's to show.
export function changeFigureType<T extends FigureType>(
  config: FigureConfig,
  type: T,
  metric: StartingMetric,
): Extract<FigureConfig, { type: T }>;
export function changeFigureType(
  config: FigureConfig,
  type: FigureType,
  metric: StartingMetric,
): FigureConfig {
  if (config.type === type) return config;
  const options = new Map(
    metric.disaggregationOptions.map((o) => [o.value, o]),
  );
  const allowed = (dim: Dim) => {
    if (FILTER_ONLY_DISAGGREGATION_OPTIONS.has(dim)) return false;
    if (type === "timeseries" && PERIOD_DISAGGREGATION_OPTIONS.has(dim)) {
      return false;
    }
    const on = options.get(dim)?.allowedPresentationOptions;
    return on === undefined || on.includes(type);
  };

  const entries = slotEntries(config).flatMap((e) =>
    e.holds === VALUE_PROPS ? [] : [{ slot: e.slot, dim: e.holds }]
  );
  const laidOut = entries.map((e) => e.dim);
  const old = config.layout.replicant;
  const axisDim = type === "timeseries"
    ? choosePeriod(laidOut, metric)
    : type === "map"
    ? chooseMapArea(laidOut, old, metric)
    : undefined;

  const slots = new Map<LayoutSlot, Slot>();
  const own = OWN_VALUE_PROPS_SLOT[type];
  if (own !== undefined) slots.set(own, VALUE_PROPS);
  const placed = new Set<Dim>(axisDim === undefined ? [] : [axisDim]);
  let replicant: FigureReplicant | undefined =
    old !== undefined && !placed.has(old.dim) && allowed(old.dim)
      ? old
      : undefined;
  if (replicant !== undefined) placed.add(replicant.dim);

  const place = (dim: Dim, preferred: LayoutSlot | undefined) => {
    if (placed.has(dim)) return;
    const free = (s: LayoutSlot) => !slots.has(s);
    const slot = preferred !== undefined && free(preferred)
      ? preferred
      : slotsOf(type).find(free);
    if (slot !== undefined) {
      slots.set(slot, dim);
      placed.add(dim);
    } else if (replicant === undefined) {
      replicant = { dim };
      placed.add(dim);
    }
  };
  for (const { slot, dim } of entries) {
    if (slot === "period" || !allowed(dim)) continue;
    place(dim, isSlotOf(type, slot) ? slot : SLOT_FALLBACKS[type][slot]);
  }
  for (const o of metric.disaggregationOptions) {
    if (o.isRequired && allowed(o.value)) place(o.value, undefined);
  }

  const filled: Partial<Record<LayoutSlot, Slot>> = Object.fromEntries(slots);
  const kept = rollupOfLayout(config);
  const rollup: { rollup?: FigureRollup } =
    kept !== undefined && [...slots.values()].includes(kept.dim)
      ? { rollup: kept }
      : {};
  const withReplicant = replicant === undefined ? {} : { replicant };
  const conditionalFormatting: FigureConditionalFormatting =
    metric.formatAs === "indicator" ? { type: "indicator" } : { type: "none" };
  const base = { data: config.data, text: config.text };

  switch (type) {
    case "table":
      return {
        type,
        ...base,
        layout: { ...filled, ...withReplicant, ...rollup },
        style: defaultFigureStyle(type, conditionalFormatting),
      };
    case "timeseries":
      return {
        type,
        ...base,
        layout: {
          period: choosePeriod(laidOut, metric),
          ...filled,
          ...withReplicant,
          ...rollup,
        },
        style: defaultFigureStyle(type, conditionalFormatting),
      };
    case "chart":
      return {
        type,
        ...base,
        layout: { ...filled, ...withReplicant, ...rollup },
        style: defaultFigureStyle(type, conditionalFormatting),
      };
    case "map": {
      const dims: Partial<Record<LayoutSlot, Dim>> = {};
      for (const [slot, holds] of slots) {
        if (holds !== VALUE_PROPS) dims[slot] = holds;
      }
      return {
        type,
        ...base,
        layout: {
          mapArea: chooseMapArea(laidOut, old, metric),
          ...dims,
          ...withReplicant,
        },
        style: defaultFigureStyle(type, conditionalFormatting),
      };
    }
    case "pie":
      return {
        type,
        ...base,
        layout: { ...filled, ...withReplicant },
        style: defaultFigureStyle(type, conditionalFormatting),
      };
  }
}

function choosePeriod(
  laidOut: readonly Dim[],
  metric: StartingMetric,
): PeriodAxisDim {
  const period = PERIOD_AXIS_DIMS.find((p) => laidOut.includes(p)) ??
    metric.mostGranularTimePeriodColumnInResultsFile;
  if (period === undefined) {
    throw new Error("A timeseries needs a metric with a time column");
  }
  return period;
}

function chooseMapArea(
  laidOut: readonly Dim[],
  replicant: FigureReplicant | undefined,
  metric: StartingMetric,
): AdminLevel {
  const finest = ADMIN_LEVELS.filter((l) => laidOut.includes(l)).at(-1);
  if (finest !== undefined) return finest;
  const fromReplicant = ADMIN_LEVELS.find((l) => l === replicant?.dim);
  if (fromReplicant !== undefined) return fromReplicant;
  const offered = metric.disaggregationOptions.map((o) => o.value);
  const coarsest = ADMIN_LEVELS.find((l) => offered.includes(l));
  if (coarsest === undefined) {
    throw new Error("A map needs a metric with an admin-area dimension");
  }
  return coarsest;
}
