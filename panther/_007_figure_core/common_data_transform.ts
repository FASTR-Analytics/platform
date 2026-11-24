// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Transforms raw JSON data into multi-dimensional value arrays for chart rendering
import { referenceLinesOn } from "./_axes/axis_configs.ts";
import {
  assert,
  BLANK_SENTINEL,
  compareBlankLast,
  createArray,
  createDimensionMembers,
  type DataDimension,
  type DimensionMember,
  getDimensionMembers,
  getValidNumberOrUndefined,
  isBlankValue,
  type MemberSortConfig,
  sortDimensionMembers,
  sum,
} from "./deps.ts";
import {
  getSubChartMembers,
  namesSubChart,
  type SubChartDimensions,
} from "./sub_chart_members.ts";
import type {
  ChartValueAxisLimits,
  ChartValueAxisPaneLimits,
  JsonArray,
  JsonArrayItem,
  ReferenceLine,
  ReferenceLineDataConfig,
  SecondValueAxisDataConfig,
  SecondValueAxisDataTransformed,
  SubChartTextDataConfig,
} from "./types.ts";

// A dimension, named from its prop, or undefined when no prop is given.
// Members come in first-seen row order (the value columns, for "--v") before
// labelReplacements and the sort apply.
export function buildDataDimension(
  jsonArray: JsonArray,
  prop: string,
  valueProps: string[],
  labelReplacements: Record<string, string> | undefined,
  sort: MemberSortConfig | undefined,
): DataDimension;
export function buildDataDimension(
  jsonArray: JsonArray,
  prop: string | undefined,
  valueProps: string[],
  labelReplacements: Record<string, string> | undefined,
  sort: MemberSortConfig | undefined,
): DataDimension | undefined;
export function buildDataDimension(
  jsonArray: JsonArray,
  prop: string | undefined,
  valueProps: string[],
  labelReplacements: Record<string, string> | undefined,
  sort: MemberSortConfig | undefined,
): DataDimension | undefined {
  if (prop === undefined) {
    return undefined;
  }
  const ids = prop === "--v"
    ? valueProps
    : collectDimensionIds(jsonArray, prop);
  return {
    name: prop,
    members: sortDimensionMembers(
      createDimensionMembers(ids, labelReplacements),
      sort,
    ),
  };
}

export function getDimensionId(row: JsonArrayItem, prop: string): string {
  const value = row[prop];
  return isBlankValue(value) ? BLANK_SENTINEL : String(value);
}

function collectDimensionIds(jsonArray: JsonArray, prop: string): string[] {
  return [...new Set(jsonArray.map((row) => getDimensionId(row, prop)))];
}

export function getMemberIndex(
  dimension: DataDimension | undefined,
  valueProp: string,
  obj: JsonArrayItem,
): number {
  if (!dimension) return 0;
  const id = dimension.name === "--v"
    ? valueProp
    : getDimensionId(obj, dimension.name);
  return dimension.members.findIndex((h) => h.id === id);
}

type ChartValueTensors = {
  values: (number | undefined)[][][][][];
  uncertaintyValues?: ChartUncertaintyTensors;
};

type ChartValueCounts = {
  nPanes: number;
  nTiers: number;
  nLanes: number;
  nValues: number;
};

// The series each value axis measures: the second those whose member id its
// data config names, the first every other.
function getSeriesByValueAxis(
  series: DataDimension | undefined,
  secondValueAxis: SecondValueAxisDataConfig | undefined,
): { first: number[]; second: number[] } {
  const assigned = new Set(secondValueAxis?.seriesMemberIds);
  const isAssigned = (i_series: number) =>
    series !== undefined && assigned.has(series.members[i_series].id);
  const indices = getDimensionMembers(series).map((_, i_series) => i_series);
  return {
    first: indices.filter((i_series) => !isAssigned(i_series)),
    second: indices.filter(isAssigned),
  };
}

