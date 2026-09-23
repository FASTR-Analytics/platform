// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { decodePeriod, formatPeriod } from "../../deps.ts";
import type { CalendarType, PeriodType } from "../../deps.ts";
import type { GridColumn, GridColumnGroup } from "../grid_types.ts";
import type { PresenceGridProps } from "./types.ts";

// Inclusive month period ids (yyyymm).
type PeriodBounds = { min: number; max: number };

// Columns and groups for a period range: months or quarters grouped by year,
// or ungrouped years. Column and group ids are the period ids as strings, so
// a caller maps its own period ids to columns with `String(id)`.
export function presenceGridColumnsFromPeriods(
  bounds: PeriodBounds,
  periodType: PeriodType,
  calendar: CalendarType,
): Pick<PresenceGridProps, "columns" | "columnGroups" | "cellWidth"> {
  const yearColumns: GridColumnGroup[] = enumerateYears(bounds).map((year) => ({
    id: String(year),
    label: formatPeriod(year, "year", calendar),
  }));
  if (periodType === "year") {
    return { columns: yearColumns, cellWidth: "stretch" };
  }
  const ids = periodType === "year-month"
    ? enumerateMonths(bounds)
    : enumerateQuarters(bounds);
  const columns: GridColumn[] = ids.map((id) => ({
    id: String(id),
    label: formatPeriod(id, periodType, calendar),
    groupId: String(decodePeriod(id, periodType).year),
  }));
  return { columns, columnGroups: yearColumns, cellWidth: "fixed" };
}

function enumerateMonths(bounds: PeriodBounds): number[] {
  const out: number[] = [];
  let { year, subPeriod: month } = decodePeriod(bounds.min, "year-month");
  while (year * 100 + month <= bounds.max) {
    out.push(year * 100 + month);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}

function quarterIdOfMonth(periodId: number): number {
  const { year, subPeriod: month } = decodePeriod(periodId, "year-month");
  return year * 10 + Math.ceil(month / 3);
}

function enumerateQuarters(bounds: PeriodBounds): number[] {
  const out: number[] = [];
  const last = quarterIdOfMonth(bounds.max);
  let { year, subPeriod: quarter } = decodePeriod(
    quarterIdOfMonth(bounds.min),
    "year-quarter",
  );
  while (year * 10 + quarter <= last) {
    out.push(year * 10 + quarter);
    quarter++;
    if (quarter > 4) {
      quarter = 1;
      year++;
    }
  }
  return out;
}

function enumerateYears(bounds: PeriodBounds): number[] {
  const out: number[] = [];
  const last = decodePeriod(bounds.max, "year-month").year;
  for (
    let year = decodePeriod(bounds.min, "year-month").year;
    year <= last;
    year++
  ) {
    out.push(year);
  }
  return out;
}
