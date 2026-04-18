// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Transforms raw JSON data into multi-dimensional value arrays for chart rendering
import {
  assert,
  createArray,
  getValidNumberOrUndefined,
  sortAlphabetical,
  sum,
} from "./deps.ts";
import { withAnyLabelReplacement } from "./with_any_label_replacement.ts";
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
  headers: string[],
): number {
  if (!prop) return 0;
  if (prop === "--v") return headers.indexOf(valueProp);
  return headers.indexOf(String(obj[prop]));
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

export function createSortFunction(
  sortHeaders: boolean | string[],
  labelReplacements?: Record<string, string>,
): (a: string, b: string) => number {
  if (Array.isArray(sortHeaders)) {
    return (a: string, b: string) => {
      const aReplaced = labelReplacements?.[a] ?? a;
      const bReplaced = labelReplacements?.[b] ?? b;
      const aIndex = sortHeaders.indexOf(aReplaced);
      const bIndex = sortHeaders.indexOf(bReplaced);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      return aReplaced.localeCompare(bReplaced);
    };
  } else {
    return (a: string, b: string) => {
      const aReplaced = labelReplacements?.[a] ?? a;
      const bReplaced = labelReplacements?.[b] ?? b;
      return aReplaced.localeCompare(bReplaced);
    };
  }
}

export function sortByCustomOrder(
  headers: string[],
  customOrder: string[],
): void {
  // Create a mapping of headers to their preferred order
  const orderMap = new Map<string, number>();

  headers.forEach((header) => {
    // Check if header is in the custom order
    const index = customOrder.indexOf(header);
    // Use the found index, or default to end if not found
    const priority = index !== -1 ? index : customOrder.length;
    orderMap.set(header, priority);
  });

  // Sort using the priority map, with alphabetical as secondary sort
  headers.sort((a, b) => {
    const priorityA = orderMap.get(a)!;
    const priorityB = orderMap.get(b)!;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Secondary alphabetical sort for items with same priority
    return a.localeCompare(b);
  });
}

export function sortHeadersIfNeeded(
  headers: ProcessedHeaders & { [key: string]: string[] },
  sortHeaders: boolean | string[] | undefined,
): void {
  if (sortHeaders) {
    if (Array.isArray(sortHeaders)) {
      // Custom sort order
      sortByCustomOrder(headers.series, sortHeaders);
      sortByCustomOrder(headers.lane, sortHeaders);
      sortByCustomOrder(headers.tier, sortHeaders);
      sortByCustomOrder(headers.cell, sortHeaders);
      // Sort any additional dimension headers
      for (const key of Object.keys(headers)) {
        if (!["series", "lane", "tier", "cell"].includes(key)) {
          sortByCustomOrder(headers[key], sortHeaders);
        }
      }
    } else {
      // Alphabetical sort
      sortAlphabetical(headers.series);
      sortAlphabetical(headers.lane);
      sortAlphabetical(headers.tier);
      sortAlphabetical(headers.cell);
      // Sort any additional dimension headers
      for (const key of Object.keys(headers)) {
        if (!["series", "lane", "tier", "cell"].includes(key)) {
          sortAlphabetical(headers[key]);
        }
      }
    }
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

export interface CommonDataTransformConfig {
  jsonArray: JsonArray;
  valueProps: string[];
  seriesProp?: string;
  laneProp?: string;
  tierProp?: string;
  paneProp?: string;
  sortHeaders?: boolean;
  labelReplacements?: Record<string, string>;
  stacked: boolean;
}

export interface ProcessedHeaders {
  series: string[];
  lane: string[];
  tier: string[];
  pane: string[];
}

export function processCommonHeaders(
  config: CommonDataTransformConfig,
): ProcessedHeaders {
  const headers: ProcessedHeaders = {
    series: collectHeaders(
      config.jsonArray,
      config.seriesProp,
      config.valueProps,
    ),
    lane: collectHeaders(config.jsonArray, config.laneProp, config.valueProps),
    tier: collectHeaders(config.jsonArray, config.tierProp, config.valueProps),
    pane: collectHeaders(config.jsonArray, config.paneProp, config.valueProps),
  };

  // Check for --v assignment
  checkValuePropsAssignment(config.valueProps, {
    seriesProp: config.seriesProp,
    laneProp: config.laneProp,
    tierProp: config.tierProp,
    paneProp: config.paneProp,
  });

  // Sort if needed
  sortHeadersIfNeeded(
    headers as ProcessedHeaders & { [key: string]: string[] },
    config.sortHeaders,
  );

  return headers;
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

export function applyLabelReplacements<T extends { [key: string]: string[] }>(
  headers: T,
  labelReplacements: Record<string, string> | undefined,
): T {
  if (!labelReplacements) return headers;

  const result = {} as T;
  for (const [key, headerArray] of Object.entries(headers)) {
    result[key as keyof T] = withAnyLabelReplacement(
      headerArray,
      labelReplacements,
    ) as T[keyof T];
  }
  return result;
}