// A chart's value axes: the first's limits, from the series not assigned to
// the second and the reference lines on it, and the second where its data
// config names a series member.
export function calculateChartValueAxes(
  tensors: ChartValueTensors,
  counts: ChartValueCounts,
  stacked: boolean,
  dimensions: DataDimensions,
  secondValueAxis: SecondValueAxisDataConfig | undefined,
  referenceLines: ReferenceLineDataConfig[] | undefined,
): {
  valueAxisLimits: ChartValueAxisLimits;
  secondValueAxis: SecondValueAxisDataTransformed | undefined;
  firstValueAxisSeriesIndices: number[];
} {
  const { series } = dimensions;
  const { first, second } = getSeriesByValueAxis(series, secondValueAxis);
  return {
    valueAxisLimits: calculateChartValueAxisLimits(
      tensors,
      counts,
      stacked,
      first,
      referenceLinesOn(referenceLines, "first"),
      dimensions,
    ),
    secondValueAxis: series === undefined || second.length === 0 ? undefined : {
      seriesMemberIds: second.map((i_series) => series.members[i_series].id),
      valueAxisLimits: calculateChartValueAxisLimits(
        tensors,
        counts,
        stacked,
        second,
        referenceLinesOn(referenceLines, "second"),
        dimensions,
      ),
      axisLabel: secondValueAxis?.axisLabel?.trim(),
    },
    firstValueAxisSeriesIndices: first,
  };
}

export function trimReferenceLineLabels<T extends ReferenceLine>(
  lines: T[] | undefined,
): T[] | undefined {
  return lines?.map((line) =>
    line.label === undefined ? line : { ...line, label: line.label.trim() }
  );
}

export function trimSubChartTexts(
  texts: SubChartTextDataConfig[] | undefined,
): SubChartTextDataConfig[] | undefined {
  return texts?.map((text) => ({ ...text, text: text.text.trim() }));
}

// Per pane, tier and lane, the smallest and largest of the values and bounds
// of the series a value axis measures, stacked values summed by sign at each
// value index, and of the reference lines drawn there; 0 to 1 where they hold
// none.
export function calculateChartValueAxisLimits(
  tensors: ChartValueTensors,
  counts: ChartValueCounts,
  stacked: boolean,
  seriesIndices: number[],
  referenceLines: ReferenceLine[],
  dimensions: SubChartDimensions,
): ChartValueAxisLimits {
  const paneLimits: ChartValueAxisPaneLimits[] = createArray(
    counts.nPanes,
    () => ({
      valueMin: Number.POSITIVE_INFINITY,
      valueMax: Number.NEGATIVE_INFINITY,
      tierLimits: createArray(counts.nTiers, () => ({
        valueMin: Number.POSITIVE_INFINITY,
        valueMax: Number.NEGATIVE_INFINITY,
      })),
      laneLimits: createArray(counts.nLanes, () => ({
        valueMin: Number.POSITIVE_INFINITY,
        valueMax: Number.NEGATIVE_INFINITY,
      })),
    }),
  );

  const boundTensors = tensors.uncertaintyValues
    ? [tensors.uncertaintyValues.ub, tensors.uncertaintyValues.lb]
    : [];
  for (let i_pane = 0; i_pane < counts.nPanes; i_pane++) {
    for (let i_tier = 0; i_tier < counts.nTiers; i_tier++) {
      for (let i_lane = 0; i_lane < counts.nLanes; i_lane++) {
        const update = (value: number | undefined) => {
          if (value !== undefined) {
            updateLimits(paneLimits, i_pane, i_tier, i_lane, value);
          }
        };
        const seriesValues = tensors.values[i_pane][i_tier][i_lane];
        if (stacked) {
          for (let i_value = 0; i_value < counts.nValues; i_value++) {
            const stackValues = seriesIndices
              .map((i_series) => seriesValues[i_series][i_value])
              .filter((v): v is number => v !== undefined);
            const bySign = [
              stackValues.filter((v) => v >= 0),
              stackValues.filter((v) => v < 0),
            ];
            for (const ofSign of bySign) {
              if (ofSign.length > 0) {
                update(sum(ofSign));
              }
            }
          }
        } else {
          for (const i_series of seriesIndices) {
            seriesValues[i_series].forEach(update);
          }
        }
        for (const tensor of boundTensors) {
          for (const i_series of seriesIndices) {
            tensor[i_pane][i_tier][i_lane][i_series].forEach(update);
          }
        }
        const members = getSubChartMembers(dimensions, {
          i_pane,
          i_tier,
          i_lane,
        });
        for (const line of referenceLines) {
          if (namesSubChart(line, members)) {
            update(line.value);
          }
        }
      }
    }
  }

  // Fallback to 0..1 where a pane/tier/lane had no data.
  for (let i_pane = 0; i_pane < counts.nPanes; i_pane++) {
    const pl = paneLimits[i_pane];
    if (!isFinite(pl.valueMin)) pl.valueMin = 0;
    if (!isFinite(pl.valueMax)) pl.valueMax = 1;
    for (const t of pl.tierLimits) {
      if (!isFinite(t.valueMin)) t.valueMin = 0;
      if (!isFinite(t.valueMax)) t.valueMax = 1;
    }
    for (const l of pl.laneLimits) {
      if (!isFinite(l.valueMin)) l.valueMin = 0;
      if (!isFinite(l.valueMax)) l.valueMax = 1;
    }
  }

  return { paneLimits };
}

