// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";
import type { LargeLabelForm } from "./helpers.ts";

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
  // The large-label fallback ladder, widest form first, each with its measured
  // exemplar width. The axis picks the widest form that fits.
  largeLabelForms: { form: LargeLabelForm; w: number }[];
  yearSkipInterval: number;
};
