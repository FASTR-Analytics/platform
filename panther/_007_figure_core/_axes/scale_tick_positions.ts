// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { OverhangClearance } from "../types.ts";

// Screen positions for a scale axis's ticks, indexed by VALUE index
// (tick values ascending). Every site that places ticks or grid lines for a
// scale axis must use this so positions can never drift apart.
//   axis "x": values grow rightward from axisStart + clearance.start
//   axis "y": values grow upward from axisStart + axisExtent - clearance.start
export function getScaleAxisTickPositions(
  axisStart: number,
  axisExtent: number,
  nTicks: number,
  clearance: OverhangClearance,
  axis: "x" | "y",
): number[] {
  if (nTicks <= 0) {
    return [];
  }
  const effectiveExtent = axisExtent - clearance.start - clearance.end;
  const start = axis === "x"
    ? axisStart + clearance.start
    : axisStart + axisExtent - clearance.start;
  const dir = axis === "x" ? 1 : -1;
  if (nTicks === 1) {
    return [start + dir * (effectiveExtent / 2)];
  }
  const inc = effectiveExtent / (nTicks - 1);
  return Array.from({ length: nTicks }, (_, i) => start + dir * i * inc);
}
