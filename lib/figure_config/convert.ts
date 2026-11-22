import { zColorKeyOrHex, zContinuousPaletteName } from "@timroberton/panther";
import { isAdminLevel, isRollupDimension } from "../rollup.ts";
import type { PresentationObjectConfig } from "../types/_presentation_object_config.ts";
import type {
  DisaggregationDisplayOption,
  PeriodFilter,
} from "../types/presentation_objects.ts";
import {
  type Dim,
  type FigureConditionalFormatting,
  type FigureConfig,
  type FigureConfigBody,
  type FigureFilter,
  type FigureMemberOrder,
  type FigurePeriodFilter,
  type FigureRollup,
  type FigureSeriesColors,
  type FigureText,
  type FigureType,
  LAYOUT_SLOTS,
  type LayoutSlot,
  type Slot,
  VALUE_PROPS,
} from "./schema.ts";

// Today's stored `{ d, s, t }` in the figure config's shape. Every place the
// stored config says something the shape says otherwise is a note, so a sweep
// can count each case.

type StoredD = PresentationObjectConfig["d"];
type StoredS = PresentationObjectConfig["s"];

// What the conversion needs beyond the config: the metric's value props (a
// stored bundle's own may be labels a backfill wrote), whether the metric's
// values can be re-totalled for a roll-up, the dimensions laid out whose
// column holds one member in the figure's rows, and whether the figure's data
// is yearly.
export type ConversionContext = {
  valueProps: readonly string[];
  canRollUp: boolean;
  singleValueDims: ReadonlySet<Dim>;
  yearly: boolean;
};

export type ConversionNote =
  // A dimension sharing a slot with the one drawn there. Filtered to one
  // value, it leaves the slot and stays grouped.
  | "sharedSlotFilteredLeft"
  // Holding one member in the rows, it moves to the first free slot.
  | "sharedSlotOneMemberMoved"
  // Drawn as well, it moves to the first free slot.
  | "sharedSlotEffectiveMoved"
  // On a display option the type does not draw: it is placed as one displaced.
  | "slotNotOfType"
  // Displaced with no free slot left: it is no longer grouped.
  | "noFreeSlot"
  // A second entry for a dimension: today's renderer reads the first.
  | "dimTwice"
  // A second replicant: today's renderer reads the first.
  | "replicantTwice"
  // Two or more value props on a display option the type does not read.
  | "valuePropsOnFallbackSlot"
  | "timeAxisDimOffSlot"
  | "yearlyRelativePeriodFilter"
  | "fromMaxDropped"
  | "twoFiltersMerged"
  | "closedRollupDropped"
  // A roll-up on a metric whose values cannot be re-totalled, which today's
  // query never reads.
  | "ineligibleRollupDropped"
  | "mapFirstValueProp"
  | "timeseriesGroupingDropped"
  | "replicantValueDropped"
  | "linesPointsLabelsMerged"
  | "customColorsEmpty";

export type ConversionFailure =
  // Stored as an empty figure block.
  | "mapWithoutArea"
  | "timeseriesWithoutPeriod"
  | "marksNotOfType"
  | "colorNotHexOrKey"
  | "unknownPalette";

export type FigureConfigConversion<C> =
  | { ok: true; config: C; notes: ConversionNote[] }
  | { ok: false; failure: ConversionFailure; notes: ConversionNote[] };

class Failure {
  constructor(readonly failure: ConversionFailure) {}
}

// The slot each type's renderer reads a display option on, in the new names.
// A display option a type does not read draws nothing.
const SLOT_OF: Record<
  FigureType,
  Partial<Record<DisaggregationDisplayOption, LayoutSlot | "mapArea">>
> = {
  table: { row: "row", col: "col", rowGroup: "rowGroup", colGroup: "colGroup" },
  timeseries: {
    series: "series",
    cell: "pane",
    row: "tier",
    rowGroup: "tier",
    col: "lane",
    colGroup: "lane",
  },
  chart: {
    indicator: "indicator",
    series: "series",
    cell: "pane",
    row: "tier",
    rowGroup: "tier",
    col: "lane",
    colGroup: "lane",
  },
  map: { mapArea: "mapArea", cell: "pane", row: "tier", col: "lane" },
  pie: {
    series: "series",
    indicator: "indicator",
    cell: "pane",
    row: "tier",
    col: "lane",
  },
};

