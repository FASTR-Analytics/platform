// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "./types.ts";

// The header-free magnitude primitive: a colour from a value's position in a
// numeric domain, nothing else. The figure-level slot it lifts into is
// FigureValuesColorFunc (_003_figure_style), which additionally sees the
// element being coloured and may decline; a ValuesColorFunc is assignable to
// that slot as-is.
export type ValuesColorFunc = (
  value: number | undefined,
  min: number,
  max: number,
) => ColorKeyOrString;

const DEFAULT_NO_DATA_COLOR: ColorKeyOrString = "#f0f0f0";

// Which bucket a value sitting exactly on a cutoff belongs to. "up": the
// bucket above (value < t[i] selects bucket i). "down": the bucket below
// (value <= t[i] selects bucket i) — the side a lower-is-better rule wants,
// where the boundary belongs to the better bucket.
export type ThresholdBoundary = "up" | "down";

export type ThresholdColorFuncOptions = {
  noDataColor?: ColorKeyOrString;
  boundary?: ThresholdBoundary;
};

export function thresholdColorFunc(
  thresholds: number[],
  colors: ColorKeyOrString[],
  opts?: ThresholdColorFuncOptions,
): ValuesColorFunc {
  const nd = opts?.noDataColor ?? DEFAULT_NO_DATA_COLOR;
  const inclusive = (opts?.boundary ?? "up") === "down";
  return (value, _min, _max) => {
    if (value === undefined) return nd;
    for (let i = 0; i < thresholds.length; i++) {
      if (inclusive ? value <= thresholds[i] : value < thresholds[i]) {
        return colors[i];
      }
    }
    return colors[colors.length - 1];
  };
}
