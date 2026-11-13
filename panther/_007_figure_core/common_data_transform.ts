// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Transforms raw JSON data into multi-dimensional value arrays for chart rendering
import {
  assert,
  BLANK_SENTINEL,
  compareBlankLast,
  createArray,
  createDimensionMembers,
  type DataDimension,
  type DimensionMember,
  getValidNumberOrUndefined,
  isBlankValue,
  type MemberSortConfig,
  sortDimensionMembers,
  sum,
} from "./deps.ts";
import type {
  ChartValueAxisLimits,
  ChartValueAxisPaneLimits,
  JsonArray,
  JsonArrayItem,
} from "./types.ts";

export function validateDataInput(
  jsonArray: JsonArray,
  valueProps: string[],
): void {
  if (jsonArray.length === 0) {
    throw new Error("Need at least one row");
  }
  if (valueProps.length === 0) {
    throw new Error("Need at least one valueProp");
  }
}

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

export function validateDimensionProps(
  jsonArray: JsonArray,
  dimensionProps: Record<string, string | undefined>,
): void {
  validateDistinctDimensions(dimensionProps);
  Object.values(dimensionProps).forEach((prop) =>
    validateDimensionPresent(jsonArray, prop)
  );
}

// A prop that no row carries is a misspelling, never a column of blanks.
function validateDimensionPresent(
  jsonArray: JsonArray,
  prop: string | undefined,
): void {
  if (prop === undefined || prop === "--v" || jsonArray.length === 0) {
    return;
  }
  if (!jsonArray.some((row) => Object.hasOwn(row, prop))) {
    throw new Error(`No row has dimension "${prop}"`);
  }
}

function collectDimensionIds(jsonArray: JsonArray, prop: string): string[] {
  return [...new Set(jsonArray.map((row) => getDimensionId(row, prop)))];
}

