// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { decodePeriod, getLanguage } from "../../deps.ts";
import type {
  CalendarType,
  Language,
  MergedGridStyle,
  MergedXPeriodAxisStyle,
  PeriodType,
  RenderContext,
} from "../../deps.ts";
import type { PeriodAxisType } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                          Period Label Functions                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

const MONTHS_THREE_CHARS_BY_LANG: Record<Language, string[]> = {
  en: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  fr: [
    "Janv",
    "Févr",
    "Mars",
    "Avr",
    "Mai",
    "Juin",
    "Juil",
    "Août",
    "Sept",
    "Oct",
    "Nov",
    "Déc",
  ],
  pt: [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ],
};

export function get_MONTHS_THREE_CHARS(calendar?: CalendarType) {
  if (calendar === "ethiopian") {
    return [
      "Mes",
      "Tik",
      "Hid",
      "Tah",
      "Tir",
      "Yek",
      "Meg",
      "Mia",
      "Gin",
      "Sen",
      "Ham",
      "Neh",
    ];
  }
  return MONTHS_THREE_CHARS_BY_LANG[getLanguage()];
}

export function get_MONTHS_ONE_CHARS(calendar?: CalendarType) {
  if (calendar === "ethiopian") {
    return ["M", "T", "H", "T", "T", "Y", "M", "M", "G", "S", "H", "N"];
  }
  return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
}

const QUARTERS_TWO_CHARS_BY_LANG: Record<Language, string[]> = {
  en: ["Q1", "Q2", "Q3", "Q4"],
  fr: ["T1", "T2", "T3", "T4"],
  pt: ["T1", "T2", "T3", "T4"],
};

export function get_QUARTERS_TWO_CHARS() {
  return QUARTERS_TWO_CHARS_BY_LANG[getLanguage()];
}

export const _QUARTERS_ONE_CHARS = ["1", "2", "3", "4"];

export function getSmallPeriodLabelIfAny(
  v: number | string,
  periodAxisType: PeriodAxisType,
  calendar: CalendarType,
): string | undefined {
  if (periodAxisType === "month-three-year") {
    const { subPeriod } = decodePeriod(v, "year-month");
    return get_MONTHS_THREE_CHARS(calendar)[subPeriod - 1] ?? "?";
  }
  if (periodAxisType === "month-one-year") {
    const { subPeriod } = decodePeriod(v, "year-month");
    return get_MONTHS_ONE_CHARS(calendar)[subPeriod - 1] ?? "?";
  }
  if (periodAxisType === "month-none-year") {
    return undefined;
  }
  if (periodAxisType === "quarter-two-year") {
    const { subPeriod } = decodePeriod(v, "year-quarter");
    return get_QUARTERS_TWO_CHARS()[subPeriod - 1] ?? "?";
  }
  if (periodAxisType === "quarter-one-year") {
    const { subPeriod } = decodePeriod(v, "year-quarter");
    return _QUARTERS_ONE_CHARS[subPeriod - 1] ?? "?";
  }
  if (periodAxisType === "quarter-none-year") {
    return undefined;
  }
  if (periodAxisType === "year-side") {
    return undefined;
  }
  if (periodAxisType === "year-centered") {
    return String(v).slice(0, 4);
  }
  throw new Error("Should not be possible");
}

export function getLargePeriodLabel(
  v: number | string,
  digits: "two" | "four",
): string {
  if (digits === "four") {
    return String(v).slice(0, 4);
  }
  return String(v).slice(2, 4);
}

