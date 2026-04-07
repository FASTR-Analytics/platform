// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color } from "./color_class.ts";
import { normalizeTo01 } from "./deps.ts";
import { getColor } from "./key_colors.ts";
import type { ColorKeyOrString } from "./types.ts";

export type ValuesColorFunc = (
  value: number | undefined,
  min: number,
  max: number,
) => ColorKeyOrString;

const DEFAULT_NO_DATA_COLOR: ColorKeyOrString = "#f0f0f0";

/** @deprecated Use valuesColorScale({ min, max }) from _003_figure_style instead */
export function sequentialColorFunc(
  from: ColorKeyOrString,
  to: ColorKeyOrString,
  noDataColor?: ColorKeyOrString,
): ValuesColorFunc {
  const fromResolved = getColor(from);
  const toResolved = getColor(to);
  const nd = noDataColor ?? DEFAULT_NO_DATA_COLOR;
  return (value, min, max) => {
    if (value === undefined) return nd;
    const t = normalizeTo01(value, min, max);
    return Color.scaledPct(fromResolved, toResolved, t);
  };
}

/** @deprecated Use valuesColorScale({ min, mid, max }) from _003_figure_style instead */
export function divergingColorFunc(
  low: ColorKeyOrString,
  mid: ColorKeyOrString,
  high: ColorKeyOrString,
  midpoint?: number,
  noDataColor?: ColorKeyOrString,
): ValuesColorFunc {
  const lowResolved = getColor(low);
  const midResolved = getColor(mid);
  const highResolved = getColor(high);
  const nd = noDataColor ?? DEFAULT_NO_DATA_COLOR;
  return (value, min, max) => {
    if (value === undefined) return nd;
    const mp = midpoint ?? (min + max) / 2;
    if (value <= mp) {
      const t = normalizeTo01(value, min, mp);
      return Color.scaledPct(lowResolved, midResolved, t);
    } else {
      const t = normalizeTo01(value, mp, max);
      return Color.scaledPct(midResolved, highResolved, t);
    }
  };
}

export function thresholdColorFunc(
  thresholds: number[],
  colors: ColorKeyOrString[],
  noDataColor?: ColorKeyOrString,
): ValuesColorFunc {
  const nd = noDataColor ?? DEFAULT_NO_DATA_COLOR;
  return (value, _min, _max) => {
    if (value === undefined) return nd;
    for (let i = 0; i < thresholds.length; i++) {
      if (value < thresholds[i]) {
        return colors[i];
      }
    }
    return colors[colors.length - 1];
  };
}
