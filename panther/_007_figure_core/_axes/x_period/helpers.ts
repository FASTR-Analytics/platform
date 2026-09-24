// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { decodePeriod, getLanguage } from "../../deps.ts";
import type {
  CalendarType,
  Language,
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

const QUARTERS_TWO_CHARS_BY_LANG: Record<Language, string[]> = {
  en: ["Q1", "Q2", "Q3", "Q4"],
  fr: ["T1", "T2", "T3", "T4"],
  pt: ["T1", "T2", "T3", "T4"],
};

export function get_QUARTERS_TWO_CHARS() {
  return QUARTERS_TWO_CHARS_BY_LANG[getLanguage()];
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                        Fiscal Year (July-June)                             //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// The FY calendar is a pure relabeling of quarter ids: July already falls on a
// calendar-quarter boundary, so calendar Q3 is fiscal Q1. It applies to
// year-quarter axes only — year-month and year fall through to gregorian.

const _FY_JULY_START_QUARTER = 3;

// Representative quarter id (2025 Q3 = the start of FY2025/26), used to size
// label exemplars so the width budget always tracks the real label format.
const _FY_EXEMPLAR_PERIOD_ID = 20253;

const _YEAR_EXEMPLAR_FOUR_DIGIT = "2022";
const _YEAR_EXEMPLAR_TWO_DIGIT = "22";

const FY_PREFIX_BY_LANG: Record<Language, string> = {
  en: "FY",
  fr: "EF",
  pt: "AF",
};

export function isFiscalYearQuarterAxis(
  periodType: PeriodType,
  calendar: CalendarType,
): boolean {
  return calendar === "gregorian-fy-july" && periodType === "year-quarter";
}

function getFiscalYearStartYear(year: number, subPeriod: number): number {
  return subPeriod < _FY_JULY_START_QUARTER ? year - 1 : year;
}

function getFiscalQuarter(subPeriod: number): number {
  return ((subPeriod - _FY_JULY_START_QUARTER + 4) % 4) + 1;
}

// The large-label fallback ladder. A form fully determines both what the label
// says and how the period is decoded, so rendering needs nothing else.
//   gregorian:  2022        -> 22
//   FY:         FY2025/26   -> FY25/26   -> 25/26
export type LargeLabelForm =
  | "year-four"
  | "year-two"
  | "fy-full"
  | "fy-compact"
  | "fy-short";

export function getLargeLabelForms(
  periodType: PeriodType,
  calendar: CalendarType,
): LargeLabelForm[] {
  if (isFiscalYearQuarterAxis(periodType, calendar)) {
    return ["fy-full", "fy-compact", "fy-short"];
  }
  return ["year-four", "year-two"];
}

// The exemplar a form's width budget is measured against. FY forms go through
// the real formatter so the localized prefix is never out of step.
export function getLargeLabelExemplar(form: LargeLabelForm): string {
  if (form === "year-four") {
    return _YEAR_EXEMPLAR_FOUR_DIGIT;
  }
  if (form === "year-two") {
    return _YEAR_EXEMPLAR_TWO_DIGIT;
  }
  return getLargePeriodLabel(_FY_EXEMPLAR_PERIOD_ID, form);
}

export function getSmallPeriodLabelIfAny(
  v: number | string,
  periodAxisType: PeriodAxisType,
  calendar: CalendarType,
): string | undefined {
  if (periodAxisType === "month-three-year") {
    const { subPeriod } = decodePeriod(v, "year-month");
    return get_MONTHS_THREE_CHARS(calendar)[subPeriod - 1] ?? "?";
  }
  if (periodAxisType === "quarter-two-year") {
    const { subPeriod } = decodePeriod(v, "year-quarter");
    const q = calendar === "gregorian-fy-july"
      ? getFiscalQuarter(subPeriod)
      : subPeriod;
    return get_QUARTERS_TWO_CHARS()[q - 1] ?? "?";
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
  form: LargeLabelForm,
): string {
  if (form === "year-four") {
    return String(v).slice(0, 4);
  }
  if (form === "year-two") {
    return String(v).slice(2, 4);
  }
  const { year, subPeriod } = decodePeriod(v, "year-quarter");
  const startYear = getFiscalYearStartYear(year, subPeriod);
  const startFour = String(startYear);
  const endTwo = String(startYear + 1).slice(2, 4);
  if (form === "fy-short") {
    return startFour.slice(2, 4) + "/" + endTwo;
  }
  const prefix = FY_PREFIX_BY_LANG[getLanguage()];
  if (form === "fy-compact") {
    return prefix + startFour.slice(2, 4) + "/" + endTwo;
  }
  return prefix + startFour + "/" + endTwo;
}

export function isLargePeriod(
  v: number | string,
  periodType: PeriodType,
  calendar: CalendarType,
): boolean {
  if (periodType === "year-month") {
    return decodePeriod(v, "year-month").subPeriod === 1;
  }
  if (periodType === "year-quarter") {
    const startQuarter = isFiscalYearQuarterAxis(periodType, calendar)
      ? _FY_JULY_START_QUARTER
      : 1;
    return decodePeriod(v, "year-quarter").subPeriod === startQuarter;
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

const _VERY_SMALL_TICK_H = 10;

// Air kept between neighbouring year labels, between a small label and its
// bounding ticks, and between a boundary tick and the year label that starts
// at it. In ems of the tick-label font so it scales with the figure like
// everything else on the axis.
const _LABEL_GAP_EM = 0.6;

export function getLabelGap(axisStyle: MergedXPeriodAxisStyle): number {
  return _LABEL_GAP_EM * axisStyle.text.xPeriodAxisTickLabels.fontSize;
}

export function getPeriodAxisInfo(
  rc: RenderContext,
  periodType: PeriodType,
  axisStyle: MergedXPeriodAxisStyle,
  periodIncrementWidth: number,
): PeriodAxisInfo {
  const labelGap = getLabelGap(axisStyle);
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
    if (
      getMaxWidthWord(rc, axisStyle, _MONTHS_THREE_CHARS) + labelGap <
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
      getMaxWidthWord(rc, axisStyle, _QUARTERS_TWO_CHARS) + labelGap <
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

// Year-label density and placement (non-year-centered rungs). A year label
// starts labelGap to the right of its boundary tick, so the room a cell offers
// a label is its width minus the tick stroke and that inset.
//
// Two independent decisions, both sized against the label ladder:
//   - skip interval N: label every Nth year band, so adjacent labels keep
//     labelGap of air between them (left-to-left distance N*bandW must clear
//     label width + gap).
//   - boundary ticks: a full-height tick at EVERY year start whenever the
//     shortest label physically fits inside one band. Only when it does not do
//     we fall back to widening the labelled cell to N bands, which is the one
//     case where a year boundary tick is dropped.

const _SKIP_INTERVALS = [1, 2, 5, 10, 20, 50, 100];

export function calculateYearSkipInterval(
  widthPerYear: number,
  shortestFormW: number,
  labelGap: number,
): number {
  const minWidthNeeded = shortestFormW + labelGap;
  for (const interval of _SKIP_INTERVALS) {
    if (widthPerYear * interval >= minWidthNeeded) {
      return interval;
    }
  }
  return _SKIP_INTERVALS[_SKIP_INTERVALS.length - 1];
}

export function labelFitsCell(labelW: number, cellInnerW: number): boolean {
  return labelW <= cellInnerW;
}

// A form is only used when the span leaves at least its own width of air to
// the next label, so labels never crowd; the gap rule remains as a floor for
// forms narrow enough that it is the stricter test.
const _FORM_SPAN_FACTOR = 2;

// Widest form that keeps the air to its neighbours (labelSpan = left-to-left
// distance of labelled bands) and fits in the room its own cell offers.
export function pickLargeLabelForm(
  labelSpan: number,
  cellInnerW: number,
  labelGap: number,
  forms: { form: LargeLabelForm; w: number }[],
): LargeLabelForm {
  for (const f of forms) {
    if (
      f.w * _FORM_SPAN_FACTOR <= labelSpan &&
      f.w + labelGap <= labelSpan &&
      labelFitsCell(f.w, cellInnerW)
    ) {
      return f.form;
    }
  }
  return forms[forms.length - 1].form;
}

export function shouldLabelYear(
  v: number | string,
  periodType: PeriodType,
  skipInterval: number,
  calendar: CalendarType,
): boolean {
  const decoded = decodePeriod(v, periodType);
  const year = isFiscalYearQuarterAxis(periodType, calendar)
    ? getFiscalYearStartYear(decoded.year, decoded.subPeriod)
    : decoded.year;
  return year % skipInterval === 0;
}
