// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildAutoFormatter,
  type MergedGridStyle,
  type MergedXValueAxisStyle,
  type RectCoordsDims,
  type RenderContext,
} from "../../deps.ts";
import { SIZING_SAMPLE } from "../../dimension_helpers.ts";
import type { ChartValueAxisLimits } from "../../types.ts";
import { getGoodAxisTickValues } from "../get_good_axis_tick_values.ts";
import { resolveValueAxisLimits } from "../resolve_value_axis_limits.ts";
import type { XValueAxisHeightInfo, XValueAxisMeasuredInfo } from "./types.ts";

function measureXValueAxisLabelAndGapHeight(
  rc: RenderContext,
  axisLabel: string | undefined,
  sx: MergedXValueAxisStyle,
): number {
  if (!axisLabel) return 0;
  return rc.mText(axisLabel, sx.text.xValueAxisLabel, Number.POSITIVE_INFINITY)
    .dims.h() + sx.axisLabelGap;
}

export function measureXValueAxisHeight(
  rc: RenderContext,
  axisLabel: string | undefined,
  sx: MergedXValueAxisStyle,
  sg: MergedGridStyle,
): number {
  if (sx.exactAxisY !== "none") return sx.exactAxisY + sg.axisStrokeWidth;
  const sample = rc.mText(
    SIZING_SAMPLE.valueAxisTickPct,
    sx.text.xValueAxisTickLabels,
    Infinity,
  );
  return sample.dims.h() + sx.tickLabelGap + sx.tickLength +
    sg.axisStrokeWidth +
    measureXValueAxisLabelAndGapHeight(rc, axisLabel, sx);
}

export function measureXValueAxisHeightInfo(
  rc: RenderContext,
  dx: ChartValueAxisLimits,
  axisLabel: string | undefined,
  sx: MergedXValueAxisStyle,
  sg: MergedGridStyle,
  innerRcd: RectCoordsDims,
  i_pane: number,
  nLanes: number,
): XValueAxisHeightInfo {
  const heightIncludingXAxisStrokeWidth = measureXValueAxisHeight(
    rc,
    axisLabel,
    sx,
    sg,
  );

  // Guess tick count from per-lane sub-chart width (mirror of Y value axis,
  // which divides by nTiers to size per-tier sub-chart height).
  const guessSubChartW = (innerRcd.w() * 0.8) / nLanes;
  const sampleW = rc.mText(
    SIZING_SAMPLE.valueAxisTickWide,
    sx.text.xValueAxisTickLabels,
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

  // Per-LANE tick values — mirror of Y value axis's per-tier tick values in ChartOV.
  const xAxisTickValues = Array.from({ length: nLanes }, (_, i_lane) => {
    const dataMin = sx.allowIndividualLaneLimits
      ? (dx.paneLimits[i_pane].laneLimits[i_lane]?.valueMin ?? 0)
      : dx.paneLimits[i_pane].valueMin;
    const dataMax = sx.allowIndividualLaneLimits
      ? (dx.paneLimits[i_pane].laneLimits[i_lane]?.valueMax ?? 1)
      : dx.paneLimits[i_pane].valueMax;
    const { valueMin, valueMax } = resolveValueAxisLimits(
      sx.min,
      sx.max,
      i_pane,
      dataMin,
      dataMax,
    );
    return getGoodAxisTickValues(
      valueMax,
      valueMin,
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
    for (const tickValue of laneTicks) {
      const tickLabel = tickLabelFormatter(tickValue);
      const mTickLabel = rc.mText(
        tickLabel,
        sx.text.xValueAxisTickLabels,
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

export function measureXValueAxisLayout(
  innerRcd: RectCoordsDims,
  yAxisWidth: number,
  xValueAxisHeightInfo: XValueAxisHeightInfo,
  uniformSubChartWidth: number,
): XValueAxisMeasuredInfo {
  const xStart = innerRcd.x() + yAxisWidth;
  const xAxisRcd = innerRcd.getAdjusted(() => ({
    x: xStart,
    y: innerRcd.bottomY() -
      xValueAxisHeightInfo.heightIncludingXAxisStrokeWidth,
    w: innerRcd.rightX() - xStart,
    h: xValueAxisHeightInfo.heightIncludingXAxisStrokeWidth,
  }));
  return { xAxisRcd, uniformSubChartWidth, xValueAxisHeightInfo };
}
