// Copyright 2023-2025, Tim Roberton, All rights reserved.
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
  responsiveScale?: number,
): MeasuredChartOH {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
  );
  const mergedStyle = customFigureStyle.getMergedChartOHStyle();
  const transformedData = getChartOHDataTransformed(
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

  return measureChart(rc, rcdWithSurrounds, inputs, config, responsiveScale);
}
