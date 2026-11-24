// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedContentStyle } from "../deps.ts";

export function computeBarThicknesses(
  slotExtent: number,
  nBarSerieses: number,
  bars: Pick<
    MergedContentStyle["bars"],
    | "stacking"
    | "barGroupThicknessFractionOfSlot"
    | "barThicknessFractionOfSeriesOuterThickness"
    | "maxBarThickness"
  >,
): {
  barGroupThickness: number;
  seriesOuterThickness: number;
  barThickness: number;
} {
  const barGroupThickness = slotExtent * bars.barGroupThicknessFractionOfSlot;
  const seriesOuterThickness = bars.stacking === "none"
    ? barGroupThickness / nBarSerieses
    : barGroupThickness;
  const barThickness = Math.min(
    seriesOuterThickness * bars.barThicknessFractionOfSeriesOuterThickness,
    bars.maxBarThickness,
  );
  return { barGroupThickness, seriesOuterThickness, barThickness };
}