const FALLBACK_VALUE_PROPS_SLOT: Record<FigureType, LayoutSlot | undefined> = {
  timeseries: "series",
  chart: "indicator",
  table: "col",
  map: undefined,
  pie: undefined,
};

// A stored figure's config.
export function convertStoredConfig(
  stored: PresentationObjectConfig,
  context: ConversionContext,
): FigureConfigConversion<FigureConfig> {
  return convertFigureConfig(stored, {
    title: stored.t.caption,
    subtitle: stored.t.subCaption,
    footnote: stored.t.footnote,
  }, context);
}

// A config with texts of any kind: a stored figure's strings or a preset's
// translations. The result is in the shape's types; whether it fits the
// schema's bounds and config-alone checks is the caller's parse.
export function convertFigureConfig<T>(
  stored: { d: StoredD; s: StoredS },
  text: FigureText<T>,
  context: ConversionContext,
): FigureConfigConversion<FigureConfigBody & { text: FigureText<T> }> {
  const notes: ConversionNote[] = [];
  try {
    const body = convertBody(stored.d, stored.s, context, notes);
    return { ok: true, config: { ...body, text }, notes };
  } catch (error) {
    if (error instanceof Failure) {
      return { ok: false, failure: error.failure, notes };
    }
    throw error;
  }
}

