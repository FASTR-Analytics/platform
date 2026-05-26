// Copyright 2023-2025, Tim Roberton, All rights reserved.
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

export function collectHeaders(
  jsonArray: JsonArray,
  prop: string | undefined,
  valueProps: string[],
  defaultValue: string = "default",
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
