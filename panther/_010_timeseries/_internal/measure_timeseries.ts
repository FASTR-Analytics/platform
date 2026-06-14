// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  fitScale?: number,
  data?: TimeseriesDataTransformed,
  // Skip content-primitive generation (probe-only); see measurePane.
  layoutOnly?: boolean,
): MeasuredTimeseries {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    fitScale,
  );
  const mergedStyle = customFigureStyle.getMergedTimeseriesStyle();
  // stacking is scale-independent, so pre-transformed data from the renderer
  // entry point is identical to transforming here.
  const transformedData = data ?? getTimeseriesDataTransformed(
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

  return measureChart(
    rc,
    rcdWithSurrounds,
    inputs,
    config,
    fitScale,
    layoutOnly,
  );
}