function convertBody(
  d: StoredD,
  s: StoredS,
  context: ConversionContext,
  notes: ConversionNote[],
): FigureConfigBody {
  const type = d.type;
  const typeSlots: readonly LayoutSlot[] = LAYOUT_SLOTS[type];
  const filters = convertFilters(d, notes);
  const isFilteredToOne = (dim: Dim) =>
    filters.find((f) => f.dim === dim)?.values.length === 1;
  const valuesFilter = d.valuesFilter;
  const shown = valuesFilter === undefined
    ? [...context.valueProps]
    : context.valueProps.filter((v) => valuesFilter.includes(v));
  const multi = shown.length > 1;

  const periodFilter = convertPeriodFilter(
    d.periodFilter,
    context.yearly,
    notes,
  );
  if (type === "map" && multi) notes.push("mapFirstValueProp");
  const data = {
    filters,
    ...(type === "map" && multi
      ? { valueProps: shown.slice(0, 1) }
      : valuesFilter !== undefined && valuesFilter.length > 0
      ? { valueProps: valuesFilter }
      : {}),
    ...(periodFilter === undefined ? {} : { periodFilter }),
  };
  if (type !== "timeseries" && d.timeseriesGrouping !== undefined) {
    notes.push("timeseriesGroupingDropped");
  }

  // One entry per dimension, the replicant apart.
  const seen = new Set<Dim>();
  const entries: { dim: Dim; displayOpt: DisaggregationDisplayOption }[] = [];
  let replicantDim: Dim | undefined;
  for (const e of d.disaggregateBy) {
    if (seen.has(e.disOpt)) {
      notes.push("dimTwice");
      continue;
    }
    seen.add(e.disOpt);
    if (e.disDisplayOpt !== "replicant") {
      entries.push({ dim: e.disOpt, displayOpt: e.disDisplayOpt });
    } else if (replicantDim === undefined) {
      replicantDim = e.disOpt;
    } else {
      notes.push("replicantTwice");
    }
  }

  // Each slot holds what today's renderer draws there: two or more value
  // props on their slot, else the first dimension laid out.
  const slotOf = SLOT_OF[type];
  const holders = new Map<LayoutSlot | "mapArea", Slot>();
  const displaced: Dim[] = [];
  const valuesSlot = slotOf[d.valuesDisDisplayOpt];
  const valuePropsSlot = type === "map" || valuesSlot === "mapArea"
    ? undefined
    : valuesSlot;
  if (valuePropsSlot !== undefined && multi) {
    holders.set(valuePropsSlot, VALUE_PROPS);
  }
  const drawnToday = (dim: Dim) =>
    !isFilteredToOne(dim) && !context.singleValueDims.has(dim);
  const displace = (dim: Dim) => {
    displaced.push(dim);
    notes.push(
      isFilteredToOne(dim)
        ? "sharedSlotFilteredLeft"
        : context.singleValueDims.has(dim)
        ? "sharedSlotOneMemberMoved"
        : "sharedSlotEffectiveMoved",
    );
  };
  for (const { dim, displayOpt } of entries) {
    if (type === "timeseries" && dim === d.timeseriesGrouping) {
      notes.push("timeAxisDimOffSlot");
      continue;
    }
    const slot = slotOf[displayOpt];
    if (slot === undefined) {
      notes.push("slotNotOfType");
      displaced.push(dim);
      continue;
    }
    const holder = holders.get(slot);
    if (holder === undefined) {
      holders.set(slot, dim);
    } else if (
      holder !== VALUE_PROPS && slot !== "mapArea" && !drawnToday(holder) &&
      drawnToday(dim)
    ) {
      holders.set(slot, dim);
      displace(holder);
    } else {
      displace(dim);
    }
  }
  // With one value prop shown, a slot that names them is kept for when a
  // second is shown, counts as free, and gives way to a dimension.
  if (valuePropsSlot !== undefined && !holders.has(valuePropsSlot)) {
    holders.set(valuePropsSlot, VALUE_PROPS);
  }
  // Two or more on a display option the type does not read are drawn today on
  // the slot the renderer falls back to while it is empty.
  const fallback = FALLBACK_VALUE_PROPS_SLOT[type];
  if (
    multi && valuePropsSlot === undefined && fallback !== undefined &&
    !holders.has(fallback)
  ) {
    holders.set(fallback, VALUE_PROPS);
    notes.push("valuePropsOnFallbackSlot");
  }
  const isFree = (slot: LayoutSlot) => {
    const holder = holders.get(slot);
    return holder === undefined || (holder === VALUE_PROPS && !multi);
  };
  for (const dim of displaced) {
    // Filtered to one value, it stays grouped with no slot.
    if (isFilteredToOne(dim)) continue;
    const slot = typeSlots.find(isFree);
    if (slot === undefined) {
      notes.push("noFreeSlot");
      continue;
    }
    holders.set(slot, dim);
  }

  const layoutSlots: Partial<Record<LayoutSlot, Slot>> = {};
  const layoutDims: Partial<Record<LayoutSlot, Dim>> = {};
  for (const slot of typeSlots) {
    const holder = holders.get(slot);
    if (holder === undefined) continue;
    layoutSlots[slot] = holder;
    if (holder !== VALUE_PROPS) layoutDims[slot] = holder;
  }
  const value = d.selectedReplicantValue;
  if (replicantDim === undefined && value !== undefined && value !== "") {
    notes.push("replicantValueDropped");
  }
  const replicant = replicantDim === undefined ? {} : {
    replicant: value === undefined || value === ""
      ? { dim: replicantDim }
      : { dim: replicantDim, value },
  };
  const rollup = convertRollup(
    d,
    context.canRollUp,
    isFilteredToOne,
    layoutSlots,
    notes,
  );
  const memberOrder = convertMemberOrder(s);
  const common = {
    decimalPlaces: s.decimalPlaces,
    paneColumns: s.nColsInCellDisplay,
    memberOrder,
  };
  const valueAxis = {
    valueAxisMaxAt100Percent: s.forceYMax1,
    valueAxisMinAuto: s.forceYMinAuto,
    valueAxisLimitsPerTierOrLane: s.allowIndividualRowLimits,
  };

  switch (type) {
    case "table":
      return {
        type,
        data,
        layout: { ...layoutSlots, ...replicant, ...rollup },
        style: {
          allowVerticalColHeaders: s.allowVerticalColHeaders,
          showSampleSizes: s.showNValues ?? false,
          hideLegend: s.hideLegend,
          conditionalFormatting: convertConditionalFormatting(s),
          decimalPlaces: s.decimalPlaces,
          memberOrder,
        },
      };
    case "timeseries":
      return {
        type,
        data,
        layout: {
          period: timeseriesPeriod(d),
          ...layoutSlots,
          ...replicant,
          ...rollup,
        },
        style: timeseriesStyle(s, common, valueAxis, notes),
      };
    case "chart":
      return {
        type,
        data,
        layout: { ...layoutSlots, ...replicant, ...rollup },
        style: {
          marks: s.content,
          stacked: s.barsStacked,
          orientation: s.horizontal === true ? "horizontal" : "vertical",
          verticalTickLabels: s.verticalTickLabels,
          sortByValue: s.sortIndicatorValues,
          seriesColors: convertSeriesColors(s, notes),
          colorBy: convertColorBy(s),
          conditionalFormatting: convertConditionalFormatting(s),
          showDataLabels: dataLabels(s, notes),
          hideLegend: s.hideLegend,
          ...common,
          ...valueAxis,
        },
      };
    case "map": {
      const mapArea = holders.get("mapArea");
      if (mapArea === undefined || !isAdminLevel(mapArea)) {
        throw new Failure("mapWithoutArea");
      }
      const labelMode = s.mapDataLabelMode;
      const noLabels = labelMode === "none";
      return {
        type,
        data,
        layout: { mapArea, ...layoutDims, ...replicant },
        style: {
          projection: s.mapProjection,
          conditionalFormatting: convertConditionalFormatting(s),
          showMapAreaLabels: !noLabels && (s.mapShowRegionLabels ?? false),
          showDataLabels: !noLabels && s.showDataLabels,
          labelPlacement: labelMode === undefined || labelMode === "none"
            ? "centroid"
            : labelMode,
          hideLegend: s.hideLegend,
          ...common,
        },
      };
    }
    case "pie":
      return {
        type,
        data,
        layout: { ...layoutSlots, ...replicant },
        style: {
          shape: (s.pieInnerRadiusRatio ?? 0) > 0 ? "doughnut" : "pie",
          showCenterValue: s.pieShowCenterValue ?? false,
          valueAgainst100Percent: s.pieCompletionMode ?? false,
          sortByValue: s.sortIndicatorValues,
          groupSlicesBelow: s.pieGroupSmallSlices ?? 0,
          seriesColors: convertSeriesColors(s, notes),
          showDataLabels: s.showDataLabels,
          hideLegend: s.hideLegend,
          ...common,
        },
      };
  }
}

