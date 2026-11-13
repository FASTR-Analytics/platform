// Copyright 2023-2026, Tim Roberton. MIT license.
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
  getLabelGap,
  getLargeLabelExemplar,
  getLargeLabelForms,
  getPeriodAxisInfo,
  labelFitsSpan,
} from "./helpers.ts";
import type { XPeriodAxisMeasuredInfo } from "./types.ts";

export function measureXPeriodAxis(
  rc: RenderContext,
  innerRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfoBase,
  uniformSubChartWidth: number,
  periodType: "year-month" | "year-quarter" | "year",
  nTimePoints: number,
  axisStyle: MergedXPeriodAxisStyle,
  gridStyle: MergedGridStyle,
): XPeriodAxisMeasuredInfo {
  const sx = axisStyle;

  const yAxisWidthIncludingStroke =
    yAxisWidthInfo.widthIncludingYAxisStrokeWidth;

  const xAxisW = innerRcd.w() - yAxisWidthIncludingStroke;

  const slotExtent = periodType === "year" && !sx.forceSideTicksWhenYear
    ? uniformSubChartWidth / nTimePoints
    : (uniformSubChartWidth -
      gridStyle.gridLineStrokeWidth * (nTimePoints + 1)) /
      nTimePoints;

  const { periodAxisType, maxTickH, periodAxisSmallTickH } = getPeriodAxisInfo(
    rc,
    periodType,
    axisStyle,
    slotExtent,
  );

  const heightIncludingXAxisStrokeWidth = gridStyle.axisStrokeWidth + maxTickH;

  const xAxisRcd = innerRcd.getAdjusted((prev) => ({
    x: prev.x() + yAxisWidthIncludingStroke,
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
    ? slotExtent
    : getPeriodsPerYear(periodType) *
      (slotExtent + gridStyle.gridLineStrokeWidth);

  const labelGap = getLabelGap(sx);
  const yearSkipInterval = Math.max(
    sx.showEveryNthTick,
    calculateYearSkipInterval(widthPerYear, shortestFormW, labelGap),
  );

  const boundaryTicksEveryYear = !isYearCentered &&
    labelFitsSpan(
      shortestFormW,
      widthPerYear - gridStyle.gridLineStrokeWidth - labelGap,
    );

  return {
    uniformSubChartWidth,
    slotExtent,
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
