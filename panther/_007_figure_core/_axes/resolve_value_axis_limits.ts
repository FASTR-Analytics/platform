// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ValueRange } from "../types.ts";

export type ValueAxisLimitOption =
  | number
  | "auto"
  | "auto-zero"
  | ((i_pane: number) => number);

// The one place a value axis decides its numeric bounds. Both the Y value axis
// (per tier) and X value axis (per lane) measure passes call this; the caller has
// already picked which data limits apply (pane-wide vs individual tier/lane),
// so this stays pure.
//
//   number      an authored fixed bound
//   function    an authored fixed bound, per pane
//   "auto"      the data's own bound — may sit above zero, which truncates the
//               axis and visually exaggerates variation
//   "auto-zero" the data's own bound, widened to always include zero. For data
//               that never crosses zero this IS zero, i.e. identical to the
//               default `min: 0` — it only differs where data would otherwise
//               be mapped outside the sub-chart.
export function resolveValueAxisLimits(
  styleMin: ValueAxisLimitOption,
  styleMax: ValueAxisLimitOption,
  i_pane: number,
  dataMin: number,
  dataMax: number,
): ValueRange {
  const valueMin = resolveOne(styleMin, i_pane, dataMin, "min");
  const valueMax = resolveOne(styleMax, i_pane, dataMax, "max");
  // An authored fixed bound can invert the range (e.g. min: 0 against
  // all-negative data). Swapping keeps the axis drawable.
  if (valueMax < valueMin) {
    return { valueMin: valueMax, valueMax: valueMin };
  }
  return { valueMin, valueMax };
}

function resolveOne(
  style: ValueAxisLimitOption,
  i_pane: number,
  dataValue: number,
  end: "min" | "max",
): number {
  if (typeof style === "function") {
    return style(i_pane);
  }
  if (style === "auto") {
    return dataValue;
  }
  if (style === "auto-zero") {
    return end === "min" ? Math.min(0, dataValue) : Math.max(0, dataValue);
  }
  return style;
}
