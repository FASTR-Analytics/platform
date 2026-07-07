// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureChart,
  type MergedChartOHStyle,
  type RectCoordsDims,
  type RenderContext,
  type SimplifiedChartConfig,
} from "../deps.ts";
import { getChartOHDataTransformed } from "../get_chartoh_data.ts";
import type {
  ChartOHDataTransformed,
  ChartOHInputs,
  MeasuredChartOH,
} from "../types.ts";

export function measureChartOH(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: ChartOHInputs,
  fitScale?: number,
  data?: ChartOHDataTransformed,
  // Skip content-primitive generation (probe-only); see measurePane.
  layoutOnly?: boolean,
): MeasuredChartOH {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    fitScale,
  );
  const mergedStyle = customFigureStyle.getMergedChartOHStyle();
  // stacking is scale-independent, so pre-transformed data from the renderer
  // entry point is identical to transforming here.
  const transformedData = data ?? getChartOHDataTransformed(
    inputs.chartOHData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  const config: SimplifiedChartConfig<
    ChartOHInputs,
    ChartOHDataTransformed,
    MergedChartOHStyle
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
      visibleTiersByPane: transformedData.visibleTiersByPane,
    },
    xAxisConfig: {
      type: "scale",
      axisStyle: mergedStyle.xScaleAxis,
      axisData: transformedData.scaleAxisLimits,
      axisLabel: transformedData.xScaleAxisLabel,
    },
    yAxisConfig: {
      type: "text",
      indicatorHeaders: transformedData.indicatorHeaders,
      axisStyle: mergedStyle.yTextAxis,
    },
    orientation: "horizontal",
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
