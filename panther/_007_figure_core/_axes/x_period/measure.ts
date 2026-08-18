// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  MergedXPeriodAxisStyle,
  PeriodType,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YAxisWidthInfoBase } from "../../types.ts";
import {
  calculateYearSkipInterval,
  getLargeLabelExemplar,
  getLargeLabelForms,
  getPeriodAxisInfo,
  labelFitsCell,
} from "./helpers.ts";
import type { XPeriodAxisMeasuredInfo } from "./types.ts";

// Air kept between neighbouring year labels, in ems of the tick-label font so
// it scales with the figure like everything else on the axis.
const _LABEL_GAP_EM = 0.6;

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

  const heightIncludingXAxisStrokeWidth = gridStyle.axisStrokeWidth + maxTickH;

  const xAxisRcd = contentRcd.getAdjusted((prev) => ({
    x: prev.x() + yAxisAreaWidthIncludingStroke,
    y: prev.bottomY() - heightIncludingXAxisStrokeWidth,
    w: xAxisW,
    h: heightIncludingXAxisStrokeWidth,
  }));

  const largeLabelForms = getLargeLabelForms(periodType, sx.calendar).map((
    form,
  ) => ({
    form,
    w: rc
      .mText(
        getLargeLabelExemplar(form),
        sx.text.xPeriodAxisTickLabels,
        Number.POSITIVE_INFINITY,
      )
      .dims.w(),
  }));
  const shortestFormW = largeLabelForms[largeLabelForms.length - 1].w;

  // Year-centered advances one increment per year with no grid stroke between
  // periods; every other rung advances stroke + increment per period.
  const isYearCentered = periodAxisType === "year-centered";
  const widthPerYear = isYearCentered
    ? periodIncrementWidth
    : getPeriodsPerYear(periodType) *
      (periodIncrementWidth + gridStyle.gridStrokeWidth);

  const labelGap = _LABEL_GAP_EM * sx.text.xPeriodAxisTickLabels.fontSize;
  const yearSkipInterval = Math.max(
    sx.showEveryNthTick,
    calculateYearSkipInterval(widthPerYear, shortestFormW, labelGap),
  );

  const boundaryTicksEveryYear = !isYearCentered &&
    labelFitsCell(shortestFormW, widthPerYear - gridStyle.gridStrokeWidth);

  return {
    subChartAreaWidth,
    periodIncrementWidth,
    xAxisRcd,
    periodAxisType,
    periodAxisSmallTickH,
    largeLabelForms,
    yearSkipInterval,
    labelSpan: widthPerYear * yearSkipInterval,
    labelGap,
    boundaryTicksEveryYear,
  };
}

function getPeriodsPerYear(periodType: PeriodType): number {
  if (periodType === "year-month") {
    return 12;
  }
  if (periodType === "year-quarter") {
    return 4;
  }
  return 1;
}
