// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinSubChartWidth,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinXAxisHeightForScale,
  estimateMinYTextAxisWidth,
  type RenderContext,
} from "../deps.ts";
import { getChartOHDataTransformed } from "../get_chartoh_data.ts";
import type { ChartOHInputs } from "../types.ts";

export function getChartOHComponentSizes(
  rc: RenderContext,
  inputs: ChartOHInputs,
  scale?: number,
): ChartComponentSizes {
  const cs = new CustomFigureStyle(inputs.style, scale);
  const ms = cs.getMergedChartOHStyle();
  const data = getChartOHDataTransformed(
    inputs.chartOHData,
    ms.content.bars.stacking === "stacked",
  );

  // X-scale axis height (self-contained, sample tick label).
  const xAxisHeight = estimateMinXAxisHeightForScale(
    rc,
    ms.xScaleAxis,
    ms.grid,
  );

  // Y-text axis width (sample). Actual width depends on indicator labels;
  // the estimator gives a conservative minimum.
  const minYAxisWidth = estimateMinYTextAxisWidth(rc, ms.yTextAxis, ms.grid);

  const paneHeaderHeight = rc
    .mText("Region 001", ms.text.paneHeaders, 400)
    .dims.h();

  // minSubChartWidth — from X-scale tick labels (fixed, mirror of ChartOV's
  // calculateMinSubChartHeight).
  const minSubChartWidth = calculateMinSubChartWidth(rc, ms.xScaleAxis);

  // minSubChartHeight — nIndicators × tick-label height (+ strokes).
  // Mirror of ChartOV's minSubChartWidth formula.
  const indicatorHeaders = data.indicatorHeaders;
  const nIndicators = indicatorHeaders.length;
  const textStyle = ms.yTextAxis.text.yTextAxisTickLabels;
  const contentMaxWidth = Infinity;
  let maxTickLabelH = 0;
  for (const header of indicatorHeaders) {
    const mText = rc.mText(header, textStyle, contentMaxWidth);
    if (mText.dims.h() > maxTickLabelH) maxTickLabelH = mText.dims.h();
  }
  const gridStrokeWidth = ms.grid.gridStrokeWidth;
  const minSubChartHeight = ms.yTextAxis.tickPosition === "center"
    ? nIndicators * maxTickLabelH
    : nIndicators * maxTickLabelH + gridStrokeWidth * (nIndicators + 1);

  const resolvedLegendLabels = inputs.legend ?? data.seriesHeaders;

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes: data.laneHeaders.length,
    nTiers: data.tierHeaders.length,
    paneHeaders: data.paneHeaders,
    minSubChartWidth,
    minSubChartHeight,
    xAxisHeight,
    paneHeaderHeight,
    minYAxisWidth,
    surroundsMinWidth: estimateMinSurroundsWidth(rc, cs, resolvedLegendLabels),
    resolvedLegendLabels,
  };
}
