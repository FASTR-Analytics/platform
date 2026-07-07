// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  maxProportionalPanePlotExtent,
  maxVisibleCount,
  type RenderContext,
  resolveDefaultLegend,
} from "../deps.ts";
import { getChartOHDataTransformed } from "../get_chartoh_data.ts";
import type { ChartOHDataTransformed, ChartOHInputs } from "../types.ts";

export function getChartOHSizingData(
  inputs: ChartOHInputs,
): ChartOHDataTransformed {
  const stacked =
    new CustomFigureStyle(inputs.style).getMergedChartOHStyle().content.bars
      .stacking === "stacked";
  return getChartOHDataTransformed(inputs.chartOHData, stacked);
}

export function getChartOHComponentSizes(
  rc: RenderContext,
  inputs: ChartOHInputs,
  data: ChartOHDataTransformed,
  scale?: number,
): ChartComponentSizes {
  const cs = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const ms = cs.getMergedChartOHStyle();

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
    const mText = rc.mText(header.label, textStyle, contentMaxWidth);
    if (mText.dims.h() > maxTickLabelH) maxTickLabelH = mText.dims.h();
  }
  // Unbalanced membership: reserve height for the fullest pane, not the
  // global union. maxTickLabelH stays measured from the global label set
  // (a safe upper bound for any pane's subset).
  const nIndicatorSlots = maxVisibleCount(
    data.visibleIndicatorsByPane,
    nIndicators,
  );
  const gridStrokeWidth = ms.grid.gridStrokeWidth;
  // Unbalanced tier membership: reserve height for the fullest pane.
  const nTiers = maxVisibleCount(
    data.visibleTiersByPane,
    data.tierHeaders.length,
  );
  // Proportional band layout: the height floor is the fullest pane's TOTAL
  // (slotT-model: Σ over its bands of visible counts × label height +
  // strokes), expressed per-tier so the uniform decomposition (× nTiers)
  // recovers the pane total. Otherwise the shipped per-band × band-count
  // model.
  const minSubChartHeight = data.visibleIndicatorsByPaneBand
    ? maxProportionalPanePlotExtent(
      data.visibleIndicatorsByPaneBand,
      maxTickLabelH,
      ms.yTextAxis.tickPosition === "center",
      gridStrokeWidth,
    ) / Math.max(1, nTiers)
    : ms.yTextAxis.tickPosition === "center"
    ? nIndicatorSlots * maxTickLabelH
    : nIndicatorSlots * maxTickLabelH + gridStrokeWidth * (nIndicatorSlots + 1);

  const resolvedLegendLabels = resolveDefaultLegend(
    inputs.legend,
    data.seriesHeaders,
  );

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes: data.laneHeaders.length,
    nTiers,
    paneHeaders: data.paneHeaders,
    minSubChartWidth,
    minSubChartHeight,
    xAxisHeight,
    paneHeaderHeight,
    minYAxisWidth,
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      cs,
      resolvedLegendLabels,
      data.seriesHeaders,
    ),
    resolvedLegendLabels,
    // Proportional layout: the tick mode drives the inter-slot stroke term
    // in the ragged decompositions.
    slotTicksCentered: data.visibleIndicatorsByPaneBand
      ? ms.yTextAxis.tickPosition === "center"
      : undefined,
  };
}
