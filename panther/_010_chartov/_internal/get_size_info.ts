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
import { getChartOVDataTransformed } from "../get_chartov_data.ts";
import type { ChartOVInputs } from "../types.ts";

export function getChartOVComponentSizes(
  rc: RenderContext,
  inputs: ChartOVInputs,
  scale?: number,
): ChartComponentSizes {
  const cs = new CustomFigureStyle(inputs.style, scale);
  const ms = cs.getMergedChartOVStyle();
  const data = getChartOVDataTransformed(
    inputs.chartData,
    ms.content.bars.stacking === "stacked",
  );

  const xAxisTickH = rc
    .mText("Category", ms.xTextAxis.text.xTextAxisTickLabels, Infinity)
    .dims.h();
  const xAxisHeight = ms.grid.axisStrokeWidth +
    xAxisTickH +
    ms.xTextAxis.tickHeight +
    ms.xTextAxis.tickLabelGap;

  const paneHeaderHeight = rc
    .mText("Region 001", ms.text.paneHeaders, 400)
    .dims.h();

  const textStyle = ms.xTextAxis.text.xTextAxisTickLabels;
  const indicatorHeaders = data.indicatorHeaders;
  const nIndicators = indicatorHeaders.length;

  let maxWordWidth = 0;
  for (const header of indicatorHeaders) {
    const words = header.split(/\s+/);
    for (const word of words) {
      if (word.length === 0) continue;
      const mText = rc.mText(word, textStyle, Infinity);
      maxWordWidth = Math.max(maxWordWidth, mText.dims.w());
    }
  }

  const gridStrokeWidth = ms.grid.gridStrokeWidth;
  const minSubChartWidth = ms.xTextAxis.tickPosition === "center"
    ? nIndicators * maxWordWidth
    : nIndicators * maxWordWidth + gridStrokeWidth * (nIndicators + 1);

  const resolvedLegendLabels = inputs.legend ?? data.seriesHeaders;

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
