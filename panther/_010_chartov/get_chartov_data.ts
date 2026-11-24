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
  type ChartOVData,
  type ChartOVDataJson,
  type ChartOVDataTransformed,
  type ChartOVJsonDataConfig,
  isChartOVDataJson,
  isChartOVDataTransformed,
} from "./types.ts";

const CHART_OV_SPEC: ChartOVOrOHTransformSpec = { tierOrLaneDimension: "lane" };

export function getChartOVDataConfigIssues(
  data: ChartOVDataJson,
): DataConfigIssue[] {
  return getChartOVOrOHDataConfigIssues(
    data.jsonArray,
    data.jsonDataConfig,
    CHART_OV_SPEC,
  );
}

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
  } = transformChartOVOrOHJson(
    jsonArray,
    jsonDataConfig,
    stacked,
    CHART_OV_SPEC,
  );
  return {
    ...core,
    yValueAxisLabel: jsonDataConfig.yValueAxisLabel?.trim(),
    visibleIndicatorsByPane,
    visibleLanesByPane: visibleTiersOrLanesByPane,
    visibleIndicatorsByPaneLane: visibleIndicatorsByPaneTierOrLane,
    proportionalPanes,
  };
}
