// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";

export type PeriodAxisType =
  | "month-three-year"
  | "month-one-year"
  | "month-none-year"
  | "quarter-two-year"
  | "quarter-one-year"
  | "quarter-none-year"
  | "year-side"
  | "year-centered";

export type XPeriodAxisMeasuredInfo = {
  subChartAreaWidth: number;
  periodIncrementWidth: number;
  xAxisRcd: RectCoordsDims;
  periodAxisSmallTickH: number | "none";
  periodAxisType: PeriodAxisType;
  fourDigitYearW: number;
};
