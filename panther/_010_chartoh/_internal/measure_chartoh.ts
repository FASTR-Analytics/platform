// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureChart,
  type MergedChartOHStyle,
  type PaneGrid,
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
  paneGrid: PaneGrid,
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
    inputs.data,
    mergedStyle.content.bars.stacking === "stacked",
  );

  const config: SimplifiedChartConfig<
    ChartOHInputs,
    ChartOHDataTransformed,
    MergedChartOHStyle
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
      visibleTiersByPane: transformedData.visibleTiersByPane,
      visibleIndicatorsByPaneTierOrLane:
        transformedData.visibleIndicatorsByPaneTier,
      proportionalPanes: transformedData.proportionalPanes,
    },
    xAxisConfig: {
      type: "value",
      axisStyle: mergedStyle.xValueAxis,
      axisData: transformedData.valueAxisLimits,
      axisLabel: transformedData.xValueAxisLabel,
    },
    yAxisConfig: {
      type: "text",
      indicatorMembers: transformedData.indicator.members,
      axisStyle: mergedStyle.yTextAxis,
    },
    orientation: "horizontal",
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
