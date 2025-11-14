// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CalendarType,
  MergedGridStyle,
  MergedTimeseriesStyle,
  PeriodType,
  RenderContext,
} from "../../deps.ts";
import type { PeriodAxisType } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                          Period Label Functions                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

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
  if (calendar === "french") {
    return [
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
    ];
  }
  return [
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
  ];
}

export function get_MONTHS_ONE_CHARS(calendar?: CalendarType) {
  if (calendar === "ethiopian") {
    return ["M", "T", "H", "T", "T", "Y", "M", "M", "G", "S", "H", "N"];
  }
  return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
}

export function get_QUARTERS_TWO_CHARS(calendar?: CalendarType) {
  if (calendar === "french") {
    return ["T1", "T2", "T3", "T4"];
  }
  return ["Q1", "Q2", "Q3", "Q4"];
}

export const _QUARTERS_ONE_CHARS = ["1", "2", "3", "4"];

export function getSmallPeriodLabelIfAny(
  v: number | string,
  periodAxisType: PeriodAxisType,
  calendar: CalendarType,
): string | undefined {
  const str = String(v);
  if (periodAxisType === "month-three-year") {
    const smallIndex = Number(str.slice(4, 6)) - 1;
    return get_MONTHS_THREE_CHARS(calendar)[smallIndex] ?? "?";
  }
  if (periodAxisType === "month-one-year") {
    const smallIndex = Number(str.slice(4, 6)) - 1;
    return get_MONTHS_ONE_CHARS(calendar)[smallIndex] ?? "?";
  }
  if (periodAxisType === "month-none-year") {
    return undefined;
  }
  if (periodAxisType === "quarter-two-year") {
    const smallIndex = Number(str.slice(4, 6)) - 1;
    return get_QUARTERS_TWO_CHARS(calendar)[smallIndex] ?? "?";
  }
  if (periodAxisType === "quarter-one-year") {
    const smallIndex = Number(str.slice(4, 6)) - 1;
    return _QUARTERS_ONE_CHARS[smallIndex] ?? "?";
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
  const str = String(v);
  if (periodType === "year-month") {
    const small = str.slice(4, 6);
    return small === "01";
  }
  if (periodType === "year-quarter") {
    const small = str.slice(4, 6);
    return small === "01";
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
  s: MergedTimeseriesStyle,
  gridStyle: MergedGridStyle,
  periodIncrementWidth: number,
  showEveryNthTick: number,
): PeriodAxisInfo {
  const smallLabelH = rc
    .mText(
      "Jan",
      s.xPeriodAxis.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    )
    .dims.h();
  const largeLabelH = rc
    .mText(
      "2022",
      s.xPeriodAxis.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    )
    .dims.h();

  ////////////////
  //            //
  //    Month   //
  //            //
  ////////////////

  if (periodType === "year-month") {
    const _MONTHS_THREE_CHARS = get_MONTHS_THREE_CHARS(s.xPeriodAxis.calendar);
    const _MONTHS_ONE_CHARS = get_MONTHS_ONE_CHARS(s.xPeriodAxis.calendar);
    if (
      getMaxWidthWord(rc, s, _MONTHS_THREE_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = s.xPeriodAxis.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        s.xPeriodAxis.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "month-three-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    if (
      getMaxWidthWord(rc, s, _MONTHS_ONE_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = s.xPeriodAxis.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        s.xPeriodAxis.periodLabelLargeTopPadding +
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
        s.xPeriodAxis.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "month-none-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    const periodAxisSmallTickH = "none";
    const maxTickH = s.xPeriodAxis.periodLabelLargeTopPadding + largeLabelH;
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
    const _QUARTERS_TWO_CHARS = get_QUARTERS_TWO_CHARS(s.xPeriodAxis.calendar);
    if (
      getMaxWidthWord(rc, s, _QUARTERS_TWO_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = s.xPeriodAxis.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        s.xPeriodAxis.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "quarter-two-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    if (
      getMaxWidthWord(rc, s, _QUARTERS_ONE_CHARS) + _PIXEL_PAD <
        periodIncrementWidth
    ) {
      const periodAxisSmallTickH = s.xPeriodAxis.periodLabelSmallTopPadding +
        smallLabelH;
      const maxTickH = periodAxisSmallTickH +
        s.xPeriodAxis.periodLabelLargeTopPadding +
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
        s.xPeriodAxis.periodLabelLargeTopPadding +
        largeLabelH;
      return {
        periodAxisType: "quarter-none-year",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    const periodAxisSmallTickH = "none";
    const maxTickH = s.xPeriodAxis.periodLabelLargeTopPadding + largeLabelH;
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
    if (s.xPeriodAxis.forceSideTicksWhenYear) {
      const periodAxisSmallTickH = "none";
      const maxTickH = s.xPeriodAxis.periodLabelLargeTopPadding + largeLabelH;
      return {
        periodAxisType: "year-side",
        periodAxisSmallTickH,
        maxTickH,
      };
    }
    const periodAxisSmallTickH = _VERY_SMALL_TICK_H;
    // Always need space for labels, even if only showing every Nth
    const maxTickH = periodAxisSmallTickH +
      s.xPeriodAxis.periodLabelSmallTopPadding +
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
  s: MergedTimeseriesStyle,
  words: string[],
): number {
  let maxWidth = 0;
  for (const word of words) {
    const mText = rc.mText(
      word,
      s.xPeriodAxis.text.xPeriodAxisTickLabels,
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
  return fourDigitW + _PIXEL_PAD < availableSpace ? "four" : "two";
}
