// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { assert } from "./assert.ts";

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
  | "french";

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

export function getTimeFromPeriodId(
  v: number | string,
  periodType: PeriodType,
): number {
  const str = String(v);
  if (periodType === "year-month") {
    const y = Number(str.slice(0, 4));
    const m = Number(str.slice(4, 6));
    assert(!isNaN(y));
    assert(
      y >= _GLOBAL_MIN_YEAR_FOR_PERIODS && y <= _GLOBAL_MAX_YEAR_FOR_PERIODS,
    );
    assert(!isNaN(m));
    assert(m >= 1 && m <= 12);
    const yearsSince2000 = y - _GLOBAL_MIN_YEAR_FOR_PERIODS;
    const monthsSinceJan = m - 1;
    return yearsSince2000 * 12 + monthsSinceJan;
  }
  if (periodType === "year-quarter") {
    const y = Number(str.slice(0, 4));
    const q = Number(str.slice(4, 6));
    assert(!isNaN(y));
    assert(
      y >= _GLOBAL_MIN_YEAR_FOR_PERIODS && y <= _GLOBAL_MAX_YEAR_FOR_PERIODS,
    );
    assert(!isNaN(q));
    assert(q >= 1 && q <= 4);
    const yearsSince2000 = y - _GLOBAL_MIN_YEAR_FOR_PERIODS;
    const quartersSinceQ1 = q - 1;
    return yearsSince2000 * 4 + quartersSinceQ1;
  }
  if (periodType === "year") {
    const y = Number(str.slice(0, 4));
    assert(!isNaN(y));
    assert(
      y >= _GLOBAL_MIN_YEAR_FOR_PERIODS && y <= _GLOBAL_MAX_YEAR_FOR_PERIODS,
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
    return y * 100 + q;
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

export function formatPeriod(
  v: number | string,
  periodType: PeriodType,
  calendar: CalendarType,
): string {
  const str = String(v);
  if (periodType === "year-month") {
    const _MONTHS_THREE_CHARS = get_MONTHS_THREE_CHARS(calendar);
    const i_month = Number(str.slice(4, 6)) - 1;
    const month = _MONTHS_THREE_CHARS[i_month] ?? "???";
    if (calendar === "ethiopian-to-gregorian") {
      return month + " " + (Number(str.slice(0, 4)) + 8).toFixed(0);
    }
    if (calendar === "ethiopian") {
      return month + " " + str.slice(0, 4);
    }
    return month + " " + str.slice(0, 4);
  }
  if (periodType === "year-quarter") {
    return str.slice(0, 4) + " / Q" + str.slice(4, 6);
  }
  return str;
}
