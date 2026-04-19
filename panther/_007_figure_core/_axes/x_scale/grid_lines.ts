// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { XScaleAxisHeightInfo } from "./types.ts";

export function calculateVerticalGridLinesForLaneXScale(
  i_lane: number,
  xScaleHeightInfo: XScaleAxisHeightInfo,
  plotAreaX: number,
  plotAreaWidth: number,
): { x: number; tickValue: number }[] {
  const mx = xScaleHeightInfo;
  const result: { x: number; tickValue: number }[] = [];
  const ticks = mx.xAxisTickValues[i_lane];
  const inc = plotAreaWidth / (ticks.length - 1);
  let currentX = plotAreaX;
  for (let i = 0; i < ticks.length; i++) {
    result.push({ x: currentX, tickValue: ticks[i] });
    currentX += inc;
  }
  return result;
}
