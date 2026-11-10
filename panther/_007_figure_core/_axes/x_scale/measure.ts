// Copyright 2023-2026, Tim Roberton. MIT license.
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
import { SIZING_SAMPLE } from "../../dimension_helpers.ts";
import type { ChartScaleAxisLimits } from "../../types.ts";
import { getGoodAxisTickValues } from "../get_good_axis_tick_values.ts";
import { resolveScaleAxisLimits } from "../resolve_scale_axis_limits.ts";
import type { XScaleAxisHeightInfo, XScaleAxisMeasuredInfo } from "./types.ts";

function measureXScaleAxisLabelAndLabelGapHeight(
  rc: RenderContext,
  axisLabel: string | undefined,
  sx: MergedXScaleAxisStyle,
): number {
  if (!axisLabel) return 0;
  return rc.mText(axisLabel, sx.text.xScaleAxisLabel, Number.POSITIVE_INFINITY)
    .dims.h() + sx.labelGap;
}

export function measureXScaleAxisHeight(
  rc: RenderContext,
  axisLabel: string | undefined,
  sx: MergedXScaleAxisStyle,
  sg: MergedGridStyle,
): number {
  if (sx.exactAxisY !== "none") return sx.exactAxisY + sg.axisStrokeWidth;
  const sample = rc.mText(
    SIZING_SAMPLE.scaleTickPct,
    sx.text.xScaleAxisTickLabels,
    Infinity,
  );
  return sample.dims.h() + sx.tickLabelGap + sx.tickHeight +
    sg.axisStrokeWidth +
    measureXScaleAxisLabelAndLabelGapHeight(rc, axisLabel, sx);
}

export function measureXScaleAxisHeightInfo(
  rc: RenderContext,
  dx: ChartScaleAxisLimits,
  axisLabel: string | undefined,
  sx: MergedXScaleAxisStyle,
  sg: MergedGridStyle,
  contentRcd: RectCoordsDims,
  i_pane: number,
  laneCount: number,
): XScaleAxisHeightInfo {
  const heightIncludingXAxisStrokeWidth = measureXScaleAxisHeight(
    rc,
    axisLabel,
    sx,
    sg,
  );

  // Guess tick count from per-lane sub-chart width (mirror of Y-scale,
  // which divides by tierCount to size per-tier sub-chart height).
  const guessSubChartW = (contentRcd.w() * 0.8) / laneCount;
  const sampleW = rc.mText(
    SIZING_SAMPLE.scaleTickWide,
    sx.text.xScaleAxisTickLabels,
    Infinity,
  )
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
    const dataMin = sx.allowIndividualLaneLimits
      ? (dx.paneLimits[i_pane].laneLimits[i_lane]?.valueMin ?? 0)
      : dx.paneLimits[i_pane].valueMin;
    const dataMax = sx.allowIndividualLaneLimits
      ? (dx.paneLimits[i_pane].laneLimits[i_lane]?.valueMax ?? 1)
      : dx.paneLimits[i_pane].valueMax;
    const { minVal, maxVal } = resolveScaleAxisLimits(
      sx.min,
      sx.max,
      i_pane,
      dataMin,
      dataMax,
    );
    return getGoodAxisTickValues(
      maxVal,
      minVal,
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

  let maxTickLabelW = 0;
  for (const laneTicks of xAxisTickValues) {
    for (const tickVal of laneTicks) {
      const tickLabel = tickLabelFormatter(tickVal);
      const mTickLabel = rc.mText(
        tickLabel,
        sx.text.xScaleAxisTickLabels,
        9999,
      );
      maxTickLabelW = Math.max(maxTickLabelW, mTickLabel.dims.w());
    }
  }

  return {
    heightIncludingXAxisStrokeWidth,
    xAxisTickValues,
    tickLabelFormatter,
    maxTickLabelW,
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
