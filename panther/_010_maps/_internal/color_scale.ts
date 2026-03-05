// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color, getColor } from "../deps.ts";
import type { ColorKeyOrString, MapColorScale } from "../deps.ts";

export function resolveColor(
  value: number | undefined,
  valueRange: { min: number; max: number },
  colorScale: MapColorScale,
  noDataColor: ColorKeyOrString,
): ColorKeyOrString {
  if (value === undefined) return noDataColor;

  switch (colorScale.type) {
    case "sequential": {
      const t = normalize(value, valueRange.min, valueRange.max);
      return interpolateColor(colorScale.colors[0], colorScale.colors[1], t);
    }
    case "diverging": {
      const mid = colorScale.midpoint ??
        (valueRange.min + valueRange.max) / 2;
      if (value <= mid) {
        const t = normalize(value, valueRange.min, mid);
        return interpolateColor(colorScale.colors[0], colorScale.colors[1], t);
      } else {
        const t = normalize(value, mid, valueRange.max);
        return interpolateColor(colorScale.colors[1], colorScale.colors[2], t);
      }
    }
    case "threshold": {
      for (let i = 0; i < colorScale.thresholds.length; i++) {
        if (value < colorScale.thresholds[i]) {
          return colorScale.colors[i];
        }
      }
      return colorScale.colors[colorScale.colors.length - 1];
    }
    case "quantile":
      throw new Error(
        "Quantile color scale requires sorted values at transform time — not yet implemented",
      );
    case "custom":
      return colorScale.fn(value, valueRange.min, valueRange.max);
  }
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function interpolateColor(
  from: ColorKeyOrString,
  to: ColorKeyOrString,
  t: number,
): string {
  const c1 = new Color(getColor(from));
  const c2 = new Color(getColor(to));
  const r1 = c1.rgba();
  const r2 = c2.rgba();
  const r = Math.round(r1.r + (r2.r - r1.r) * t);
  const g = Math.round(r1.g + (r2.g - r1.g) * t);
  const b = Math.round(r1.b + (r2.b - r1.b) * t);
  return `rgb(${r},${g},${b})`;
}
