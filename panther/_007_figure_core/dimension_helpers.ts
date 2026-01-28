// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedYScaleAxisStyle, RenderContext } from "./deps.ts";

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
