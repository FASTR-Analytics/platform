// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureChart,
  type MergedChartOVStyle,
  type PaneGrid,
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
  paneGrid: PaneGrid,
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
    inputs.data,
    mergedStyle.content.bars.stacking === "stacked",
  );

  const config: SimplifiedChartConfig<
    ChartOVInputs,
    ChartOVDataTransformed,
    MergedChartOVStyle
  > = {
    mergedStyle,
    transformedData,
    dataDimensions: {
      pane: transformedData.pane,
      tier: transformedData.tier,
      lane: transformedData.lane,
      series: transformedData.series,
      indicator: transformedData.indicator,
      visibleIndicatorsByPane: transformedData.visibleIndicatorsByPane,
      visibleLanesByPane: transformedData.visibleLanesByPane,
      visibleIndicatorsByPaneTierOrLane:
        transformedData.visibleIndicatorsByPaneLane,
      proportionalPanes: transformedData.proportionalPanes,
    },
    xAxisConfig: {
      type: "text",
      indicatorMembers: transformedData.indicator.members,
      axisStyle: mergedStyle.xTextAxis,
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
