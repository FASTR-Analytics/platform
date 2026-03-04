// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinSubChartHeight,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  type RenderContext,
} from "../deps.ts";
import { getTimeseriesDataTransformed } from "../get_timeseries_data.ts";
import type { TimeseriesInputs } from "../types.ts";

export function getTimeseriesComponentSizes(
  rc: RenderContext,
  inputs: TimeseriesInputs,
  scale?: number,
): ChartComponentSizes {
  const cs = new CustomFigureStyle(inputs.style, scale);
  const ms = cs.getMergedTimeseriesStyle();
  const data = getTimeseriesDataTransformed(
    inputs.timeseriesData,
    ms.content.bars.stacking === "stacked",
  );

  const xAxisTickH = rc
    .mText("2024", ms.xPeriodAxis.text.xPeriodAxisTickLabels, Infinity)
    .dims.h();
  const xAxisHeight = ms.grid.axisStrokeWidth +
    xAxisTickH +
    ms.xPeriodAxis.periodLabelLargeTopPadding;

  const paneHeaderHeight = rc
    .mText("Region 001", ms.text.paneHeaders, 400)
    .dims.h();

  const tickLabelHeight = rc
    .mText("2024", ms.xPeriodAxis.text.xPeriodAxisTickLabels, Infinity)
    .dims.h();

  const minSubChartWidth = data.nTimePoints > 30
    ? data.nTimePoints * tickLabelHeight * 0.1
    : data.nTimePoints > 20
    ? data.nTimePoints * tickLabelHeight * 0.2
    : data.nTimePoints > 5
    ? data.nTimePoints * tickLabelHeight * 0.5
    : data.nTimePoints * tickLabelHeight;

  const resolvedLegendLabels = inputs.legendItemsOrLabels ?? data.seriesHeaders;

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes: data.laneHeaders.length,
    nTiers: data.tierHeaders.length,
    paneHeaders: data.paneHeaders,
    minSubChartWidth,
    minSubChartHeight: calculateMinSubChartHeight(rc, ms.yScaleAxis),
    xAxisHeight,
    paneHeaderHeight,
    minYAxisWidth: estimateMinYAxisWidth(rc, ms.yScaleAxis, ms.grid),
    surroundsMinWidth: estimateMinSurroundsWidth(rc, cs, resolvedLegendLabels),
    resolvedLegendLabels,
  };
}
