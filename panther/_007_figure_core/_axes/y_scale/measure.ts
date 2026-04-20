// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  MergedYScaleAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type {
  ChartScaleAxisLimits,
  YAxisWidthInfoBase,
  YScaleAxisWidthInfo,
} from "../../types.ts";
import { getGoodAxisTickValues_V2 } from "../get_good_axis_tick_values.ts";

export function estimateMinYAxisWidth(
  rc: RenderContext,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
): number {
  const sampleLabel = rc.mText(
    "100,000",
    sy.text.yScaleAxisTickLabels,
    Infinity,
  );
  return sampleLabel.dims.w() + sy.tickLabelGap + sy.tickWidth +
    sg.axisStrokeWidth;
}

export function measureYScaleAxisWidthInfo(
  rc: RenderContext,
  dy: ChartScaleAxisLimits,
  axisLabel: string | undefined,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
  contentRcd: RectCoordsDims,
  i_pane: number,
  tierHeaderAndLabelGapWidth: number,
  tierCount: number,
): YScaleAxisWidthInfo {
  let axisLabelAndLabelGapWidth = 0;
  if (axisLabel) {
    const mLabel = rc.mText(
      axisLabel,
      sy.text.yScaleAxisLabel,
      Number.POSITIVE_INFINITY,
      { rotation: "anticlockwise" },
    );
    axisLabelAndLabelGapWidth = mLabel.dims.w() + sy.labelGap;
  }

  const guessSubChartH = (contentRcd.h() * 0.8) / tierCount;
  const yAxisTickLabelH = rc
    .mText("100%", sy.text.yScaleAxisTickLabels, Number.POSITIVE_INFINITY)
    .dims.h();
  const halfYAxisTickLabelH = yAxisTickLabelH / 2;
  const guessMaxNTicks = yAxisTickLabelH > 0
    ? Math.max(2, Math.floor(guessSubChartH / 2 / yAxisTickLabelH))
    : 2;

  const yAxisTickValues = Array.from({ length: tierCount }, (_, i_tier) => {
    let finalValueMin = typeof sy.min === "function"
      ? sy.min(i_pane)
      : sy.min !== "auto"
      ? sy.min
      : sy.allowIndividualTierLimits
      ? (dy.paneLimits[i_pane].tierLimits[i_tier]?.valueMin ?? 0)
      : dy.paneLimits[i_pane].valueMin;
    let finalValueMax = typeof sy.max === "function"
      ? sy.max(i_pane)
      : sy.max !== "auto"
      ? sy.max
      : sy.allowIndividualTierLimits
      ? (dy.paneLimits[i_pane].tierLimits[i_tier]?.valueMax ?? 1)
      : dy.paneLimits[i_pane].valueMax;
    if (finalValueMax < finalValueMin) {
      const temp = finalValueMin;
      finalValueMin = finalValueMax;
      finalValueMax = temp;
    }
    return getGoodAxisTickValues_V2(
      finalValueMax,
      finalValueMin,
      guessMaxNTicks,
      sy.tickLabelFormatter,
    );
  });

  let maxYTickWidth = 0;
  for (const rowYTickVals of yAxisTickValues) {
    for (const tickVal of rowYTickVals) {
      const tickLabel = sy.tickLabelFormatter(tickVal);
      const mTickLabel = rc.mText(
        tickLabel,
        sy.text.yScaleAxisTickLabels,
        9999,
      );
      maxYTickWidth = Math.max(maxYTickWidth, mTickLabel.dims.w());
    }
  }

  const widthIncludingYAxisStrokeWidth = sy.exactAxisX !== "none"
    ? sy.exactAxisX + sg.axisStrokeWidth
    : tierHeaderAndLabelGapWidth +
      axisLabelAndLabelGapWidth +
      maxYTickWidth +
      sy.tickLabelGap +
      sy.tickWidth +
      sg.axisStrokeWidth;

  return {
    widthIncludingYAxisStrokeWidth,
    guessMaxNTicks,
    yAxisTickValues,
    tierHeaderAndLabelGapWidth,
    halfYAxisTickLabelH,
  };
}

export function measureYScaleAxis(
  topHeightForLaneHeaders: number,
  xAxisAreaHeightIncludingStroke: number,
  yAxisWidthInfo: YAxisWidthInfoBase,
  tiers: { paddingTop: number; paddingBottom: number; gapY: number },
  contentRcd: RectCoordsDims,
  tierCount: number,
  tierHeaderAndLabelGapHeight: number,
): {
  yAxisRcd: RectCoordsDims;
  subChartAreaHeight: number;
} {
  const my = yAxisWidthInfo;

  const yAxisRcd = contentRcd.getAdjusted((prev) => ({
    y: prev.y() + topHeightForLaneHeaders,
    w: my.widthIncludingYAxisStrokeWidth,
    h: prev.h() - (topHeightForLaneHeaders + xAxisAreaHeightIncludingStroke),
  }));

  const subChartAreaHeight = (yAxisRcd.h() -
    (tiers.paddingTop +
      (tierCount - 1) * tiers.gapY +
      tiers.paddingBottom +
      tierCount * tierHeaderAndLabelGapHeight)) /
    tierCount;

  return { yAxisRcd, subChartAreaHeight };
}
