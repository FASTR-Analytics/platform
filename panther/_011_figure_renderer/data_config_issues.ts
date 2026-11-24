// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DataConfigIssue,
  getChartOHDataConfigIssues,
  getChartOVDataConfigIssues,
  getMapDataConfigIssues,
  getPieDataConfigIssues,
  getTableDataConfigIssues,
  getTimeseriesDataConfigIssues,
  isChartOHDataJson,
  isChartOVDataJson,
  isPieDataTransformed,
  isTableDataJson,
  isTimeseriesDataJson,
} from "./deps.ts";
import type { FigureInputs } from "./figure_renderer.ts";

// Transformed data, a scene and a diagram have no data config, so none.
export function getDataConfigIssues(inputs: FigureInputs): DataConfigIssue[] {
  switch (inputs.figureType) {
    case "chart-ov":
      return isChartOVDataJson(inputs.data)
        ? getChartOVDataConfigIssues(inputs.data)
        : [];
    case "chart-oh":
      return isChartOHDataJson(inputs.data)
        ? getChartOHDataConfigIssues(inputs.data)
        : [];
    case "timeseries":
      return isTimeseriesDataJson(inputs.data)
        ? getTimeseriesDataConfigIssues(inputs.data)
        : [];
    case "pie":
      return isPieDataTransformed(inputs.data)
        ? []
        : getPieDataConfigIssues(inputs.data);
    case "map":
      return "isTransformed" in inputs.data
        ? []
        : getMapDataConfigIssues(inputs.data);
    case "table":
      return isTableDataJson(inputs.data)
        ? getTableDataConfigIssues(inputs.data)
        : [];
    case "scene":
    case "diagram":
      return [];
    default: {
      const _exhaustive: never = inputs;
      throw new Error("Unknown figure type");
    }
  }
}
