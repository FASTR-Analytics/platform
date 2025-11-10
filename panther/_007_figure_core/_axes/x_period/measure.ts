// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedTimeseriesStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YScaleAxisWidthInfo } from "../../types.ts";
import { getPeriodAxisInfo } from "./helpers.ts";
import type { XPeriodAxisMeasuredInfo } from "./types.ts";

// NOTE: This function depends on TimeseriesDataTransformed from _010_timeseries
// We pass the needed data as parameters to avoid importing from higher-numbered modules
export function measureXPeriodAxis(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  periodType: "year-month" | "year-quarter" | "year",
  nTimePoints: number,
  nLanes: number,
  s: MergedTimeseriesStyle,
): XPeriodAxisMeasuredInfo {
  const sx = s.xPeriodAxis;

  const yAxisAreaWidthIncludingStroke =
    yScaleAxisWidthInfo.widthIncludingYAxisStrokeWidth;

  const xAxisW = contentRcd.w() - yAxisAreaWidthIncludingStroke;

  const subChartAreaWidth = (xAxisW -
    (sx.lanePaddingLeft +
      (nLanes - 1) * sx.laneGapX +
      sx.lanePaddingRight)) /
    nLanes;

  const periodIncrementWidth =
    periodType === "year" && !s.xPeriodAxis.forceSideTicksWhenYear
      ? subChartAreaWidth / nTimePoints
      : (subChartAreaWidth - s.grid.gridStrokeWidth * (nTimePoints + 1)) /
        nTimePoints;

  const { periodAxisType, maxTickH, periodAxisSmallTickH } = getPeriodAxisInfo(
    rc,
    periodType,
    s,
    s.grid,
    periodIncrementWidth,
    s.xPeriodAxis.showEveryNthTick,
  );

  const heightIncludingXAxisStrokeWidth = s.grid.axisStrokeWidth + maxTickH;

  const xAxisRcd = contentRcd.getAdjusted((prev) => ({
    x: prev.x() + yAxisAreaWidthIncludingStroke,
    y: prev.bottomY() - heightIncludingXAxisStrokeWidth,
    w: xAxisW,
    h: heightIncludingXAxisStrokeWidth,
  }));

  const fourDigitYearW = rc
    .mText("2022", s.text.base, Number.POSITIVE_INFINITY)
    .dims.w();

  return {
    subChartAreaWidth,
    periodIncrementWidth,
    xAxisRcd,
    periodAxisType,
    periodAxisSmallTickH,
    fourDigitYearW,
  };
}
