// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type ScaleAxisLimitOption =
  | number
  | "auto"
  | "auto-zero"
  | ((i_pane: number) => number);

// The one place a scale axis decides its numeric bounds. Both the Y-scale
// (per tier) and X-scale (per lane) measure passes call this; the caller has
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
//               be mapped outside the plot box.
export function resolveScaleAxisLimits(
  styleMin: ScaleAxisLimitOption,
  styleMax: ScaleAxisLimitOption,
  i_pane: number,
  dataMin: number,
  dataMax: number,
): { minVal: number; maxVal: number } {
  const minVal = resolveOne(styleMin, i_pane, dataMin, "min");
  const maxVal = resolveOne(styleMax, i_pane, dataMax, "max");
  // An authored fixed bound can invert the range (e.g. min: 0 against
  // all-negative data). Swapping keeps the axis drawable.
  if (maxVal < minVal) {
    return { minVal: maxVal, maxVal: minVal };
  }
  return { minVal, maxVal };
}

function resolveOne(
  style: ScaleAxisLimitOption,
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
