// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  MergedXPeriodAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YAxisWidthInfoBase } from "../../types.ts";
import { calculateYearSkipInterval, getPeriodAxisInfo } from "./helpers.ts";
import type { XPeriodAxisMeasuredInfo } from "./types.ts";

export function measureXPeriodAxis(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfoBase,
  subChartAreaWidth: number,
  periodType: "year-month" | "year-quarter" | "year",
  nTimePoints: number,
  axisStyle: MergedXPeriodAxisStyle,
  gridStyle: MergedGridStyle,
): XPeriodAxisMeasuredInfo {
  const sx = axisStyle;

  const yAxisAreaWidthIncludingStroke =
    yAxisWidthInfo.widthIncludingYAxisStrokeWidth;

  const xAxisW = contentRcd.w() - yAxisAreaWidthIncludingStroke;

  const periodIncrementWidth =
    periodType === "year" && !sx.forceSideTicksWhenYear
      ? subChartAreaWidth / nTimePoints
      : (subChartAreaWidth - gridStyle.gridStrokeWidth * (nTimePoints + 1)) /
        nTimePoints;

  const { periodAxisType, maxTickH, periodAxisSmallTickH } = getPeriodAxisInfo(
    rc,
    periodType,
    axisStyle,
    gridStyle,
    periodIncrementWidth,
    sx.showEveryNthTick,
  );

  const autoCalculatedSkipInterval = calculateYearSkipInterval(
    rc,
    periodType,
    periodAxisType,
    periodIncrementWidth,
    axisStyle,
  );

  const yearSkipInterval = Math.max(
    sx.showEveryNthTick,
    autoCalculatedSkipInterval,
  );

  const heightIncludingXAxisStrokeWidth = gridStyle.axisStrokeWidth + maxTickH;

  const xAxisRcd = contentRcd.getAdjusted((prev) => ({
    x: prev.x() + yAxisAreaWidthIncludingStroke,
    y: prev.bottomY() - heightIncludingXAxisStrokeWidth,
    w: xAxisW,
    h: heightIncludingXAxisStrokeWidth,
  }));

  const fourDigitYearW = rc
    .mText("2022", sx.text.xPeriodAxisTickLabels, Number.POSITIVE_INFINITY)
    .dims.w();

  return {
    subChartAreaWidth,
    periodIncrementWidth,
    xAxisRcd,
    periodAxisType,
    periodAxisSmallTickH,
    fourDigitYearW,
    yearSkipInterval,
  };
}
