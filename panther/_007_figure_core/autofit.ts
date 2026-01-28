// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FigureAutofitOptions } from "./types.ts";

export type ResolvedFigureAutofitOptions = {
  minScale: number;
  maxScale: number;
};

export function resolveFigureAutofitOptions(
  autofit: boolean | FigureAutofitOptions | undefined,
): ResolvedFigureAutofitOptions | null {
  if (!autofit) return null;
  if (autofit === true) {
    return { minScale: 0.5, maxScale: 1.0 };
  }
  return {
    minScale: autofit.minScale ?? 0.5,
    maxScale: autofit.maxScale ?? 1.0,
  };
}

export function getDiscreteScales(
  minScale: number,
  maxScale: number,
): number[] {
  const scales: number[] = [];
  for (let s = maxScale; s >= minScale; s -= 0.1) {
    scales.push(Math.round(s * 100) / 100);
  }
  return scales;
}

export function findOptimalScale(
  availableWidth: number,
  options: ResolvedFigureAutofitOptions,
  getMinWidthAtScale: (scale: number) => number,
): number {
  const minWidthAt1 = getMinWidthAtScale(1.0);
  if (availableWidth >= minWidthAt1) {
    return 1.0;
  }

  const scales = getDiscreteScales(options.minScale, 1.0);
  let lo = 0;
  let hi = scales.length - 1;
  let bestScale = options.minScale;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const scale = scales[mid];
    const minWidth = getMinWidthAtScale(scale);

    if (availableWidth >= minWidth) {
      bestScale = scale;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return bestScale;
}
