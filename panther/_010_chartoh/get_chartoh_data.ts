// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartOVOrOHTransformSpec,
  type DataConfigIssue,
  getChartOVOrOHDataConfigIssues,
  type JsonArray,
  transformChartOVOrOHJson,
} from "./deps.ts";
import {
  type ChartOHData,
  type ChartOHDataJson,
  type ChartOHDataTransformed,
  type ChartOHJsonDataConfig,
  isChartOHDataJson,
  isChartOHDataTransformed,
} from "./types.ts";

const CHART_OH_SPEC: ChartOVOrOHTransformSpec = { tierOrLaneDimension: "tier" };

export function getChartOHDataConfigIssues(
  data: ChartOHDataJson,
): DataConfigIssue[] {
  return getChartOVOrOHDataConfigIssues(
    data.jsonArray,
    data.jsonDataConfig,
    CHART_OH_SPEC,
  );
}

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
    visibleTiersOrLanesByPane,
    visibleIndicatorsByPaneTierOrLane,
    proportionalPanes,
    ...core
  } = transformChartOVOrOHJson(
    jsonArray,
    jsonDataConfig,
    stacked,
    CHART_OH_SPEC,
  );
  return {
    ...core,
    xValueAxisLabel: jsonDataConfig.xValueAxisLabel?.trim(),
    visibleIndicatorsByPane,
    visibleTiersByPane: visibleTiersOrLanesByPane,
    visibleIndicatorsByPaneTier: visibleIndicatorsByPaneTierOrLane,
    proportionalPanes,
  };
}
