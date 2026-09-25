// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getLastFullUnitBounds, getLastUnitsBounds } from "./deps.ts";
import type { PeriodBounds } from "./deps.ts";
import type { LongTableTime, PeriodFilter } from "./types.ts";

function intersect(
  a: PeriodBounds,
  b: PeriodBounds,
): PeriodBounds | undefined {
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  return min <= max ? { min, max } : undefined;
}

// The bounds a period filter selects against live data bounds, or undefined
// when nothing is selected. Relative shapes count back from the data max;
// every result is intersected with the data bounds, so a resolved range is
// never wider than the data and never empty.
export function resolvePeriodFilter(
  filter: PeriodFilter,
  dataBounds: PeriodBounds | undefined,
  time: LongTableTime,
): PeriodBounds | undefined {
  if (dataBounds === undefined) {
    return undefined;
  }
  if (filter.type === "range") {
    return intersect({ min: filter.min, max: filter.max }, dataBounds);
  }
  if (filter.type === "from") {
    return intersect({ min: filter.min, max: dataBounds.max }, dataBounds);
  }
  if (filter.type === "last") {
    return intersect(
      getLastUnitsBounds(dataBounds.max, time.grain, filter.unit, filter.n),
      dataBounds,
    );
  }
  const full = getLastFullUnitBounds(
    dataBounds.max,
    time.grain,
    filter.unit,
    filter.n,
    time.fiscalYear,
  );
  return full === undefined ? undefined : intersect(full, dataBounds);
}
