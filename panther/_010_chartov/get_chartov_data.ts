// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JsonArray, transformChartOVOrOHJson } from "./deps.ts";
import {
  type ChartOVData,
  type ChartOVDataTransformed,
  type ChartOVJsonDataConfig,
  isChartOVDataJson,
  isChartOVDataTransformed,
} from "./types.ts";

export function getChartOVDataTransformed(
  d: ChartOVData,
  stacked: boolean,
): ChartOVDataTransformed {
  if (isChartOVDataTransformed(d)) {
    return d;
  }

  if (isChartOVDataJson(d)) {
    return getChartOVDataJsonTransformed(
      d.jsonArray,
      d.jsonDataConfig,
      stacked,
    );
  }

  // TypeScript exhaustiveness check
  const _exhaustive: never = d;
  throw new Error(`Unhandled chart data type: ${_exhaustive}`);
}

export function getChartOVDataJsonTransformed(
  jsonArray: JsonArray,
  jsonDataConfig: ChartOVJsonDataConfig,
  stacked: boolean,
): ChartOVDataTransformed {
  const {
    visibleIndicatorsByPane,
    visibleTiersOrLanesByPane,
    visibleIndicatorsByPaneTierOrLane,
    proportionalPanes,
    ...core
  } = transformChartOVOrOHJson(jsonArray, jsonDataConfig, stacked, {
    figureName: "ChartOV",
    tierOrLaneDimension: "lane",
  });
  return {
    ...core,
    yValueAxisLabel: jsonDataConfig.yValueAxisLabel?.trim(),
    visibleIndicatorsByPane,
    visibleLanesByPane: visibleTiersOrLanesByPane,
    visibleIndicatorsByPaneLane: visibleIndicatorsByPaneTierOrLane,
    proportionalPanes,
  };
}
