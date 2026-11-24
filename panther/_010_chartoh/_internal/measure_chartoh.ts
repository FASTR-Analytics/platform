// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildCategoryAndValueLegendSeries,
  buildSecondValueAxisConfig,
  CustomFigureStyle,
  measureChart,
  type MergedChartOHStyle,
  type PaneGrid,
  type RectCoordsDims,
  referenceLinesOn,
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
    },
    masks: {
      visibleIndicatorsByPane: transformedData.visibleIndicatorsByPane,
      visibleTiersByPane: transformedData.visibleTiersByPane,
      visibleIndicatorsByPaneTierOrLane:
        transformedData.visibleIndicatorsByPaneTier,
      proportionalPanes: transformedData.proportionalPanes,
    },
    axes: {
      kind: "category-and-value",
      orientation: "horizontal",
      x: {
        type: "value",
        axisStyle: mergedStyle.xValueAxis,
        axisData: transformedData.valueAxisLimits,
        axisLabel: transformedData.xValueAxisLabel,
        referenceLines: referenceLinesOn(
          transformedData.referenceLines,
          "first",
        ),
      },
      y: {
        type: "text",
        indicatorMembers: transformedData.indicator.members,
        axisStyle: mergedStyle.yTextAxis,
      },
      secondX: buildSecondValueAxisConfig(
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
