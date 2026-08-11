// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JsonArray, transformOneWayChartJson } from "./deps.ts";
import {
  type ChartOHData,
  type ChartOHDataTransformed,
  type ChartOHJsonDataConfig,
  isChartOHDataJson,
  isChartOHDataTransformed,
} from "./types.ts";

export function getChartOHDataTransformed(
  d: ChartOHData,
  stacked: boolean,
): ChartOHDataTransformed {
  if (isChartOHDataTransformed(d)) {
    return d;
  }

  if (isChartOHDataJson(d)) {
    return getChartOHDataJsonTransformed(
      d.jsonArray,
      d.jsonDataConfig,
      stacked,
    );
  }

  const _exhaustive: never = d;
  throw new Error(`Unhandled chart data type: ${_exhaustive}`);
}

export function getChartOHDataJsonTransformed(
  jsonArray: JsonArray,
  jsonDataConfig: ChartOHJsonDataConfig,
  stacked: boolean,
): ChartOHDataTransformed {
  const {
    visibleIndicatorsByPane,
    visibleBandAxisByPane,
    visibleIndicatorsByPaneBand,
    proportionalPanes,
    ...core
  } = transformOneWayChartJson(jsonArray, jsonDataConfig, stacked, {
    figureName: "ChartOH",
    bandAxis: "tier",
  });
  return {
    ...core,
    xScaleAxisLabel: jsonDataConfig.xScaleAxisLabel?.trim(),
    visibleIndicatorsByPane,
    visibleTiersByPane: visibleBandAxisByPane,
    visibleIndicatorsByPaneBand,
    proportionalPanes,
  };
}
