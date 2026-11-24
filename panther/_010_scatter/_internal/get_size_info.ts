// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildScatterLegendSeries,
  calculateMinSubChartHeight,
  calculateMinSubChartWidth,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYValueAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getDimensionMembers,
  measureXValueAxisHeight,
  PANE_HEADER_SAMPLE_MAX_W,
  type RenderContext,
  resolveDefaultLegend,
  SIZING_SAMPLE,
} from "../deps.ts";
import type { ScatterDataTransformed, ScatterInputs } from "../types.ts";

export function getScatterComponentSizes(
  rc: RenderContext,
  inputs: ScatterInputs,
  data: ScatterDataTransformed,
  scale?: number,
): ChartComponentSizes {
  const cs = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const ms = cs.getMergedScatterStyle();
  const resolvedLegendLabels = resolveDefaultLegend(
    inputs.legend,
    data.series,
  );
  const legendSeries = buildScatterLegendSeries(ms.content, data);
  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes: getDimensionMembers(data.lane).length,
    nTiers: getDimensionMembers(data.tier).length,
    nPanes: getDimensionMembers(data.pane).length,
    minSubChartWidth: calculateMinSubChartWidth(rc, ms.xValueAxis),
    minSubChartHeight: calculateMinSubChartHeight(rc, ms.yValueAxis),
    xAxesHeight: measureXValueAxisHeight(
      rc,
      data.xValueAxisLabel,
      ms.xValueAxis,
      ms.grid,
    ),
    paneHeaderHeight: rc
      .mText(
        SIZING_SAMPLE.paneHeader,
        ms.text.paneHeaders,
        PANE_HEADER_SAMPLE_MAX_W,
      )
      .dims.h(),
    minYAxesWidth: estimateMinYValueAxisWidth(
      rc,
      data.yValueAxisLabel,
      ms.yValueAxis,
      ms.grid,
      estimateTierHeaderAndLabelGapWidth(rc, data.tier, data.lane, ms),
      "first",
    ),
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      cs,
      resolvedLegendLabels,
      legendSeries,
    ),
    resolvedLegendLabels,
    legendSeries,
  };
}
