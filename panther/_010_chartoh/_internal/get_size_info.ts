// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinSubChartWidth,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYTextAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getDimensionMembers,
  maxNVisible,
  maxProportionalPaneCategoryAxisExtent,
  measureXValueAxisHeight,
  PANE_HEADER_SAMPLE_MAX_W,
  type RenderContext,
  resolveDefaultLegend,
  SIZING_SAMPLE,
} from "../deps.ts";
import { getChartOHDataTransformed } from "../get_chartoh_data.ts";
import type { ChartOHDataTransformed, ChartOHInputs } from "../types.ts";

export function getChartOHSizingData(
  inputs: ChartOHInputs,
): ChartOHDataTransformed {
  const stacked =
    new CustomFigureStyle(inputs.style).getMergedChartOHStyle().content.bars
      .stacking === "stacked";
  return getChartOHDataTransformed(inputs.data, stacked);
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

  const xAxisHeight = measureXValueAxisHeight(
    rc,
    data.xValueAxisLabel,
    ms.xValueAxis,
    ms.grid,
  );

  // Y-text axis width (sample). Actual width depends on indicator labels;
  // the estimator gives a conservative minimum.
  const minYAxisWidth = estimateMinYTextAxisWidth(
    rc,
    ms.yTextAxis,
    ms.grid,
    estimateTierHeaderAndLabelGapWidth(rc, data.tier, data.lane, ms),
  );

  const paneHeaderHeight = rc
    .mText(
      SIZING_SAMPLE.paneHeader,
      ms.text.paneHeaders,
      PANE_HEADER_SAMPLE_MAX_W,
    )
    .dims.h();

  // minSubChartWidth — from X value axis tick labels (fixed, mirror of ChartOV's
  // calculateMinSubChartHeight).
  const minSubChartWidth = calculateMinSubChartWidth(rc, ms.xValueAxis);

  // minSubChartHeight — nIndicators × tick-label height (+ strokes).
  // Mirror of ChartOV's minSubChartWidth formula.
  const indicatorMembers = data.indicator.members;
  const nIndicators = indicatorMembers.length;
  const textStyle = ms.yTextAxis.text.yTextAxisTickLabels;
  const contentMaxWidth = Infinity;
  let maxTickLabelH = 0;
  for (const member of indicatorMembers) {
    const mText = rc.mText(member.label, textStyle, contentMaxWidth);
    if (mText.dims.h() > maxTickLabelH) maxTickLabelH = mText.dims.h();
  }
  // Unbalanced membership: reserve height for the fullest pane, not the
  // global union. maxTickLabelH stays measured from the global label set
  // (a safe upper bound for any pane's subset).
  const nSlots = maxNVisible(
    data.visibleIndicatorsByPane,
    nIndicators,
  );
  const gridLineStrokeWidth = ms.grid.gridLineStrokeWidth;
  // Unbalanced tier membership: reserve height for the fullest pane.
  const nTiers = maxNVisible(
    data.visibleTiersByPane,
    getDimensionMembers(data.tier).length,
  );
  // Proportional tier-or-lane layout: the height floor is the fullest pane's TOTAL
  // (slotExtent-model: Σ over its tiers or lanes of visible counts × label height +
  // strokes), expressed per-tier so the uniform decomposition (× nTiers)
  // recovers the pane total. Otherwise the shipped per-tier-or-lane × tier-or-lane count
  // model.
  const minSubChartHeight = data.visibleIndicatorsByPaneTier
    ? maxProportionalPaneCategoryAxisExtent(
      data.visibleIndicatorsByPaneTier,
      maxTickLabelH,
      ms.yTextAxis.tickPosition === "center",
      gridLineStrokeWidth,
    ) / Math.max(1, nTiers)
    : ms.yTextAxis.tickPosition === "center"
    ? nSlots * maxTickLabelH
    : nSlots * maxTickLabelH + gridLineStrokeWidth * (nSlots + 1);

  const resolvedLegendLabels = resolveDefaultLegend(
    inputs.legend,
    data.series,
  );

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes: getDimensionMembers(data.lane).length,
    nTiers,
    nPanes: getDimensionMembers(data.pane).length,
    minSubChartWidth,
    minSubChartHeight,
    xAxisHeight,
    paneHeaderHeight,
    minYAxisWidth,
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      cs,
      resolvedLegendLabels,
      data.series,
    ),
    resolvedLegendLabels,
    // Proportional layout: the tick mode drives the inter-slot stroke term
    // in the ragged decompositions.
    slotTicksCentered: data.visibleIndicatorsByPaneTier
      ? ms.yTextAxis.tickPosition === "center"
      : undefined,
  };
}
