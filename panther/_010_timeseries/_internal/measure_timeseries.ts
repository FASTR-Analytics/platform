// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureChart,
  type MergedTimeseriesStyle,
  type PaneGrid,
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
  paneGrid: PaneGrid,
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
    inputs.data,
    mergedStyle.content.bars.stacking === "stacked",
  );

  const config: SimplifiedChartConfig<
    TimeseriesInputs,
    TimeseriesDataTransformed,
    MergedTimeseriesStyle
  > = {
    mergedStyle,
    transformedData,
    dataDimensions: {
      pane: transformedData.pane,
      tier: transformedData.tier,
      lane: transformedData.lane,
      series: transformedData.series,
    },
    xAxisConfig: {
      type: "period",
      dimension: transformedData.period.name,
      periodType: transformedData.period.periodType,
      nTimePoints: transformedData.period.nTimePoints,
      timeMin: transformedData.period.timeMin,
      axisStyle: mergedStyle.xPeriodAxis,
    },
    yAxisConfig: {
      type: "value",
      axisStyle: mergedStyle.yValueAxis,
      axisData: transformedData.valueAxisLimits,
      axisLabel: transformedData.yValueAxisLabel,
    },
    orientation: "vertical",
    paneGrid,
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
