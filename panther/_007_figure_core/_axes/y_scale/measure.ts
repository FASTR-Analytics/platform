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
import type { YScaleAxisData, YScaleAxisWidthInfo } from "../../types.ts";
import { getGoodAxisTickValues_V2 } from "../get_good_axis_tick_values.ts";

export function measureYScaleAxisWidthInfo(
  rc: RenderContext,
  dy: YScaleAxisData,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
  contentRcd: RectCoordsDims,
  i_pane: number,
): YScaleAxisWidthInfo {
  ///////////////////////
  //                   //
  //    Row headers    //
  //                   //
  ///////////////////////

  let maxTierHeaderWidth = 0;
  let tierHeaderAndLabelGapWidth = 0;
  if (dy.tierHeaders.length > 1) {
    for (let i_tier = 0; i_tier < dy.tierHeaders.length; i_tier++) {
      const mText = rc.mText(dy.tierHeaders[i_tier], sy.text.tierHeaders, 9999);
      maxTierHeaderWidth = Math.max(maxTierHeaderWidth, mText.dims.w());
    }
    tierHeaderAndLabelGapWidth = maxTierHeaderWidth + sy.labelGap;
  }

  //////////////////////
  //                  //
  //    Axis label    //
  //                  //
  //////////////////////

  let axisLabelAndLabelGapWidth = 0;
  if (dy.yScaleAxisLabel) {
    const mLabel = rc.mText(
      dy.yScaleAxisLabel,
      sy.text.yScaleAxisLabel,
      Number.POSITIVE_INFINITY,
      { rotation: "anticlockwise" },
    );
    axisLabelAndLabelGapWidth = mLabel.dims.w() + sy.labelGap;
  }

  /////////////////
  //             //
  //    Ticks    //
  //             //
  /////////////////

  const guessSubChartH = (contentRcd.h() * 0.8) / dy.tierHeaders.length;
  const yAxisTickLabelH = rc
    .mText("100%", sy.text.yScaleAxisTickLabels, Number.POSITIVE_INFINITY)
    .dims.h();
  const halfYAxisTickLabelH = yAxisTickLabelH / 2;
  const guessMaxNTicks = Math.max(
    2,
    Math.floor(guessSubChartH / 2 / yAxisTickLabelH),
  );

  const yAxisTickValues = dy.tierHeaders.map((_, i_tier) => {
    const finalValueMin = typeof sy.min === "function"
      ? sy.min(i_pane)
      : sy.min !== "auto"
      ? sy.min
      : sy.allowIndividualTierLimits
      ? (dy.paneLimits[i_pane].tierLimits[i_tier]?.valueMin ?? 0)
      : dy.paneLimits[i_pane].valueMin;
    const finalValueMax = typeof sy.max === "function"
      ? sy.max(i_pane)
      : sy.max !== "auto"
      ? sy.max
      : sy.allowIndividualTierLimits
      ? (dy.paneLimits[i_pane].tierLimits[i_tier]?.valueMax ?? 1)
      : dy.paneLimits[i_pane].valueMax;
    return getGoodAxisTickValues_V2(
      finalValueMax,
      finalValueMin,
      guessMaxNTicks,
      sy.tickLabelFormatter,
    );
  });

  let maxYTickWidth = 0;
  for (const rowYTickVals of yAxisTickValues) {
    // Measure all tick labels to find the widest one
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
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  dy: YScaleAxisData,
  sy: MergedYScaleAxisStyle,
  contentRcd: RectCoordsDims,
): {
  yAxisRcd: RectCoordsDims;
  subChartAreaHeight: number;
} {
  const my = yScaleAxisWidthInfo;

  const yAxisRcd = contentRcd.getAdjusted((prev) => ({
    y: prev.y() + topHeightForLaneHeaders,
    w: my.widthIncludingYAxisStrokeWidth,
    h: prev.h() - (topHeightForLaneHeaders + xAxisAreaHeightIncludingStroke),
  }));

  const subChartAreaHeight = (yAxisRcd.h() -
    (sy.tierPaddingTop +
      (dy.tierHeaders.length - 1) * sy.tierGapY +
      sy.tierPaddingBottom)) /
    dy.tierHeaders.length;

  return { yAxisRcd, subChartAreaHeight };
}