function validateDistinctDimensions(
  dimensionProps: Record<string, string | undefined>,
): void {
  const propByDimension = new Map<string, string>();
  for (const [key, dimension] of Object.entries(dimensionProps)) {
    if (dimension === undefined) {
      continue;
    }
    const prop = `${key}Prop`;
    const other = propByDimension.get(dimension);
    if (other !== undefined) {
      throw new Error(
        `${other} and ${prop} are both given dimension "${dimension}"`,
      );
    }
    propByDimension.set(dimension, prop);
  }
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

export function checkValuePropsAssignment(
  valueProps: string[],
  props: {
    [key: string]: string | undefined;
  },
): void {
  const hasVAssignment = Object.values(props).some((prop) => prop === "--v");
  if (!hasVAssignment && valueProps.length > 1) {
    throw new Error("Missing --v assignment");
  }
}

export function calculateChartValueAxisLimits(
  values: (number | undefined)[][][][][],
  counts: {
    nPanes: number;
    nTiers: number;
    nLanes: number;
    nSerieses: number;
    nValues: number;
  },
  stacked: boolean,
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

  for (let i_pane = 0; i_pane < counts.nPanes; i_pane++) {
    for (let i_tier = 0; i_tier < counts.nTiers; i_tier++) {
      for (let i_lane = 0; i_lane < counts.nLanes; i_lane++) {
        if (stacked) {
          for (
            let i_value = 0;
            i_value < counts.nValues;
            i_value++
          ) {
            const valuesToSum = values[i_pane][i_tier][i_lane]
              .map((s) => s[i_value])
              .filter((v): v is number => v !== undefined);

            if (valuesToSum.length === 0) continue;

            const value = sum(valuesToSum);
            if (value === undefined) continue;

            updateLimits(paneLimits, i_pane, i_tier, i_lane, value);
          }
        } else {
          for (
            let i_series = 0;
            i_series < counts.nSerieses;
            i_series++
          ) {
            for (
              let i_value = 0;
              i_value < counts.nValues;
              i_value++
            ) {
              const value = values[i_pane][i_tier][i_lane][i_series][i_value];

              if (value === undefined) continue;

              updateLimits(paneLimits, i_pane, i_tier, i_lane, value);
            }
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

// Early-throw validation for a chart's `membership` config. Raggedness is
// allowed only along the categorical (text-axis) direction; the scale
// direction stays balanced (see DOC_FIGURE_ARCHITECTURE / the membership
// model). The zod path strips unknown keys and the TS types don't declare
// them, so this transform-level check is the single authoritative gate for
// JSON-sourced configs.
export function validateChartMembership(
  membership: Record<string, unknown> | undefined,
  allowedDimensions: string[],
  valueDirectionDimension: string,
  chartName: string,
): void {
  if (!membership) {
    return;
  }
  for (const [key, value] of Object.entries(membership)) {
    if (!allowedDimensions.includes(key)) {
      if (key === valueDirectionDimension) {
        throw new Error(
          `membership.${key} is not allowed on ${chartName}: "${key}" carries the value axis limits, and raggedness applies only along the categorical (text-axis) direction`,
        );
      }
      throw new Error(
        `Unknown membership dimension "${key}" on ${chartName} (allowed: ${
          allowedDimensions.join(", ")
        })`,
      );
    }
    if (value !== undefined && value !== "balanced" && value !== "unbalanced") {
      throw new Error(
        `Invalid membership value for "${key}" on ${chartName}: expected "balanced" or "unbalanced"`,
      );
    }
  }
}

// Early-throw validation for a chart's `proportional` config (ragged-table
// layout). `lanes` (chart-ov) or `tiers` (chart-oh) sizes each tier or lane by
// its visible slot count (per-tier-or-lane visibility implied); `panes`
// additionally makes pane extents proportional so slot thickness is uniform
// across the whole chart. `panes` presupposes the tier-or-lane key, so a bare
// { panes: true } normalizes to both on (the caller reads the flags via
// resolveChartProportional) and the explicit contradiction
// { lanes: false, panes: true } throws here.
export function validateChartProportional(
  proportional: Record<string, unknown> | undefined,
  tierOrLaneKey: "tiers" | "lanes",
  chartName: string,
): void {
  if (!proportional) {
    return;
  }
  for (const [key, value] of Object.entries(proportional)) {
    if (key !== tierOrLaneKey && key !== "panes") {
      throw new Error(
        `Unknown proportional key "${key}" on ${chartName} (allowed: ${tierOrLaneKey}, panes)`,
      );
    }
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(
        `Invalid proportional value for "${key}" on ${chartName}: expected a boolean`,
      );
    }
  }
  if (proportional[tierOrLaneKey] === false && proportional.panes === true) {
    throw new Error(
      `Invalid proportional config on ${chartName}: panes: true requires ${tierOrLaneKey} (cross-pane proportional sizing presupposes proportional ${tierOrLaneKey})`,
    );
  }
}

// Effective proportional flags after normalization (panes implies the
// tier-or-lane key).
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
// transform reads it; validateChartProportional rejects the other figure's key.
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

function sumDefined(cells: (number | undefined)[][], i: number): number {
  return cells.reduce((acc, series) => acc + (series[i] ?? 0), 0);
}

// A value sort keys on the sum over every series and every tier-or-lane member
// (lanes on OV, tiers on OH: the members that share one scale), at member 0
// of the value-direction dimension, whose members carry their own limits and so
// cannot be summed. The sort is a presentation order on the masks; storage
// and the members keep sort.indicator order.
export function orderVisibleByPane(
  visibleByPane: number[][],
  values: (number | undefined)[][][][][],
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
        tierOrLaneCells.reduce((acc, cells) => acc + sumDefined(cells, i), 0),
      direction,
    );
  });
}

export function orderVisibleByPaneTierOrLane(
  visibleByPaneTierOrLane: number[][][],
  values: (number | undefined)[][][][][],
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
        (i) => sumDefined(cells, i),
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

export function fillValuesWithDuplicateCheck(
  values: (number | undefined)[][][][][],
  jsonArray: JsonArray,
  valueProps: string[],
  dimensions: DataDimensions,
  getLastDimensionIndex: (obj: JsonArrayItem, valueProp: string) => number,
): void {
  for (const obj of jsonArray) {
    for (const valueProp of valueProps) {
      const value = getValidNumberOrUndefined(obj[valueProp]);

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

      if (values[i_pane][i_tier][i_lane][i_series][i_value] !== undefined) {
        throw new Error("Duplicate values");
      }

      values[i_pane][i_tier][i_lane][i_series][i_value] = value;
    }
  }
}