function updateLimits(
  paneLimits: ChartValueAxisPaneLimits[],
  i_pane: number,
  i_tier: number,
  i_lane: number,
  value: number,
): void {
  const p = paneLimits[i_pane];
  p.valueMin = Math.min(p.valueMin, value);
  p.valueMax = Math.max(p.valueMax, value);
  p.tierLimits[i_tier].valueMin = Math.min(
    p.tierLimits[i_tier].valueMin,
    value,
  );
  p.tierLimits[i_tier].valueMax = Math.max(
    p.tierLimits[i_tier].valueMax,
    value,
  );
  p.laneLimits[i_lane].valueMin = Math.min(
    p.laneLimits[i_lane].valueMin,
    value,
  );
  p.laneLimits[i_lane].valueMax = Math.max(
    p.laneLimits[i_lane].valueMax,
    value,
  );
}

export function getTierOrLaneKey(
  tierOrLaneDimension: "tier" | "lane",
): "tiers" | "lanes" {
  return tierOrLaneDimension === "lane" ? "lanes" : "tiers";
}

// Effective proportional flags: panes presupposes the tier-or-lane key, so a
// bare { panes: true } turns both on, and the explicit contradiction is the
// proportional-conflict issue.
export function resolveChartProportional(
  proportional: ChartOVOrOHProportional | undefined,
  tierOrLaneKey: "tiers" | "lanes",
): { tiersOrLanes: boolean; panes: boolean } {
  const panes = proportional?.panes === true;
  return {
    tiersOrLanes: proportional?.[tierOrLaneKey] === true || panes,
    panes,
  };
}

// The union of chart-ov's and chart-oh's proportional shapes, as the shared
// transform reads it; each figure's own type holds only its own key.
export type ChartOVOrOHProportional = {
  lanes?: boolean;
  tiers?: boolean;
  panes?: boolean;
};

// Per-pane visible subsets for unbalanced membership, shared by the
// indicator/tier/lane derivations. A dimension member is visible in a pane iff
// ANY cell for it has a defined value OR a defined uncertainty bound (a
// member with bounds but no point estimate must still render its bounds).
// Indices come out in ascending global (storage) order; a value sort then
// reorders the indicator masks via orderVisibleByPane / orderVisibleByPaneTierOrLane.
type PaneTensor = (number | undefined)[][][][]; // [tier][lane][series][indicator]
type ChartUncertaintyTensors = {
  ub: (number | undefined)[][][][][];
  lb: (number | undefined)[][][][][];
};

function deriveVisibleByPane(
  values: (number | undefined)[][][][][],
  uncertaintyValues: ChartUncertaintyTensors | undefined,
  n: number,
  memberHasDefined: (paneTensor: PaneTensor, i: number) => boolean,
): number[][] {
  const tensors = uncertaintyValues
    ? [values, uncertaintyValues.ub, uncertaintyValues.lb]
    : [values];
  return values.map((_, i_pane) => {
    const visible: number[] = [];
    for (let i = 0; i < n; i++) {
      if (tensors.some((tensor) => memberHasDefined(tensor[i_pane], i))) {
        visible.push(i);
      }
    }
    return visible;
  });
}