function timeseriesPeriod(d: StoredD) {
  if (d.timeseriesGrouping === undefined) {
    throw new Failure("timeseriesWithoutPeriod");
  }
  return d.timeseriesGrouping;
}

type Common = {
  decimalPlaces: StoredS["decimalPlaces"];
  paneColumns: StoredS["nColsInCellDisplay"];
  memberOrder: FigureMemberOrder;
};
type ValueAxis = {
  valueAxisMaxAt100Percent: boolean;
  valueAxisMinAuto: boolean;
  valueAxisLimitsPerTierOrLane: boolean;
};

// Today's renderer tests the four special flags in this order and draws the
// first that is set.
function timeseriesStyle(
  s: StoredS,
  common: Common,
  valueAxis: ValueAxis,
  notes: ConversionNote[],
): Extract<FigureConfig, { type: "timeseries" }>["style"] {
  if (s.specialCoverageChart) {
    return {
      mode: "coverage",
      valueAxisMaxAt100Percent: s.forceYMax1,
      valueAxisMinAuto: s.forceYMinAuto,
      paneColumns: common.paneColumns,
      memberOrder: common.memberOrder,
    };
  }
  if (s.specialBarChart) {
    return {
      mode: "percentChange",
      threshold: s.specialBarChartDiffThreshold,
      invertColors: s.specialBarChartInverted,
      showDataLabels: s.showDataLabels,
      labelOnlyBeyondThreshold: s.specialBarChartDataLabels !== "all-values",
      seriesColors: convertSeriesColors(s, notes),
      colorBy: convertColorBy(s),
      ...common,
      ...valueAxis,
    };
  }
  if (s.specialDisruptionsChart || s.specialDisruptionsChartV2) {
    return {
      mode: s.specialDisruptionsChart ? "disruptions" : "disruptionsBand",
      invertColors: s.diffInverted,
      showDataLabels: s.showDataLabelsLineCharts,
      ...common,
      ...valueAxis,
    };
  }
  const marks = s.content;
  if (marks === "points" || marks === "points-connectors") {
    throw new Failure("marksNotOfType");
  }
  return {
    mode: "standard",
    marks,
    stacked: s.barsStacked,
    seriesColors: convertSeriesColors(s, notes),
    colorBy: convertColorBy(s),
    conditionalFormatting: convertConditionalFormatting(s),
    showDataLabels: dataLabels(s, notes),
    hideLegend: s.hideLegend,
    ...common,
    ...valueAxis,
  };
}

