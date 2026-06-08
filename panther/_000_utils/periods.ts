// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { assert } from "./assert.ts";
import { isFrench } from "./translate.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                                   Types                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type PeriodType = "year-month" | "year-quarter" | "year";

export type CalendarType = "gregorian" | "ethiopian" | "ethiopian-to-gregorian";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                                 Constants                                  //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export const _GLOBAL_MIN_YEAR_FOR_PERIODS = 1900;
export const _GLOBAL_MAX_YEAR_FOR_PERIODS = 2050;

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                           Conversion Functions                             //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type DecodedPeriod = {
  year: number;
  // 1-based index within the year: month (1-12) for year-month,
  // quarter (1-4) for year-quarter, 0 for year.
  subPeriod: number;
};

// Single numeric decoder for every period format. All readers below go through
// this rather than re-deriving year/sub-period with string slicing — slicing
// only worked by coincidence and silently mis-parsed off-length values.
export function decodePeriod(
  v: number | string,
  periodType: PeriodType,
): DecodedPeriod {
  const n = typeof v === "number" ? v : Number(v);
  if (periodType === "year-month") {
    return { year: Math.floor(n / 100), subPeriod: n % 100 };
  }
  if (periodType === "year-quarter") {
    return { year: Math.floor(n / 10), subPeriod: n % 10 };
  }
  if (periodType === "year") {
    return { year: n, subPeriod: 0 };
  }
  throw new Error("Bad period type");
}

export function getTimeFromPeriodId(
  v: number | string,
  periodType: PeriodType,
): number {
  const str = String(v);
  if (periodType === "year-month") {
    const { year: y, subPeriod: m } = decodePeriod(v, "year-month");
    assert(!isNaN(y), `Invalid year in period ID "${str}"`);
    assert(
      y >= _GLOBAL_MIN_YEAR_FOR_PERIODS && y <= _GLOBAL_MAX_YEAR_FOR_PERIODS,
      `Year ${y} in period ID "${str}" is outside valid range ${_GLOBAL_MIN_YEAR_FOR_PERIODS}-${_GLOBAL_MAX_YEAR_FOR_PERIODS}`,
    );
    assert(!isNaN(m), `Invalid month in period ID "${str}"`);
    assert(
      m >= 1 && m <= 12,
      `Month ${m} in period ID "${str}" must be between 1 and 12`,
    );
    const yearsSince2000 = y - _GLOBAL_MIN_YEAR_FOR_PERIODS;
    const monthsSinceJan = m - 1;
    return yearsSince2000 * 12 + monthsSinceJan;
  }
  if (periodType === "year-quarter") {
    const { year: y, subPeriod: q } = decodePeriod(v, "year-quarter");
    assert(!isNaN(y), `Invalid year in period ID "${str}"`);
    assert(
      y >= _GLOBAL_MIN_YEAR_FOR_PERIODS && y <= _GLOBAL_MAX_YEAR_FOR_PERIODS,
      `Year ${y} in period ID "${str}" is outside valid range ${_GLOBAL_MIN_YEAR_FOR_PERIODS}-${_GLOBAL_MAX_YEAR_FOR_PERIODS}`,
    );
    assert(!isNaN(q), `Invalid quarter in period ID "${str}"`);
    assert(
      q >= 1 && q <= 4,
      `Quarter ${q} in period ID "${str}" must be between 1 and 4`,
    );
    const yearsSince2000 = y - _GLOBAL_MIN_YEAR_FOR_PERIODS;
    const quartersSinceQ1 = q - 1;
    return yearsSince2000 * 4 + quartersSinceQ1;
  }
  if (periodType === "year") {
    const { year: y } = decodePeriod(v, "year");
    assert(!isNaN(y), `Invalid year in period ID "${str}"`);
    assert(
      y >= _GLOBAL_MIN_YEAR_FOR_PERIODS && y <= _GLOBAL_MAX_YEAR_FOR_PERIODS,
      `Year ${y} in period ID "${str}" is outside valid range ${_GLOBAL_MIN_YEAR_FOR_PERIODS}-${_GLOBAL_MAX_YEAR_FOR_PERIODS}`,
    );
    const yearsSince2000 = y - _GLOBAL_MIN_YEAR_FOR_PERIODS;
    return yearsSince2000;
  }
  throw new Error("Bad period type");
}