export function deriveVisibleIndicatorsByPane(
  values: (number | undefined)[][][][][],
  uncertaintyValues: ChartUncertaintyTensors | undefined,
  nIndicators: number,
): number[][] {
  return deriveVisibleByPane(
    values,
    uncertaintyValues,
    nIndicators,
    (paneTensor, i_indicator) =>
      paneTensor.some((tier) =>
        tier.some((lane) =>
          lane.some((series) => series[i_indicator] !== undefined)
        )
      ),
  );
}

// Per-(pane, tier or lane) visible indicator subsets for proportional tier-or-lane layout.
// The tier-or-lane dimension is the categorical direction: tiers on ChartOH, lanes
// on ChartOV. Visibility unions across the value-direction dim + series
// (lanes+series per tier on OH; tiers+series per lane on OV), scanning
// values AND bounds — same rule as the per-pane masks. Returned arrays are
// indexed [pane][GLOBAL tier-or-lane index][visible global indicator indices]; a
// tier or lane with no data in a pane gets [] and is dropped for that pane by the
// geometry (never asserted against — it is legitimate data). Indices come out
// in storage order; a value sort reorders them via orderVisibleByPaneTierOrLane.
export function deriveVisibleIndicatorsByPaneTierOrLane(
  values: (number | undefined)[][][][][],
  uncertaintyValues: ChartUncertaintyTensors | undefined,
  nIndicators: number,
  tierOrLaneDimension: "tier" | "lane",
): number[][][] {
  const tensors = uncertaintyValues
    ? [values, uncertaintyValues.ub, uncertaintyValues.lb]
    : [values];
  return values.map((paneTensor, i_pane) => {
    const nTiersOrLanes = tierOrLaneDimension === "tier"
      ? paneTensor.length
      : (paneTensor[0]?.length ?? 0);
    const tiersOrLanes: number[][] = [];
    for (let i_tierOrLane = 0; i_tierOrLane < nTiersOrLanes; i_tierOrLane++) {
      const visible: number[] = [];
      for (let i = 0; i < nIndicators; i++) {
        const hasDefined = tensors.some((tensor) => {
          const pt = tensor[i_pane];
          if (tierOrLaneDimension === "tier") {
            return pt[i_tierOrLane].some((lane) =>
              lane.some((series) => series[i] !== undefined)
            );
          }
          return pt.some((tier) =>
            tier[i_tierOrLane].some((series) => series[i] !== undefined)
          );
        });
        if (hasDefined) {
          visible.push(i);
        }
      }
      tiersOrLanes.push(visible);
    }
    return tiersOrLanes;
  });
}

export type ValueSortDirection = "ascending" | "descending";

export type ValueSort = ValueSortDirection | "none";

// Stable, so ties keep the order the mask arrived in (storage order). The
// blank indicator follows every named one whatever its value.
function orderByKey(
  visible: number[],
  indicators: DimensionMember[],
  key: (i: number) => number,
  direction: ValueSortDirection,
): number[] {
  const sign = direction === "descending" ? -1 : 1;
  return [...visible].sort((a, b) =>
    compareBlankLast(indicators[a], indicators[b]) || sign * (key(a) - key(b))
  );
}

function sumDefined(
  cells: (number | undefined)[][],
  seriesIndices: number[],
  i: number,
): number {
  return seriesIndices.reduce(
    (acc, i_series) => acc + (cells[i_series][i] ?? 0),
    0,
  );
}

// A value sort keys on the sum over the first value axis's series and every
// tier-or-lane member (lanes on OV, tiers on OH: the members that share one
// scale), at member 0 of the value-direction dimension, whose members carry
// their own limits and so cannot be summed; the second value axis's series
// are in other units. The sort is a presentation order on the masks; storage
// and the members keep sort.indicator order.
export function orderVisibleByPane(
  visibleByPane: number[][],
  values: (number | undefined)[][][][][],
  seriesIndices: number[],
  indicators: DimensionMember[],
  tierOrLaneDimension: "tier" | "lane",
  direction: ValueSortDirection | undefined,
): number[][] {
  if (direction === undefined) {
    return visibleByPane;
  }
  return visibleByPane.map((visible, i_pane) => {
    const paneTensor = values[i_pane];
    const tierOrLaneCells = tierOrLaneDimension === "lane"
      ? paneTensor[0]
      : paneTensor.map((tier) => tier[0]);
    return orderByKey(
      visible,
      indicators,
      (i) =>
        tierOrLaneCells.reduce(
          (acc, cells) => acc + sumDefined(cells, seriesIndices, i),
          0,
        ),
      direction,
    );
  });
}