// Two filters on one dimension are read together, so they become one filter
// of the values both hold.
function convertFilters(d: StoredD, notes: ConversionNote[]): FigureFilter[] {
  const out: FigureFilter[] = [];
  for (const f of d.filterBy) {
    const prior = out.find((x) => x.dim === f.disOpt);
    if (prior === undefined) {
      out.push({ dim: f.disOpt, values: f.values });
      continue;
    }
    notes.push("twoFiltersMerged");
    const kept = new Set(f.values.map(String));
    prior.values = prior.values.filter((v) => kept.has(String(v)));
  }
  return out;
}

// On yearly data the engine reads every filter but a range as the latest
// year, which is the one relative filter yearly data takes.
export function convertPeriodFilter(
  stored: PeriodFilter | undefined,
  yearly: boolean,
  notes: ConversionNote[],
): FigurePeriodFilter | undefined {
  if (stored === undefined) return undefined;
  const converted = periodFilterOf(stored);
  if (stored.filterType === "from_month") notes.push("fromMaxDropped");
  if (!yearly || converted.type === "range") return converted;
  if (
    converted.type !== "lastFull" || converted.unit !== "year" ||
    converted.n !== 1
  ) {
    notes.push("yearlyRelativePeriodFilter");
  }
  return { type: "lastFull", n: 1, unit: "year" };
}

function periodFilterOf(stored: NonNullable<PeriodFilter>): FigurePeriodFilter {
  switch (stored.filterType) {
    case "custom":
      return { type: "range", min: stored.min, max: stored.max };
    case "from_month":
      return { type: "from", min: stored.min };
    case "last_n_months":
      return { type: "last", n: stored.nMonths, unit: "month" };
    case "last_calendar_year":
      return { type: "lastFull", n: 1, unit: "year" };
    case "last_n_calendar_years":
      return { type: "lastFull", n: stored.nYears, unit: "year" };
    case "last_calendar_quarter":
      return { type: "lastFull", n: 1, unit: "quarter" };
    case "last_n_calendar_quarters":
      return { type: "lastFull", n: stored.nQuarters, unit: "quarter" };
  }
}

// Today's roll-up is open when exactly one flagged entry can carry it, and one
// flag closed only by a filter of one value is kept closed. A closed roll-up
// whose dimension left its slot has nothing to total, and one on a metric
// whose values cannot be re-totalled is never read: both are dropped.
function convertRollup(
  d: StoredD,
  canRollUp: boolean,
  isFilteredToOne: (dim: Dim) => boolean,
  layoutSlots: Partial<Record<LayoutSlot, Slot>>,
  notes: ConversionNote[],
): { rollup?: FigureRollup } {
  if (d.type === "map" || d.type === "pie") return {};
  const holdable: FigureRollup[] = d.disaggregateBy.flatMap((e) =>
    e.rollup === true && isRollupDimension(e.disOpt) &&
      e.disDisplayOpt !== "replicant" && e.disDisplayOpt !== "mapArea"
      ? [{ dim: e.disOpt, position: e.rollupPosition ?? "bottom" }]
      : []
  );
  const open = holdable.filter((r) => !isFilteredToOne(r.dim));
  const rollup = holdable.length === 1
    ? holdable[0]
    : open.length === 1
    ? open[0]
    : undefined;
  if (rollup === undefined) return {};
  if (!canRollUp) {
    notes.push("ineligibleRollupDropped");
    return {};
  }
  if (!Object.values(layoutSlots).includes(rollup.dim)) {
    notes.push("closedRollupDropped");
    return {};
  }
  return { rollup };
}

