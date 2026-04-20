// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureChart,
  type MergedTimeseriesStyle,
  type RectCoordsDims,
  type RenderContext,
  type SimplifiedChartConfig,
} from "../deps.ts";
import { getTimeseriesDataTransformed } from "../get_timeseries_data.ts";
import type {
  MeasuredTimeseries,
  TimeseriesDataTransformed,
  TimeseriesInputs,
} from "../types.ts";

export function measureTimeseries(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: TimeseriesInputs,
  responsiveScale?: number,
): MeasuredTimeseries {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
  );
  const mergedStyle = customFigureStyle.getMergedTimeseriesStyle();
  const transformedData = getTimeseriesDataTransformed(
    inputs.timeseriesData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  const config: SimplifiedChartConfig<
    TimeseriesInputs,
    TimeseriesDataTransformed,
    MergedTimeseriesStyle
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
      type: "period",
      periodType: transformedData.periodType,
      nTimePoints: transformedData.nTimePoints,
      timeMin: transformedData.timeMin,
      axisStyle: mergedStyle.xPeriodAxis,
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
