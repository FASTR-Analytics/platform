// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Transforms raw JSON data into multi-dimensional value arrays for chart rendering
import {
  assert,
  createArray,
  getValidNumberOrUndefined,
  type HeaderItem,
  sum,
} from "./deps.ts";
import type {
  ChartScaleAxisLimits,
  ChartScaleAxisPaneLimits,
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

// The sentinel header id/label collectHeaders emits for an axis with no
// disaggregation configured (prop undefined) — a single implicit member
// standing in for "all data, undivided" on that axis.
export const NO_DISAGGREGATION_HEADER_ID = "default";

export function collectHeaders(
  jsonArray: JsonArray,
  prop: string | undefined,
  valueProps: string[],
  defaultValue: string = NO_DISAGGREGATION_HEADER_ID,
): string[] {
  const headers: string[] = prop ? [] : [defaultValue];

  for (const obj of jsonArray) {
    if (prop && prop !== "--v" && !headers.includes(String(obj[prop]))) {
      headers.push(String(obj[prop]));
    }
  }

  if (prop === "--v") {
    headers.push(...valueProps);
  }

  return headers;
}

export function getHeaderIndex(
  prop: string | undefined,
  valueProp: string,
  obj: JsonArrayItem,
  headers: HeaderItem[],
): number {
  if (!prop) return 0;
  if (prop === "--v") return headers.findIndex((h) => h.id === valueProp);
  return headers.findIndex((h) => h.id === String(obj[prop]));
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

export function calculateChartScaleLimits(
  values: (number | undefined)[][][][][],
  dimensions: {
    paneCount: number;
    tierCount: number;
    laneCount: number;
    seriesCount: number;
    lastDimCount: number;
  },
  stacked: boolean,
): ChartScaleAxisLimits {
  const paneLimits: ChartScaleAxisPaneLimits[] = createArray(
    dimensions.paneCount,
    () => ({
      valueMin: Number.POSITIVE_INFINITY,
      valueMax: Number.NEGATIVE_INFINITY,
      tierLimits: createArray(dimensions.tierCount, () => ({
        valueMin: Number.POSITIVE_INFINITY,
        valueMax: Number.NEGATIVE_INFINITY,
      })),
      laneLimits: createArray(dimensions.laneCount, () => ({
        valueMin: Number.POSITIVE_INFINITY,
        valueMax: Number.NEGATIVE_INFINITY,
      })),
    }),
  );

  for (let i_pane = 0; i_pane < dimensions.paneCount; i_pane++) {
    for (let i_tier = 0; i_tier < dimensions.tierCount; i_tier++) {
      for (let i_lane = 0; i_lane < dimensions.laneCount; i_lane++) {
        if (stacked) {
          for (
            let i_lastDim = 0;
            i_lastDim < dimensions.lastDimCount;
            i_lastDim++
          ) {
            const valuesToSum = values[i_pane][i_tier][i_lane]
              .map((s) => s[i_lastDim])
              .filter((v): v is number => v !== undefined);

            if (valuesToSum.length === 0) continue;

            const value = sum(valuesToSum);
            if (value === undefined) continue;

            updateLimits(paneLimits, i_pane, i_tier, i_lane, value);
          }
        } else {
          for (
            let i_series = 0;
            i_series < dimensions.seriesCount;
            i_series++
          ) {
            for (
              let i_lastDim = 0;
              i_lastDim < dimensions.lastDimCount;
              i_lastDim++
            ) {
              const value = values[i_pane][i_tier][i_lane][i_series][i_lastDim];

              if (value === undefined) continue;

              updateLimits(paneLimits, i_pane, i_tier, i_lane, value);
            }
          }
        }
      }
    }
  }

  // Fallback to 0..1 where a pane/tier/lane had no data.
  for (let i_pane = 0; i_pane < dimensions.paneCount; i_pane++) {
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
  paneLimits: ChartScaleAxisPaneLimits[],
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
  allowedAxes: string[],
  scaleDirectionAxis: string,
  chartName: string,
): void {
  if (!membership) {
    return;
  }
  for (const [key, value] of Object.entries(membership)) {
    if (!allowedAxes.includes(key)) {
      if (key === scaleDirectionAxis) {
        throw new Error(
          `membership.${key} is not allowed on ${chartName}: "${key}" carries the scale limits, and raggedness applies only along the categorical (text-axis) direction`,
        );
      }
      throw new Error(
        `Unknown membership axis "${key}" on ${chartName} (allowed: ${
          allowedAxes.join(", ")
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
// layout). `bands` sizes each band by its visible slot count (per-band
// visibility implied); `panes` additionally makes pane extents proportional
// so slot thickness is uniform across the whole chart. `panes` presupposes
// `bands`, so a bare { panes: true } normalizes to both on (the caller reads
// the flags via resolveChartProportional) and the explicit contradiction
// { bands: false, panes: true } throws here.
export function validateChartProportional(
  proportional: Record<string, unknown> | undefined,
  chartName: string,
): void {
  if (!proportional) {
    return;
  }
  for (const [key, value] of Object.entries(proportional)) {
    if (key !== "bands" && key !== "panes") {
      throw new Error(
        `Unknown proportional key "${key}" on ${chartName} (allowed: bands, panes)`,
      );
    }
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(
        `Invalid proportional value for "${key}" on ${chartName}: expected a boolean`,
      );
    }
  }
  if (proportional.bands === false && proportional.panes === true) {
    throw new Error(
      `Invalid proportional config on ${chartName}: panes: true requires bands (cross-pane proportional sizing presupposes per-band extents)`,
    );
  }
}

// Effective proportional flags after normalization (panes implies bands).
export function resolveChartProportional(
  proportional: { bands?: boolean; panes?: boolean } | undefined,
): { bands: boolean; panes: boolean } {
  const panes = proportional?.panes === true;
  return { bands: proportional?.bands === true || panes, panes };
}

// Per-pane visible subsets for unbalanced membership, shared by the
// indicator/tier/lane derivations. An axis member is visible in a pane iff
// ANY cell for it has a defined value OR a defined uncertainty bound (a
// member with bounds but no point estimate must still render its bounds).
// Indices are in global sorted order — call this on the FINAL arrays, after
// any sortIndicatorValues reorder.
type PaneTensor = (number | undefined)[][][][]; // [tier][lane][series][indicator]
type ChartBoundsTensors = {
  ub: (number | undefined)[][][][][];
  lb: (number | undefined)[][][][][];
};

function deriveVisibleByPane(
  values: (number | undefined)[][][][][],
  bounds: ChartBoundsTensors | undefined,
  n: number,
  memberHasDefined: (paneTensor: PaneTensor, i: number) => boolean,
): number[][] {
  const tensors = bounds ? [values, bounds.ub, bounds.lb] : [values];
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
  bounds: ChartBoundsTensors | undefined,
  nIndicators: number,
): number[][] {
  return deriveVisibleByPane(
    values,
    bounds,
    nIndicators,
    (paneTensor, i_indicator) =>
      paneTensor.some((tier) =>
        tier.some((lane) =>
          lane.some((series) => series[i_indicator] !== undefined)
        )
      ),
  );
}

// Per-(pane, band) visible indicator subsets for proportional band layout.
// The band axis is the categorical band direction: tiers on ChartOH, lanes
// on ChartOV. Visibility unions across the scale-direction dim + series
// (lanes+series per tier on OH; tiers+series per lane on OV), scanning
// values AND bounds — same rule as the per-pane masks. Returned arrays are
// indexed [pane][GLOBAL band index][visible global indicator indices]; a
// band with no data in a pane gets [] and is dropped for that pane by the
// geometry (never asserted against — it is legitimate data). Call on the
// FINAL arrays, after any sortIndicatorValues reorder.
export function deriveVisibleIndicatorsByPaneBand(
  values: (number | undefined)[][][][][],
  bounds: ChartBoundsTensors | undefined,
  nIndicators: number,
  bandAxis: "tier" | "lane",
): number[][][] {
  const tensors = bounds ? [values, bounds.ub, bounds.lb] : [values];
  return values.map((paneTensor, i_pane) => {
    const nBands = bandAxis === "tier"
      ? paneTensor.length
      : (paneTensor[0]?.length ?? 0);
    const bands: number[][] = [];
    for (let i_band = 0; i_band < nBands; i_band++) {
      const visible: number[] = [];
      for (let i = 0; i < nIndicators; i++) {
        const hasDefined = tensors.some((tensor) => {
          const pt = tensor[i_pane];
          if (bandAxis === "tier") {
            return pt[i_band].some((lane) =>
              lane.some((series) => series[i] !== undefined)
            );
          }
          return pt.some((tier) =>
            tier[i_band].some((series) => series[i] !== undefined)
          );
        });
        if (hasDefined) {
          visible.push(i);
        }
      }
      bands.push(visible);
    }
    return bands;
  });
}

export function deriveVisibleTiersByPane(
  values: (number | undefined)[][][][][],
  bounds: ChartBoundsTensors | undefined,
  nTiers: number,
): number[][] {
  return deriveVisibleByPane(
    values,
    bounds,
    nTiers,
    (paneTensor, i_tier) =>
      paneTensor[i_tier].some((lane) =>
        lane.some((series) => series.some((v) => v !== undefined))
      ),
  );
}

export function deriveVisibleLanesByPane(
  values: (number | undefined)[][][][][],
  bounds: ChartBoundsTensors | undefined,
  nLanes: number,
): number[][] {
  return deriveVisibleByPane(
    values,
    bounds,
    nLanes,
    (paneTensor, i_lane) =>
      paneTensor.some((tier) =>
        tier[i_lane].some((series) => series.some((v) => v !== undefined))
      ),
  );
}

export interface ProcessedHeaders {
  series: HeaderItem[];
  lane: HeaderItem[];
  tier: HeaderItem[];
  pane: HeaderItem[];
}

export function fillValuesWithDuplicateCheck(
  values: (number | undefined)[][][][][],
  jsonArray: JsonArray,
  valueProps: string[],
  headers: ProcessedHeaders,
  props: {
    seriesProp?: string;
    laneProp?: string;
    tierProp?: string;
    paneProp?: string;
  },
  getLastDimensionIndex: (obj: JsonArrayItem, valueProp: string) => number,
): void {
  for (const obj of jsonArray) {
    for (const valueProp of valueProps) {
      const value = getValidNumberOrUndefined(obj[valueProp]);

      const i_lastDim = getLastDimensionIndex(obj, valueProp);
      const i_series = getHeaderIndex(
        props.seriesProp,
        valueProp,
        obj,
        headers.series,
      );
      const i_lane = getHeaderIndex(
        props.laneProp,
        valueProp,
        obj,
        headers.lane,
      );
      const i_tier = getHeaderIndex(
        props.tierProp,
        valueProp,
        obj,
        headers.tier,
      );
      const i_pane = getHeaderIndex(
        props.paneProp,
        valueProp,
        obj,
        headers.pane,
      );

      assert(i_series >= 0);
      assert(i_lane >= 0);
      assert(i_tier >= 0);
      assert(i_pane >= 0);
      assert(i_lastDim >= 0);

      if (values[i_pane][i_tier][i_lane][i_series][i_lastDim] !== undefined) {
        throw new Error("Duplicate values");
      }

      values[i_pane][i_tier][i_lane][i_series][i_lastDim] = value;
    }
  }
}
