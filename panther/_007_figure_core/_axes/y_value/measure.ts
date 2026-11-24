// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildAutoFormatter,
  type ChartValueAxis,
  type MergedGridStyle,
  type MergedYValueAxisStyle,
  type RectCoordsDims,
  type RenderContext,
  toAbbrevAuto,
} from "../../deps.ts";
import { SIZING_SAMPLE } from "../../dimension_helpers.ts";
import type {
  ChartValueAxisLimits,
  SecondValueAxisDataTransformed,
  ValueRange,
  YValueAxisWidthInfo,
} from "../../types.ts";
import {
  formatterForUniquenessCheck,
  getAlignedAxisTickValues,
  getGoodAxisTickValues,
} from "../get_good_axis_tick_values.ts";
import { resolveTierOrLaneValueAxisLimits } from "../resolve_value_axis_limits.ts";

// The first y value axis's label reads bottom to top on its left, the
// second's top to bottom on its right, each with the tops of its letters
// outward, as ggplot2 sets a right axis title.
export function yValueAxisLabelRotation(
  valueAxis: ChartValueAxis,
): "anticlockwise" | "clockwise" {
  return valueAxis === "first" ? "anticlockwise" : "clockwise";
}

function measureYValueAxisLabelAndGapWidth(
  rc: RenderContext,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  valueAxis: ChartValueAxis,
): number {
  if (!axisLabel) return 0;
  return rc.mText(
    axisLabel,
    sy.text.yValueAxisLabel,
    Number.POSITIVE_INFINITY,
    { rotation: yValueAxisLabelRotation(valueAxis) },
  ).dims.w() + sy.axisLabelGap;
}

function measureYValueAxisWidth(
  rc: RenderContext,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
  tickLabelW: number,
  tierHeaderAndLabelGapWidth: number,
  valueAxis: ChartValueAxis,
): number {
  if (sy.exactAxisX !== "none") return sy.exactAxisX + sg.axisStrokeWidth;
  return tierHeaderAndLabelGapWidth +
    measureYValueAxisLabelAndGapWidth(rc, axisLabel, sy, valueAxis) +
    tickLabelW + sy.tickLabelGap + sy.tickLength + sg.axisStrokeWidth;
}

// The y axes of a chart-ov or a timeseries, estimated: the first beside the
// left tier headers and, where the data assigns series to it, the second,
// which no tier header stands beside.
export function estimateMinYValueAxesWidth(
  rc: RenderContext,
  yValueAxisLabel: string | undefined,
  secondValueAxis: SecondValueAxisDataTransformed | undefined,
  ms: {
    yValueAxis: MergedYValueAxisStyle;
    secondValueAxis: MergedYValueAxisStyle;
    grid: MergedGridStyle;
  },
  tierHeaderAndLabelGapWidth: number,
): number {
  return estimateMinYValueAxisWidth(
    rc,
    yValueAxisLabel,
    ms.yValueAxis,
    ms.grid,
    tierHeaderAndLabelGapWidth,
    "first",
  ) +
    (secondValueAxis === undefined ? 0 : estimateMinYValueAxisWidth(
      rc,
      secondValueAxis.axisLabel,
      ms.secondValueAxis,
      ms.grid,
      0,
      "second",
    ));
}

export function estimateMinYValueAxisWidth(
  rc: RenderContext,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
  tierHeaderAndLabelGapWidth: number,
  valueAxis: ChartValueAxis,
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
    valueAxis,
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
  const yAxisTickLabelH = measureYAxisTickLabelH(rc, sy);
  const guessMaxNTicks = yAxisTickLabelH > 0
    ? Math.max(2, Math.floor(guessSubChartH / 2 / yAxisTickLabelH))
    : 2;

  const yAxisTickValues = Array.from({ length: nTiers }, (_, i_tier) => {
    const { valueMin, valueMax } = resolveTierValueAxisLimits(
      dy,
      sy,
      i_pane,
      i_tier,
    );
    return getGoodAxisTickValues(
      valueMax,
      valueMin,
      guessMaxNTicks,
      formatterForUniquenessCheck(sy.tickLabelFormatter),
    );
  });

  return completeYValueAxisWidthInfo(
    rc,
    yAxisTickValues,
    axisLabel,
    sy,
    sg,
    yAxisTickLabelH / 2,
    tierHeaderAndLabelGapWidth,
    "first",
  );
}

// In each tier the second axis takes as many ticks as the first, so they
// stand on the first's grid lines. No tier header stands beside it.
export function measureSecondYValueAxisWidthInfo(
  rc: RenderContext,
  dy: ChartValueAxisLimits,
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
  i_pane: number,
  firstAxisTickValues: number[][],
): YValueAxisWidthInfo {
  const yAxisTickValues = firstAxisTickValues.map(
    (firstTickValues, i_tier) => {
      const { valueMin, valueMax } = resolveTierValueAxisLimits(
        dy,
        sy,
        i_pane,
        i_tier,
      );
      return getAlignedAxisTickValues(
        firstTickValues,
        valueMin,
        valueMax,
        formatterForUniquenessCheck(sy.tickLabelFormatter),
      );
    },
  );

  return completeYValueAxisWidthInfo(
    rc,
    yAxisTickValues,
    axisLabel,
    sy,
    sg,
    measureYAxisTickLabelH(rc, sy) / 2,
    0,
    "second",
  );
}

function measureYAxisTickLabelH(
  rc: RenderContext,
  sy: MergedYValueAxisStyle,
): number {
  return rc
    .mText(
      SIZING_SAMPLE.valueAxisTickPct,
      sy.text.yValueAxisTickLabels,
      Number.POSITIVE_INFINITY,
    )
    .dims.h();
}

function resolveTierValueAxisLimits(
  dy: ChartValueAxisLimits,
  sy: MergedYValueAxisStyle,
  i_pane: number,
  i_tier: number,
): ValueRange {
  return resolveTierOrLaneValueAxisLimits(
    dy,
    "tier",
    sy.allowIndividualTierLimits,
    sy.min,
    sy.max,
    i_pane,
    i_tier,
  );
}

function completeYValueAxisWidthInfo(
  rc: RenderContext,
  yAxisTickValues: number[][],
  axisLabel: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
  halfYAxisTickLabelH: number,
  tierHeaderAndLabelGapWidth: number,
  valueAxis: ChartValueAxis,
): YValueAxisWidthInfo {
  const formatterOption = sy.tickLabelFormatter;
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
    valueAxis,
  );

  return {
    widthIncludingYAxisStrokeWidth,
    yAxisTickValues,
    tierHeaderAndLabelGapWidth,
    halfYAxisTickLabelH,
    tickLabelFormatter,
  };
}
