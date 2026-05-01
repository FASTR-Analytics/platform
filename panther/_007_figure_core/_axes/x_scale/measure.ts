// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildAutoFormatter,
  type MergedGridStyle,
  type MergedXScaleAxisStyle,
  type RectCoordsDims,
  type RenderContext,
} from "../../deps.ts";
import type { ChartScaleAxisLimits } from "../../types.ts";
import { getGoodAxisTickValues } from "../get_good_axis_tick_values.ts";
import type { XScaleAxisHeightInfo, XScaleAxisMeasuredInfo } from "./types.ts";

export function estimateMinXAxisHeightForScale(
  rc: RenderContext,
  sx: MergedXScaleAxisStyle,
  sg: MergedGridStyle,
): number {
  const sample = rc.mText("100%", sx.text.xScaleAxisTickLabels, Infinity);
  return sample.dims.h() + sx.tickLabelGap + sx.tickHeight + sg.axisStrokeWidth;
}

export function measureXScaleAxisHeightInfo(
  rc: RenderContext,
  dx: ChartScaleAxisLimits,
  sx: MergedXScaleAxisStyle,
  sg: MergedGridStyle,
  contentRcd: RectCoordsDims,
  i_pane: number,
  laneCount: number,
): XScaleAxisHeightInfo {
  const sampleH = rc.mText("100%", sx.text.xScaleAxisTickLabels, Infinity)
    .dims.h();
  const heightIncludingXAxisStrokeWidth = sx.exactAxisY !== "none"
    ? sx.exactAxisY + sg.axisStrokeWidth
    : sampleH + sx.tickLabelGap + sx.tickHeight + sg.axisStrokeWidth;

  // Guess tick count from per-lane sub-chart width (mirror of Y-scale,
  // which divides by tierCount to size per-tier sub-chart height).
  const guessSubChartW = (contentRcd.w() * 0.8) / laneCount;
  const sampleW = rc.mText("100,000", sx.text.xScaleAxisTickLabels, Infinity)
    .dims.w();
  const guessMaxNTicks = sampleW > 0
    ? Math.max(2, Math.floor(guessSubChartW / 2 / sampleW))
    : 2;

  const formatterOption = sx.tickLabelFormatter;
  const formatterForUniquenessCheck = typeof formatterOption === "function"
    ? formatterOption
    : undefined;

  // Per-LANE tick values — mirror of Y-scale's per-tier tick values in ChartOV.
  const xAxisTickValues = Array.from({ length: laneCount }, (_, i_lane) => {
    let vMin = typeof sx.min === "function"
      ? sx.min(i_pane)
      : sx.min !== "auto"
      ? sx.min
      : sx.allowIndividualLaneLimits
      ? (dx.paneLimits[i_pane].laneLimits[i_lane]?.valueMin ?? 0)
      : dx.paneLimits[i_pane].valueMin;
    let vMax = typeof sx.max === "function"
      ? sx.max(i_pane)
      : sx.max !== "auto"
      ? sx.max
      : sx.allowIndividualLaneLimits
      ? (dx.paneLimits[i_pane].laneLimits[i_lane]?.valueMax ?? 1)
      : dx.paneLimits[i_pane].valueMax;
    if (vMax < vMin) {
      const t = vMin;
      vMin = vMax;
      vMax = t;
    }
    return getGoodAxisTickValues(
      vMax,
      vMin,
      guessMaxNTicks,
      formatterForUniquenessCheck,
    );
  });

  const tickLabelFormatter: (v: number) => string =
    typeof formatterOption === "function"
      ? formatterOption
      : buildAutoFormatter(
        xAxisTickValues.flat(),
        formatterOption === "auto-percent" ? "percent" : "number",
      );

  return {
    heightIncludingXAxisStrokeWidth,
    xAxisTickValues,
    guessMaxNTicks,
    tickLabelFormatter,
  };
}

export function measureXScaleAxisLayout(
  contentRcd: RectCoordsDims,
  yAxisAreaWidth: number,
  xScaleHeightInfo: XScaleAxisHeightInfo,
  subChartAreaWidth: number,
): XScaleAxisMeasuredInfo {
  const xStart = contentRcd.x() + yAxisAreaWidth;
  const xAxisRcd = contentRcd.getAdjusted(() => ({
    x: xStart,
    y: contentRcd.bottomY() - xScaleHeightInfo.heightIncludingXAxisStrokeWidth,
    w: contentRcd.rightX() - xStart,
    h: xScaleHeightInfo.heightIncludingXAxisStrokeWidth,
  }));
  return { xAxisRcd, subChartAreaWidth, xScaleHeightInfo };
}
