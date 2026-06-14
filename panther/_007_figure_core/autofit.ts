// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type FigureFitReport, MIN_FONT_SIZE_DU } from "./deps.ts";
import type { FigureAutofitOptions } from "./types.ts";

const DEFAULT_FIGURE_MIN_SCALE = 0.5;

export type ResolvedFigureAutofitOptions = {
  minScale: number;
  maxScale: number;
  minFontSizeDu: number;
};

// shrink-to-fit is the default: undefined / true both enable it. Only an
// explicit `false` opts out. It never grows (maxScale is clamped to 1).
export function resolveFigureAutofitOptions(
  autofit: boolean | FigureAutofitOptions | undefined,
): ResolvedFigureAutofitOptions | null {
  if (autofit === false) {
    return null;
  }
  if (autofit === undefined || autofit === true) {
    return {
      minScale: DEFAULT_FIGURE_MIN_SCALE,
      maxScale: 1.0,
      minFontSizeDu: MIN_FONT_SIZE_DU,
    };
  }
  return {
    minScale: autofit.minScale ?? DEFAULT_FIGURE_MIN_SCALE,
    maxScale: Math.min(autofit.maxScale ?? 1.0, 1.0),
    minFontSizeDu: autofit.minFontSizeDu ?? MIN_FONT_SIZE_DU,
  };
}

// The shrink-to-fit floor: never shrink below the larger of minScale and the
// scale at which the base font would hit the min-font floor. Clamped to 1
// (shrink-to-fit never grows).
export function computeFloorScale(opts: {
  minScale: number;
  maxScale: number;
  baseFontSizeDu: number;
  minFontSizeDu: number;
}): number {
  const fromFont = opts.baseFontSizeDu > 0
    ? opts.minFontSizeDu / opts.baseFontSizeDu
    : opts.minScale;
  const floor = Math.max(opts.minScale, fromFont);
  return Math.min(floor, opts.maxScale, 1);
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
  options: { minScale: number; maxScale: number },
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

export function findOptimalScaleForBounds(
  availableWidth: number,
  availableHeight: number,
  options: { minScale: number; maxScale: number },
  getSizeAtScale: (scale: number) => { minWidth: number; idealHeight: number },
): number {
  const size1 = getSizeAtScale(1.0);
  if (
    availableWidth >= size1.minWidth &&
    availableHeight >= size1.idealHeight
  ) {
    return 1.0;
  }

  const scales = getDiscreteScales(options.minScale, options.maxScale);
  let lo = 0;
  let hi = scales.length - 1;
  let bestScale = options.minScale;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const scale = scales[mid];
    const size = getSizeAtScale(scale);
    const fitsWidth = availableWidth >= size.minWidth;
    const fitsHeight = availableHeight >= size.idealHeight;

    if (fitsWidth && fitsHeight) {
      bestScale = scale;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return bestScale;
}

// Per-call memoizer for scale-keyed computations. Constructed per call — not
// at module level — so the cache is correctly scoped and never leaks stale
// results across calls. Scale keys are exact (the discrete-scale ladder rounds
// its values, and floorScale comes from one computation), so Map equality holds.
export function memoizeByScale<T>(
  fn: (scale: number) => T,
): (scale: number) => T {
  const cache = new Map<number, T>();
  return (scale: number): T => {
    const cached = cache.get(scale);
    if (cached !== undefined) return cached;
    const result = fn(scale);
    cache.set(scale, result);
    return result;
  };
}

// Resolves the shrink-to-fit factor with a legibility floor and reports
// `cramped`. The factor is never below the floor; if the content still does not
// fit at the floor, it is rendered at the floor and flagged `cramped`.
export function findFitScaleWithFloor(
  availableWidth: number,
  availableHeight: number,
  opts: {
    minScale: number;
    maxScale: number;
    baseFontSizeDu: number;
    minFontSizeDu: number;
  },
  getSizeAtScale: (scale: number) => { minWidth: number; idealHeight: number },
): { fitScale: number; floorScale: number; cramped: boolean } {
  const floorScale = computeFloorScale(opts);
  const fitScale = findOptimalScaleForBounds(
    availableWidth,
    availableHeight,
    { minScale: floorScale, maxScale: opts.maxScale },
    getSizeAtScale,
  );
  const size = getSizeAtScale(fitScale);
  // 0.5px tolerance so sub-pixel rounding does not produce a false `cramped`.
  const cramped = availableWidth + 0.5 < size.minWidth ||
    availableHeight + 0.5 < size.idealHeight;
  return { fitScale, floorScale, cramped };
}

// Single chokepoint for assembling the fit report — shared by the chart and
// table autofit paths so the two can never drift. minW/minH are at the APPLIED
// fitScale (how snug is this render); naturalH is the ideal height at scale 1.
// Pass a memoized getSizeAtScale: every scale used here was already probed by
// the fit search, so report assembly costs nothing extra.
export function buildFitReport(
  fitScale: number,
  floorScale: number,
  cramped: boolean,
  getSizeAtScale: (scale: number) => { minWidth: number; idealHeight: number },
  naturalHOverride?: number,
): FigureFitReport {
  const atFit = getSizeAtScale(fitScale);
  return {
    fitScale,
    floorScale,
    minW: atFit.minWidth,
    minH: atFit.idealHeight,
    naturalH: naturalHOverride ?? getSizeAtScale(1.0).idealHeight,
    cramped,
  };
}