export function getPeriodIdFromTime(v: number, periodType: PeriodType): number {
  if (periodType === "year-month") {
    const yearsSince2000 = Math.floor(v / 12);
    const monthsSinceJan = v % 12;
    const m = monthsSinceJan + 1;
    const y = yearsSince2000 + _GLOBAL_MIN_YEAR_FOR_PERIODS;
    return y * 100 + m;
  }
  if (periodType === "year-quarter") {
    const yearsSince2000 = Math.floor(v / 4);
    const quartersSinceQ1 = v % 4;
    const q = quartersSinceQ1 + 1;
    const y = yearsSince2000 + _GLOBAL_MIN_YEAR_FOR_PERIODS;
    return y * 10 + q;
  }
  if (periodType === "year") {
    const yearsSince2000 = v;
    const y = yearsSince2000 + _GLOBAL_MIN_YEAR_FOR_PERIODS;
    return y;
  }
  throw new Error("Bad period type");
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                        Validation & Type Detection                         //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// Period values are self-identifying by magnitude once quarter_id is YYYYQ:
//   year       YYYY    1900–2050
//   quarter_id YYYYQ   19001–20504
//   period_id  YYYYMM  190001–205012
// These ranges are disjoint, so a single value maps to at most one PeriodType.
// Strings are coerced only if canonical decimal (no leading zeros, sign,
// whitespace, decimal point, or exponent) so length stays in step with magnitude.

function periodValueToInt(v: number | string): number | undefined {
  if (typeof v === "number") {
    return Number.isInteger(v) ? v : undefined;
  }
  if (!/^[1-9]\d*$/.test(v)) {
    return undefined;
  }
  return Number(v);
}

export function isYear(v: number | string): boolean {
  const n = periodValueToInt(v);
  if (n === undefined) {
    return false;
  }
  return n >= _GLOBAL_MIN_YEAR_FOR_PERIODS && n <= _GLOBAL_MAX_YEAR_FOR_PERIODS;
}

export function isQuarterId(v: number | string): boolean {
  const n = periodValueToInt(v);
  if (n === undefined) {
    return false;
  }
  const y = Math.floor(n / 10);
  const q = n % 10;
  return y >= _GLOBAL_MIN_YEAR_FOR_PERIODS &&
    y <= _GLOBAL_MAX_YEAR_FOR_PERIODS &&
    q >= 1 && q <= 4;
}

export function isPeriodId(v: number | string): boolean {
  const n = periodValueToInt(v);
  if (n === undefined) {
    return false;
  }
  const y = Math.floor(n / 100);
  const m = n % 100;
  return y >= _GLOBAL_MIN_YEAR_FOR_PERIODS &&
    y <= _GLOBAL_MAX_YEAR_FOR_PERIODS &&
    m >= 1 && m <= 12;
}

export function getPeriodTypeFromValue(
  v: number | string,
): PeriodType | undefined {
  if (isYear(v)) {
    return "year";
  }
  if (isQuarterId(v)) {
    return "year-quarter";
  }
  if (isPeriodId(v)) {
    return "year-month";
  }
  return undefined;
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                           Formatting Functions                             //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function get_MONTHS_THREE_CHARS(calendar?: CalendarType) {
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
  if (isFrench()) {
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

export function formatPeriod(
  v: number | string,
  periodType: PeriodType,
  calendar: CalendarType,
): string {
  if (periodType === "year-month") {
    const { year, subPeriod } = decodePeriod(v, "year-month");
    const _MONTHS_THREE_CHARS = get_MONTHS_THREE_CHARS(calendar);
    const month = _MONTHS_THREE_CHARS[subPeriod - 1] ?? "???";
    if (calendar === "ethiopian-to-gregorian") {
      return month + " " + String(year + 8);
    }
    return month + " " + String(year);
  }
  if (periodType === "year-quarter") {
    const { year, subPeriod } = decodePeriod(v, "year-quarter");
    const prefix = isFrench() ? "T" : "Q";
    return String(year) + " / " + prefix + subPeriod;
  }
  return String(v);
}