// A dimension's order is read from its first entry.
function convertMemberOrder(s: StoredS): FigureMemberOrder {
  const out: FigureMemberOrder = [];
  for (const o of s.customValueOrder ?? []) {
    if (out.some((x) => x.dim === o.disOpt)) continue;
    out.push({ dim: o.disOpt, memberIds: o.orderedIds });
  }
  return out;
}

function convertColorBy(s: StoredS): "series" | "pane" | "tier" | "lane" {
  switch (s.seriesColorFuncPropToUse) {
    case "cell":
      return "pane";
    case "row":
      return "tier";
    case "col":
      return "lane";
    default:
      return "series";
  }
}

// A custom scale with no colours draws every series black today.
function convertSeriesColors(
  s: StoredS,
  notes: ConversionNote[],
): FigureSeriesColors {
  if (s.colorScale !== "custom") return s.colorScale;
  const custom = s.customSeriesStyles.map((c) => c.color);
  if (custom.length > 0) return { custom };
  notes.push("customColorsEmpty");
  return { custom: ["#000000"] };
}

// Today a point owns its label before its line does, so on lines with points
// either flag draws a label; lines alone read the line flag, every other mark
// the point flag.
function dataLabels(s: StoredS, notes: ConversionNote[]): boolean {
  if (s.content === "lines-points") {
    if (s.showDataLabels !== s.showDataLabelsLineCharts) {
      notes.push("linesPointsLabelsMerged");
    }
    return s.showDataLabels || s.showDataLabelsLineCharts;
  }
  return s.content === "lines" || s.content === "lines-area"
    ? s.showDataLabelsLineCharts
    : s.showDataLabels;
}

function hexOrKey(color: unknown) {
  const parsed = zColorKeyOrHex.safeParse(color);
  if (!parsed.success) throw new Failure("colorNotHexOrKey");
  return parsed.data;
}

function convertConditionalFormatting(
  s: StoredS,
): FigureConditionalFormatting {
  switch (s.cfMode) {
    case "none":
      return { type: "none" };
    case "indicator":
      return { type: "indicator" };
    case "thresholds":
      return {
        type: "thresholds",
        cutoffs: s.cfThresholdCutoffs,
        buckets: s.cfThresholdBuckets.map((b) =>
          b.label === undefined
            ? { color: hexOrKey(b.color) }
            : { color: hexOrKey(b.color), label: b.label }
        ),
        direction: s.cfThresholdDirection,
        ...(s.cfThresholdNoDataColor === ""
          ? {}
          : { noDataColor: s.cfThresholdNoDataColor }),
      };
    case "scale": {
      const preset = zContinuousPaletteName.safeParse(s.cfScalePalettePreset);
      if (s.cfScalePaletteKind === "preset" && !preset.success) {
        throw new Failure("unknownPalette");
      }
      return {
        type: "scale",
        palette: preset.success && s.cfScalePaletteKind === "preset"
          ? { preset: preset.data }
          : {
            from: s.cfScaleCustomFrom,
            ...(s.cfScaleCustomMid === "" ? {} : { mid: s.cfScaleCustomMid }),
            to: s.cfScaleCustomTo,
          },
        reverse: s.cfScaleReverse,
        ...(s.cfScaleSteps >= 2 ? { steps: s.cfScaleSteps } : {}),
        domain: s.cfScaleDomainKind === "fixed"
          ? { min: s.cfScaleDomainMin, max: s.cfScaleDomainMax }
          : "auto",
        ...(s.cfScaleNoDataColor === ""
          ? {}
          : { noDataColor: s.cfScaleNoDataColor }),
      };
    }
  }
}
