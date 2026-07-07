// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureChart,
  type MergedChartOVStyle,
  type RectCoordsDims,
  type RenderContext,
  type SimplifiedChartConfig,
} from "../deps.ts";
import { getChartOVDataTransformed } from "../get_chartov_data.ts";
import type {
  ChartOVDataTransformed,
  ChartOVInputs,
  MeasuredChartOV,
} from "../types.ts";

export function measureChartOV(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: ChartOVInputs,
  fitScale?: number,
  data?: ChartOVDataTransformed,
  // Skip content-primitive generation (probe-only); see measurePane.
  layoutOnly?: boolean,
): MeasuredChartOV {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    fitScale,
  );
  const mergedStyle = customFigureStyle.getMergedChartOVStyle();
  // stacking is scale-independent, so pre-transformed data from the renderer
  // entry point is identical to transforming here.
  const transformedData = data ?? getChartOVDataTransformed(
    inputs.chartData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  const config: SimplifiedChartConfig<
    ChartOVInputs,
    ChartOVDataTransformed,
    MergedChartOVStyle
  > = {
    mergedStyle,
    transformedData,
    dataProps: {
      paneHeaders: transformedData.paneHeaders,
      tierHeaders: transformedData.tierHeaders,
      laneHeaders: transformedData.laneHeaders,
      seriesHeaders: transformedData.seriesHeaders,
      indicatorHeaders: transformedData.indicatorHeaders,
      visibleIndicatorsByPane: transformedData.visibleIndicatorsByPane,
      visibleLanesByPane: transformedData.visibleLanesByPane,
      visibleIndicatorsByPaneBand: transformedData.visibleIndicatorsByPaneBand,
      proportionalPanes: transformedData.proportionalPanes,
    },
    xAxisConfig: {
      type: "text",
      indicatorHeaders: transformedData.indicatorHeaders,
      axisStyle: mergedStyle.xTextAxis,
    },
    yAxisConfig: {
      type: "scale",
      axisStyle: mergedStyle.yScaleAxis,
      axisData: transformedData.scaleAxisLimits,
      axisLabel: transformedData.yScaleAxisLabel,
    },
    orientation: "vertical",
  };

  return measureChart(
    rc,
    rcdWithSurrounds,
    inputs,
    config,
    fitScale,
    layoutOnly,
  );
}
