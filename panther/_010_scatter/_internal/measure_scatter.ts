// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildScatterLegendSeries,
  CustomFigureStyle,
  measureChart,
  type MergedScatterStyle,
  type PaneGrid,
  type RectCoordsDims,
  type RenderContext,
  type SimplifiedChartConfig,
} from "../deps.ts";
import { getScatterDataTransformed } from "../get_scatter_data.ts";
import {
  type MeasuredScatter,
  type ScatterDataTransformed,
  type ScatterInputs,
  scatterReferenceLinesOn,
} from "../types.ts";

export function measureScatter(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  inputs: ScatterInputs,
  paneGrid: PaneGrid,
  fitScale?: number,
  data?: ScatterDataTransformed,
  // Skip content-primitive generation (probe-only); see measurePane.
  layoutOnly?: boolean,
): MeasuredScatter {
  const mergedStyle = new CustomFigureStyle(inputs.style, fitScale)
    .getMergedScatterStyle();
  const transformedData = data ?? getScatterDataTransformed(inputs.data);

  const config: SimplifiedChartConfig<
    ScatterDataTransformed,
    MergedScatterStyle
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
    axes: {
      kind: "value-and-value",
      x: {
        type: "value",
        axisStyle: mergedStyle.xValueAxis,
        axisData: transformedData.xValueAxisLimits,
        axisLabel: transformedData.xValueAxisLabel,
        referenceLines: scatterReferenceLinesOn(
          transformedData.referenceLines,
          "x",
        ),
      },
      y: {
        type: "value",
        axisStyle: mergedStyle.yValueAxis,
        axisData: transformedData.yValueAxisLimits,
        axisLabel: transformedData.yValueAxisLabel,
        referenceLines: scatterReferenceLinesOn(
          transformedData.referenceLines,
          "y",
        ),
      },
    },
    subChartTexts: transformedData.subChartTexts,
    legendSeries: buildScatterLegendSeries(
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
