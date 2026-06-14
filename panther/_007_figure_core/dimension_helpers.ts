// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedXScaleAxisStyle,
  MergedYScaleAxisStyle,
  RenderContext,
} from "./deps.ts";

export function calculatePaneGrid(
  nPanes: number,
  nColsSetting: number | "auto",
): { nGCols: number; nGRows: number } {
  const nGCols = nColsSetting === "auto"
    ? Math.ceil(Math.sqrt(nPanes))
    : nColsSetting;
  const nGRows = Math.ceil(nPanes / nGCols);
  return { nGCols, nGRows };
}

export function calculateMinSubChartHeight(
  rc: RenderContext,
  yScaleAxisStyle: MergedYScaleAxisStyle,
): number {
  const tickLabelHeight = rc.mText(
    "999,999",
    yScaleAxisStyle.text.yScaleAxisTickLabels,
    Infinity,
  ).dims.h();
  // 2 tick labels + 2× spacing between them
  return tickLabelHeight * 4;
}

export function calculateMinSubChartWidth(
  rc: RenderContext,
  xScaleAxisStyle: MergedXScaleAxisStyle,
): number {
  const tickLabelWidth = rc.mText(
    "999,999",
    xScaleAxisStyle.text.xScaleAxisTickLabels,
    Infinity,
  ).dims.w();
  // Mirror of calculateMinSubChartHeight: 2 tick labels + 2× spacing
  return tickLabelWidth * 4;
}

// Piecewise-linear formula with cumulative-marginal slopes matching the four
// existing multipliers (1.0 / 0.5 / 0.2 / 0.1) but applied to incremental
// points so g(n) is strictly monotone non-decreasing in nTimePoints.
//
// Breakpoints:    n ≤ 5         → g(n) = n
//                5 < n ≤ 20    → g(n) = 2.5 + 0.5n
//                20 < n ≤ 30   → g(n) = 8.5 + 0.2n
//                n > 30        → g(n) = 11.5 + 0.1n
//
// Continuity verified at each breakpoint: g(5)=5, g(20)=12.5, g(30)=14.5.
// tickLabelHeight is the height of the period tick-label text (basis reused
// from the surrounding xAxisTickH measurement in get_size_info.ts).
const TS_MIN_WIDTH_BREAKPOINTS = [
  { threshold: 5, slope: 1.0, intercept: 0 },
  { threshold: 20, slope: 0.5, intercept: 2.5 },
  { threshold: 30, slope: 0.2, intercept: 8.5 },
  { threshold: Infinity, slope: 0.1, intercept: 11.5 },
] as const;

export function calculateTimeseriesMinSubChartWidth(
  nTimePoints: number,
  tickLabelHeight: number,
): number {
  for (const { threshold, slope, intercept } of TS_MIN_WIDTH_BREAKPOINTS) {
    if (nTimePoints <= threshold) {
      return (intercept + slope * nTimePoints) * tickLabelHeight;
    }
  }
  // Unreachable (last threshold is Infinity) but needed for TS exhaustiveness.
  return nTimePoints * tickLabelHeight * 0.1;
}