export function orderVisibleByPaneTierOrLane(
  visibleByPaneTierOrLane: number[][][],
  values: (number | undefined)[][][][][],
  seriesIndices: number[],
  indicators: DimensionMember[],
  tierOrLaneDimension: "tier" | "lane",
  direction: ValueSortDirection | undefined,
): number[][][] {
  if (direction === undefined) {
    return visibleByPaneTierOrLane;
  }
  return visibleByPaneTierOrLane.map((tiersOrLanes, i_pane) =>
    tiersOrLanes.map((visible, i_tierOrLane) => {
      const cells = tierOrLaneDimension === "lane"
        ? values[i_pane][0][i_tierOrLane]
        : values[i_pane][i_tierOrLane][0];
      return orderByKey(
        visible,
        indicators,
        (i) => sumDefined(cells, seriesIndices, i),
        direction,
      );
    })
  );
}

export function deriveVisibleTiersByPane(
  values: (number | undefined)[][][][][],
  uncertaintyValues: ChartUncertaintyTensors | undefined,
  nTiers: number,
): number[][] {
  return deriveVisibleByPane(
    values,
    uncertaintyValues,
    nTiers,
    (paneTensor, i_tier) =>
      paneTensor[i_tier].some((lane) =>
        lane.some((series) => series.some((v) => v !== undefined))
      ),
  );
}

export function deriveVisibleLanesByPane(
  values: (number | undefined)[][][][][],
  uncertaintyValues: ChartUncertaintyTensors | undefined,
  nLanes: number,
): number[][] {
  return deriveVisibleByPane(
    values,
    uncertaintyValues,
    nLanes,
    (paneTensor, i_lane) =>
      paneTensor.some((tier) =>
        tier[i_lane].some((series) => series.some((v) => v !== undefined))
      ),
  );
}

export type DataDimensions = {
  series: DataDimension | undefined;
  lane: DataDimension | undefined;
  tier: DataDimension | undefined;
  pane: DataDimension | undefined;
};

export function createEmptyValuesArray(
  nPanes: number,
  nTiers: number,
  nLanes: number,
  nSerieses: number,
  nValues: number,
): (number | undefined)[][][][][] {
  return createArray(
    nPanes,
    () =>
      createArray(
        nTiers,
        () =>
          createArray(nLanes, () =>
            createArray(nSerieses, () =>
              createArray(nValues, () => undefined))),
      ),
  );
}

// columns[i] is read into the place of valueProps[i], so a bound column fills
// its value column's member. Each place takes one row's cell: the data
// config's check refuses two rows for one value before any fill.
export function fillValues(
  values: (number | undefined)[][][][][],
  jsonArray: JsonArray,
  valueProps: string[],
  columns: string[],
  dimensions: DataDimensions,
  getLastDimensionIndex: (obj: JsonArrayItem, valueProp: string) => number,
): void {
  for (const obj of jsonArray) {
    for (const [i, valueProp] of valueProps.entries()) {
      const value = getValidNumberOrUndefined(obj[columns[i]]);

      const i_value = getLastDimensionIndex(obj, valueProp);
      const i_series = getMemberIndex(dimensions.series, valueProp, obj);
      const i_lane = getMemberIndex(dimensions.lane, valueProp, obj);
      const i_tier = getMemberIndex(dimensions.tier, valueProp, obj);
      const i_pane = getMemberIndex(dimensions.pane, valueProp, obj);

      assert(i_series >= 0);
      assert(i_lane >= 0);
      assert(i_tier >= 0);
      assert(i_pane >= 0);
      assert(i_value >= 0);

      values[i_pane][i_tier][i_lane][i_series][i_value] = value;
    }
  }
}
