// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildCategoryAndValueLegendSeries,
  buildSecondValueAxisConfig,
  CustomFigureStyle,
  measureChart,
  type MergedChartOVStyle,
  type PaneGrid,
  type RectCoordsDims,
  referenceLinesOn,
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
    },
    masks: {
      visibleIndicatorsByPane: transformedData.visibleIndicatorsByPane,
      visibleLanesByPane: transformedData.visibleLanesByPane,
      visibleIndicatorsByPaneTierOrLane:
        transformedData.visibleIndicatorsByPaneLane,
      proportionalPanes: transformedData.proportionalPanes,
    },
    axes: {
      kind: "category-and-value",
      orientation: "vertical",
      x: {
        type: "text",
        indicatorMembers: transformedData.indicator.members,
        axisStyle: mergedStyle.xTextAxis,
      },
      y: {
        type: "value",
        axisStyle: mergedStyle.yValueAxis,
        axisData: transformedData.valueAxisLimits,
        axisLabel: transformedData.yValueAxisLabel,
        referenceLines: referenceLinesOn(
          transformedData.referenceLines,
          "first",
        ),
      },
      secondY: buildSecondValueAxisConfig(
        transformedData.secondValueAxis,
        mergedStyle.secondValueAxis,
        transformedData.referenceLines,
      ),
    },
    subChartTexts: transformedData.subChartTexts,
    legendSeries: buildCategoryAndValueLegendSeries(
      mergedStyle.content,
      transformedData,
    ),
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
