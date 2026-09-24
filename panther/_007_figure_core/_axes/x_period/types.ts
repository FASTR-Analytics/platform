// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";
import type { LargeLabelForm } from "./helpers.ts";

// Small periods are either labelled (three-letter months, Q1..Q4) or absent:
// year boundary ticks and year labels only. Unlabelled small ticks are noise
// the reader cannot decode.
export type PeriodAxisType =
  | "month-three-year"
  | "quarter-two-year"
  | "year-side"
  | "year-centered";

export type XPeriodAxisMeasuredInfo = {
  subChartAreaWidth: number;
  periodIncrementWidth: number;
  xAxisRcd: RectCoordsDims;
  periodAxisSmallTickH: number | "none";
  periodAxisType: PeriodAxisType;
  // The large-label fallback ladder, widest form first, each with its measured
  // exemplar width. The axis picks the widest form that fits every labelled
  // cell.
  largeLabelForms: { form: LargeLabelForm; w: number }[];
  // Label every Nth year band (year-centered: tick + label every Nth year).
  yearSkipInterval: number;
  // Centre-to-centre distance between labelled years (N * band width).
  labelSpan: number;
  // Minimum air between neighbouring year labels and the inset between a
  // boundary tick and the label that starts at it, em-based (scales with fit).
  labelGap: number;
  // Non-year-centered only. True: a full-height tick at every year start and
  // year labels sit inside their own band. False (label wider than a band):
  // full-height ticks only at labelled starts, label starts at the cell's tick.
  boundaryTicksEveryYear: boolean;
};
