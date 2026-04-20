// Copyright 2023-2025, Tim Roberton, All rights reserved.
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
  responsiveScale?: number,
): MeasuredChartOV {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
  );
  const mergedStyle = customFigureStyle.getMergedChartOVStyle();
  const transformedData = getChartOVDataTransformed(
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

  return measureChart(rc, rcdWithSurrounds, inputs, config, responsiveScale);
}