export function isLargePeriod(
  v: number | string,
  periodType: PeriodType,
): boolean {
  if (periodType === "year-month") {
    return decodePeriod(v, "year-month").subPeriod === 1;
  }
  if (periodType === "year-quarter") {
    return decodePeriod(v, "year-quarter").subPeriod === 1;
  }
  return true;
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                         Get Period Axis Info                               //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

type PeriodAxisInfo = {
  periodAxisType: PeriodAxisType;
  periodAxisSmallTickH: number | "none";
  maxTickH: number;
};

const _PIXEL_PAD = 2;
const _VERY_SMALL_TICK_H = 10;

export function getPeriodAxisInfo(
  rc: RenderContext,
  periodType: PeriodType,
  axisStyle: MergedXPeriodAxisStyle,
  gridStyle: MergedGridStyle,
  periodIncrementWidth: number,
  _showEveryNthTick: number,
): PeriodAxisInfo {
  const smallLabelH = rc
    .mText(
      "Jan",
      axisStyle.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    )
    .dims.h();
  const largeLabelH = rc
    .mText(
      "2022",
      axisStyle.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    )
    .dims.h();

  ////////////////
  //            //
  //    Month   //
  //            //
  ////////////////

  if (periodType === "year-month") {
    const _MONTHS_THREE_CHARS = get_MONTHS_THREE_CHARS(axisStyle.calendar);
    const _MONTHS_ONE_CHARS = get_MONTHS_ONE_CHARS(axisStyle.calendar);
    if (
      getMaxWidthWord(rc, axisStyle, _MONTHS_THREE_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = axisStyle.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        axisStyle.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "month-three-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    if (
      getMaxWidthWord(rc, axisStyle, _MONTHS_ONE_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = axisStyle.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        axisStyle.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "month-one-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    if (gridStyle.gridStrokeWidth < periodIncrementWidth / 2) {
      const periodAxisSmallTickH = _VERY_SMALL_TICK_H;
      const maxTickH = periodAxisSmallTickH +
        axisStyle.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "month-none-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    const periodAxisSmallTickH = "none";
    const maxTickH = axisStyle.periodLabelLargeTopPadding + largeLabelH;
    return {
      periodAxisType: "year-side",
      periodAxisSmallTickH,
      maxTickH,
    };
  }

  ///////////////////
  //               //
  //    Quarter    //
  //               //
  ///////////////////

  if (periodType === "year-quarter") {
    const _QUARTERS_TWO_CHARS = get_QUARTERS_TWO_CHARS();
    if (
      getMaxWidthWord(rc, axisStyle, _QUARTERS_TWO_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = axisStyle.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        axisStyle.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "quarter-two-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    if (
      getMaxWidthWord(rc, axisStyle, _QUARTERS_ONE_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = axisStyle.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        axisStyle.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "quarter-one-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    if (gridStyle.gridStrokeWidth < periodIncrementWidth / 2) {
      const periodAxisSmallTickH = 10;
      const maxTickH = periodAxisSmallTickH +
        axisStyle.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "quarter-none-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    const periodAxisSmallTickH = "none";
    const maxTickH = axisStyle.periodLabelLargeTopPadding + largeLabelH;
    return {
      periodAxisType: "year-side",
      periodAxisSmallTickH,
      maxTickH,
    };
  }

  ////////////////
  //            //
  //    Year    //
  //            //
  ////////////////

  if (periodType === "year") {
    if (axisStyle.forceSideTicksWhenYear) {
      const periodAxisSmallTickH = "none";
      const maxTickH = axisStyle.periodLabelLargeTopPadding + largeLabelH;
      return {
        periodAxisType: "year-side",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    const periodAxisSmallTickH = _VERY_SMALL_TICK_H;
    // Always need space for labels, even if only showing every Nth
    const maxTickH = periodAxisSmallTickH +
      axisStyle.periodLabelSmallTopPadding +
      smallLabelH;
    return {
      periodAxisType: "year-centered",
      periodAxisSmallTickH,
      maxTickH,
    };
  }
  throw new Error("Should not be possible");
}

function getMaxWidthWord(
  rc: RenderContext,
  axisStyle: MergedXPeriodAxisStyle,
  words: string[],
): number {
  let maxWidth = 0;
  for (const word of words) {
    const mText = rc.mText(
      word,
      axisStyle.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    );
    if (mText.dims.w() > maxWidth) {
      maxWidth = mText.dims.w();
    }
  }
  return maxWidth;
}

export function getYearDigits(
  availableSpace: number,
  fourDigitW: number,
): "four" | "two" {
  const minWidthNeeded = fourDigitW + (fourDigitW / 2);
  return minWidthNeeded < availableSpace ? "four" : "two";
}

export function calculateYearSkipInterval(
  rc: RenderContext,
  periodType: PeriodType,
  periodAxisType: PeriodAxisType,
  periodIncrementWidth: number,
  axisStyle: MergedXPeriodAxisStyle,
): number {
  const twoDigitYearW = rc
    .mText(
      "22",
      axisStyle.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    )
    .dims.w();
  const minWidthNeeded = twoDigitYearW + (twoDigitYearW / 2);

  let periodsPerYear: number;
  if (periodType === "year-month") periodsPerYear = 12;
  else if (periodType === "year-quarter") periodsPerYear = 4;
  else periodsPerYear = 1;

  const widthPerYear = periodAxisType === "year-centered"
    ? periodIncrementWidth
    : periodIncrementWidth * periodsPerYear;

  const skipIntervals = [1, 2, 5, 10, 20, 50, 100];
  for (const interval of skipIntervals) {
    if (widthPerYear * interval >= minWidthNeeded) {
      return interval;
    }
  }

  return 100;
}

export function shouldShowYearBoundary(
  v: number | string,
  periodType: PeriodType,
  skipInterval: number,
): boolean {
  if (!isLargePeriod(v, periodType)) return false;

  const year = decodePeriod(v, periodType).year;

  if (skipInterval === 1) return true;
  if (skipInterval === 2) return year % 2 === 0;
  if (skipInterval === 5) return year % 5 === 0;
  if (skipInterval === 10) return year % 10 === 0;
  if (skipInterval === 20) return year % 20 === 0;
  if (skipInterval === 50) return year % 50 === 0;
  return year % 100 === 0;
}
