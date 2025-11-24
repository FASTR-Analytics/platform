// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateChartPrimitives,
  generateSurroundsPrimitives,
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
  // Pre-compute values
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
  );
  const mergedStyle = customFigureStyle.getMergedChartOVStyle();
  const transformedData = getChartOVDataTransformed(
    inputs.chartData,
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
      lanePaddingLeft: mergedStyle.xTextAxis.lanePaddingLeft,
      lanePaddingRight: mergedStyle.xTextAxis.lanePaddingRight,
      laneGapX: mergedStyle.xTextAxis.laneGapX,
    },
  };

  const config: SimplifiedChartConfig<
    ChartOVInputs,
    ChartOVDataTransformed,
    MergedChartOVStyle
  > = {
    mergedStyle,
    transformedData,
    dataProps,
    styleProps,

    xAxisType: "text",
    xAxisMeasureData: {
      type: "text",
      indicatorHeaders: transformedData.indicatorHeaders,
      nLanes: transformedData.laneHeaders.length,
      mergedStyle,
    },
  };

  const measured = measureChart<
    ChartOVInputs,
    ChartOVDataTransformed,
    MergedChartOVStyle
  >(
    rc,
    rcdWithSurrounds,
    inputs,
    config,
    responsiveScale,
  );

  // Generate all primitives using centralized loop
  const chartPrimitives = generateChartPrimitives(rc, measured, {
    xAxisType: "text",
    yAxisType: "scale",
    xAxisGridLineConfig: {
      type: "text",
      nIndicators: transformedData.indicatorHeaders.length,
      centeredTicks: mergedStyle.xTextAxis.tickPosition === "center",
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
