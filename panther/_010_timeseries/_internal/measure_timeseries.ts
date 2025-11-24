// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateChartPrimitives,
  generateSurroundsPrimitives,
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
  // Pre-compute values
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
  );
  const mergedStyle = customFigureStyle.getMergedTimeseriesStyle();
  const transformedData = getTimeseriesDataTransformed(
    inputs.timeseriesData,
    mergedStyle.content.bars.stacking === "stacked",
  );

  const dataProps = {
    paneHeaders: transformedData.paneHeaders,
    laneHeaders: transformedData.laneHeaders,
    seriesHeaders: transformedData.seriesHeaders,
    yScaleAxisData: transformedData.yScaleAxisData,
  };

  const styleProps = {
    hideColHeaders: mergedStyle.hideColHeaders,
    panes: mergedStyle.panes,
    text: { paneHeaders: mergedStyle.text.paneHeaders },
    yScaleAxis: mergedStyle.yScaleAxis,
    grid: mergedStyle.grid,
    content: { bars: { stacking: mergedStyle.content.bars.stacking } },
    xAxisStyle: {
      lanePaddingLeft: mergedStyle.xPeriodAxis.lanePaddingLeft,
      lanePaddingRight: mergedStyle.xPeriodAxis.lanePaddingRight,
      laneGapX: mergedStyle.xPeriodAxis.laneGapX,
    },
  };

  const config: SimplifiedChartConfig<
    TimeseriesInputs,
    TimeseriesDataTransformed,
    MergedTimeseriesStyle
  > = {
    mergedStyle,
    transformedData,
    dataProps,
    styleProps,

    xAxisType: "period",
    xAxisMeasureData: {
      type: "period",
      periodType: transformedData.periodType,
      nTimePoints: transformedData.nTimePoints,
      nLanes: transformedData.laneHeaders.length,
      mergedStyle,
    },
  };

  const measured = measureChart<
    TimeseriesInputs,
    TimeseriesDataTransformed,
    MergedTimeseriesStyle
  >(rc, rcdWithSurrounds, inputs, config, responsiveScale);

  // Generate all primitives using centralized loop
  const chartPrimitives = generateChartPrimitives(rc, measured, {
    xAxisType: "period",
    yAxisType: "scale",
    xAxisGridLineConfig: {
      type: "period",
      periodType: transformedData.periodType,
      timeMin: transformedData.timeMin,
      nTimePoints: transformedData.nTimePoints,
      showEveryNthTick: mergedStyle.xPeriodAxis.showEveryNthTick,
    },
    yAxisGridLineConfig: {
      type: "scale",
    },
    transformedData,
    gridStyle: {
      showGrid: mergedStyle.grid.showGrid,
      gridColor: mergedStyle.grid.gridColor,
      gridStrokeWidth: mergedStyle.grid.gridStrokeWidth,
    },
    contentStyle: mergedStyle.content,
    dataLabelsTextStyle: mergedStyle.text.dataLabels,
    mergedStyle,
  });

  // Generate surrounds primitives (captions and legend)
  const surroundsPrimitives = generateSurroundsPrimitives(
    measured.measuredSurrounds,
  );

  // Combine all primitives
  const primitives = [
    ...chartPrimitives,
    ...surroundsPrimitives,
  ];

  return {
    ...measured,
    primitives,
  };
}
