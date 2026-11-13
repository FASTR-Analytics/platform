// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildAutoFormatter,
  type MergedGridStyle,
  type MergedYValueAxisStyle,
  type RectCoordsDims,
  type RenderContext,
  toAbbrevAuto,
} from "../../deps.ts";
import { SIZING_SAMPLE } from "../../dimension_helpers.ts";
import type {
  ChartValueAxisLimits,
  YAxisWidthInfoBase,
  YValueAxisWidthInfo,
} from "../../types.ts";
import { getGoodAxisTickValues } from "../get_good_axis_tick_values.ts";
import { resolveValueAxisLimits } from "../resolve_value_axis_limits.ts";

function measureYValueAxisLabelAndGapWidth(
  rc: RenderContext,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
): number {
  if (!axisLabel) return 0;
  return rc.mText(
    axisLabel,
    sy.text.yValueAxisLabel,
    Number.POSITIVE_INFINITY,
    { rotation: "anticlockwise" },
  ).dims.w() + sy.axisLabelGap;
}

function measureYValueAxisWidth(
  rc: RenderContext,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
  tickLabelW: number,
  tierHeaderAndLabelGapWidth: number,
): number {
  if (sy.exactAxisX !== "none") return sy.exactAxisX + sg.axisStrokeWidth;
  return tierHeaderAndLabelGapWidth +
    measureYValueAxisLabelAndGapWidth(rc, axisLabel, sy) +
    tickLabelW + sy.tickLabelGap + sy.tickLength + sg.axisStrokeWidth;
}

export function estimateMinYValueAxisWidth(
  rc: RenderContext,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
  tierHeaderAndLabelGapWidth: number,
): number {
  const sampleLabel = rc.mText(
    SIZING_SAMPLE.valueAxisTickWide,
    sy.text.yValueAxisTickLabels,
    Infinity,
  );
  return measureYValueAxisWidth(
    rc,
    axisLabel,
    sy,
    sg,
    sampleLabel.dims.w(),
    tierHeaderAndLabelGapWidth,
  );
}

export function measureYValueAxisWidthInfo(
  rc: RenderContext,
  dy: ChartValueAxisLimits,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
  innerRcd: RectCoordsDims,
  i_pane: number,
  tierHeaderAndLabelGapWidth: number,
  nTiers: number,
): YValueAxisWidthInfo {
  const guessSubChartH = (innerRcd.h() * 0.8) / nTiers;
  const yAxisTickLabelH = rc
    .mText(
      SIZING_SAMPLE.valueAxisTickPct,
      sy.text.yValueAxisTickLabels,
      Number.POSITIVE_INFINITY,
    )
    .dims.h();
  const halfYAxisTickLabelH = yAxisTickLabelH / 2;
  const guessMaxNTicks = yAxisTickLabelH > 0
    ? Math.max(2, Math.floor(guessSubChartH / 2 / yAxisTickLabelH))
    : 2;

  const formatterOption = sy.tickLabelFormatter;
  const formatterForUniquenessCheck = typeof formatterOption === "function"
    ? formatterOption
    : undefined;

  const yAxisTickValues = Array.from({ length: nTiers }, (_, i_tier) => {
    const dataMin = sy.allowIndividualTierLimits
      ? (dy.paneLimits[i_pane].tierLimits[i_tier]?.valueMin ?? 0)
      : dy.paneLimits[i_pane].valueMin;
    const dataMax = sy.allowIndividualTierLimits
      ? (dy.paneLimits[i_pane].tierLimits[i_tier]?.valueMax ?? 1)
      : dy.paneLimits[i_pane].valueMax;
    const { valueMin, valueMax } = resolveValueAxisLimits(
      sy.min,
      sy.max,
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
      : formatterOption === "auto-percent"
      ? buildAutoFormatter(yAxisTickValues.flat(), "percent")
      : toAbbrevAuto;

  let maxYTickWidth = 0;
  for (const rowYTickValues of yAxisTickValues) {
    for (const tickValue of rowYTickValues) {
      const tickLabel = tickLabelFormatter(tickValue);
      const mTickLabel = rc.mText(
        tickLabel,
        sy.text.yValueAxisTickLabels,
        9999,
      );
      maxYTickWidth = Math.max(maxYTickWidth, mTickLabel.dims.w());
    }
  }

  const widthIncludingYAxisStrokeWidth = measureYValueAxisWidth(
    rc,
    axisLabel,
    sy,
    sg,
    maxYTickWidth,
    tierHeaderAndLabelGapWidth,
  );

  return {
    widthIncludingYAxisStrokeWidth,
    yAxisTickValues,
    tierHeaderAndLabelGapWidth,
    halfYAxisTickLabelH,
    tickLabelFormatter,
  };
}

export function measureYValueAxis(
  topHeightForLaneHeaders: number,
  xAxisHeightIncludingStroke: number,
  yAxisWidthInfo: YAxisWidthInfoBase,
  tiers: { paddingTop: number; paddingBottom: number; gapY: number },
  innerRcd: RectCoordsDims,
  nTiers: number,
  tierHeaderAndLabelGapHeight: number,
): {
  yAxisRcd: RectCoordsDims;
  uniformSubChartHeight: number;
} {
  const my = yAxisWidthInfo;

  const yAxisRcd = innerRcd.getAdjusted((prev) => ({
    y: prev.y() + topHeightForLaneHeaders,
    w: my.widthIncludingYAxisStrokeWidth,
    h: prev.h() - (topHeightForLaneHeaders + xAxisHeightIncludingStroke),
  }));

  const uniformSubChartHeight = (yAxisRcd.h() -
    (tiers.paddingTop +
      (nTiers - 1) * tiers.gapY +
      tiers.paddingBottom +
      nTiers * tierHeaderAndLabelGapHeight)) /
    nTiers;

  return { yAxisRcd, uniformSubChartHeight };
}
