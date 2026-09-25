// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { assert } from "./assert.ts";
import { getLanguage } from "./translate.ts";
import type { Language } from "./translate.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                                   Types                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type PeriodType = "year-month" | "year-quarter" | "year";

export type CalendarType =
  | "gregorian"
  | "ethiopian"
  | "ethiopian-to-gregorian"
  | "gregorian-fy-july";

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

const QUARTER_PREFIX_BY_LANG: Record<Language, string> = {
  en: "Q",
  fr: "T",
  pt: "T",
};

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
  return MONTHS_THREE_CHARS_BY_LANG[getLanguage()];
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
    const prefix = QUARTER_PREFIX_BY_LANG[getLanguage()];
    return String(year) + " / " + prefix + subPeriod;
  }
  return String(v);
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                          Fiscal Years and Units                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// A fiscal year starts in `startMonth` and is named after the calendar year
// it starts in or ends in. Stored periods stay calendar-encoded; the rule only
// decides which quarter and which named year a period belongs to.
export type FiscalYearRule = { startMonth: number; namedBy: "start" | "end" };

export type PeriodBounds = { min: number; max: number };

export type PeriodUnit = "period" | "month" | "quarter" | "year";
export type FullPeriodUnit = "quarter" | "year";

function assertRule(rule: FiscalYearRule): void {
  assert(
    Number.isInteger(rule.startMonth) && rule.startMonth >= 1 &&
      rule.startMonth <= 12,
    `Fiscal year start month ${rule.startMonth} must be between 1 and 12`,
  );
}

// A rule applies to quarter ids only when its start month opens a calendar
// quarter, since a quarter id cannot be split.
function getFiscalStartQuarter(rule: FiscalYearRule): number {
  assertRule(rule);
  assert(
    (rule.startMonth - 1) % 3 === 0,
    `Fiscal year start month ${rule.startMonth} does not open a calendar quarter`,
  );
  return (rule.startMonth - 1) / 3 + 1;
}

function getNamedYearOffset(rule: FiscalYearRule): number {
  return rule.namedBy === "end" ? 1 : 0;
}

export function getFiscalQuarter(
  periodId: number | string,
  grain: PeriodType,
  rule: FiscalYearRule,
): number {
  if (grain === "year-month") {
    assertRule(rule);
    const { subPeriod: m } = decodePeriod(periodId, "year-month");
    return Math.floor(((m - rule.startMonth + 12) % 12) / 3) + 1;
  }
  if (grain === "year-quarter") {
    const startQuarter = getFiscalStartQuarter(rule);
    const { subPeriod: q } = decodePeriod(periodId, "year-quarter");
    return ((q - startQuarter + 4) % 4) + 1;
  }
  throw new Error("A year has no fiscal quarter");
}

export function getFiscalYear(
  periodId: number | string,
  grain: PeriodType,
  rule: FiscalYearRule,
): number {
  const e = getNamedYearOffset(rule);
  if (grain === "year-month") {
    assertRule(rule);
    const { year, subPeriod: m } = decodePeriod(periodId, "year-month");
    return year + (m >= rule.startMonth ? e : e - 1);
  }
  if (grain === "year-quarter") {
    const startQuarter = getFiscalStartQuarter(rule);
    const { year, subPeriod: q } = decodePeriod(periodId, "year-quarter");
    return year + (q >= startQuarter ? e : e - 1);
  }
  throw new Error("A year has no fiscal year");
}

export function getMonthComponent(periodId: number | string): number {
  return decodePeriod(periodId, "year-month").subPeriod;
}

export function getQuarterComponent(
  periodId: number | string,
  grain: PeriodType,
  rule?: FiscalYearRule,
): number {
  if (grain === "year-month") {
    if (rule !== undefined) {
      return getFiscalQuarter(periodId, grain, rule);
    }
    return Math.floor((decodePeriod(periodId, "year-month").subPeriod + 2) / 3);
  }
  if (grain === "year-quarter") {
    assert(rule === undefined, "A quarter id carries no fiscal rule");
    return decodePeriod(periodId, "year-quarter").subPeriod;
  }
  throw new Error("A year has no quarter component");
}

export function shiftPeriod(
  periodId: number | string,
  grain: PeriodType,
  n: number,
): number {
  assert(Number.isInteger(n), `Period shift ${n} must be an integer`);
  const time = getTimeFromPeriodId(periodId, grain) + n;
  const shifted = getPeriodIdFromTime(time, grain);
  getTimeFromPeriodId(shifted, grain);
  return shifted;
}

// How many grain periods one unit holds; a unit finer than the grain is an
// error.
function getPeriodsPerUnit(grain: PeriodType, unit: PeriodUnit): number {
  const k = unit === "period"
    ? 1
    : grain === "year-month"
    ? (unit === "month" ? 1 : unit === "quarter" ? 3 : 12)
    : grain === "year-quarter"
    ? (unit === "month" ? undefined : unit === "quarter" ? 1 : 4)
    : (unit === "year" ? 1 : undefined);
  if (k === undefined) {
    throw new Error(`Unit "${unit}" is finer than grain "${grain}"`);
  }
  return k;
}

// The `n × k` periods ending at `max`, clamped to the 1900 floor.
export function getLastUnitsBounds(
  max: number | string,
  grain: PeriodType,
  unit: PeriodUnit,
  n: number,
): PeriodBounds {
  assert(Number.isInteger(n) && n >= 1, `Unit count ${n} must be at least 1`);
  const k = getPeriodsPerUnit(grain, unit);
  const maxTime = getTimeFromPeriodId(max, grain);
  const minTime = Math.max(0, maxTime - n * k + 1);
  return {
    min: getPeriodIdFromTime(minTime, grain),
    max: getPeriodIdFromTime(maxTime, grain),
  };
}

// The last `n` complete units at or before `max`: a unit is complete iff its
// last period is at or before `max`. Under a rule, units are fiscal quarters
// and fiscal years. Undefined when every such unit lies below the 1900 floor.
export function getLastFullUnitBounds(
  max: number | string,
  grain: PeriodType,
  unit: FullPeriodUnit,
  n: number,
  rule?: FiscalYearRule,
): PeriodBounds | undefined {
  assert(Number.isInteger(n) && n >= 1, `Unit count ${n} must be at least 1`);
  const k = getPeriodsPerUnit(grain, unit);
  const offset = getUnitOffset(grain, rule);
  const maxTime = getTimeFromPeriodId(max, grain);
  // Unit blocks start at multiples of k in the shifted time space.
  const shiftedMax = maxTime - offset;
  const block = Math.floor(shiftedMax / k);
  const lastBlock = shiftedMax === (block + 1) * k - 1 ? block : block - 1;
  const maxShifted = (lastBlock + 1) * k - 1;
  const minShifted = (lastBlock - n + 1) * k;
  const maxUnitTime = maxShifted + offset;
  if (maxUnitTime < 0) {
    return undefined;
  }
  const minUnitTime = Math.max(0, minShifted + offset);
  return {
    min: getPeriodIdFromTime(minUnitTime, grain),
    max: getPeriodIdFromTime(maxUnitTime, grain),
  };
}

// Where the first period of a fiscal year falls relative to a calendar year
// start, in grain periods.
function getUnitOffset(grain: PeriodType, rule?: FiscalYearRule): number {
  if (rule === undefined) {
    return 0;
  }
  if (grain === "year-month") {
    assertRule(rule);
    return rule.startMonth - 1;
  }
  if (grain === "year-quarter") {
    return getFiscalStartQuarter(rule) - 1;
  }
  throw new Error("A year table carries no fiscal rule");
}
