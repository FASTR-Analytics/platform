// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { OverhangClearance, YScaleAxisWidthInfo } from "../../types.ts";
import { getScaleAxisTickPositions } from "../scale_tick_positions.ts";

export function calculateHorizontalGridLinesForTier(
  i_tier: number,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  plotAreaY: number,
  plotAreaHeight: number,
  clearance: OverhangClearance,
): { y: number; tickValue: number }[] {
  const ticks = yScaleAxisWidthInfo.yAxisTickValues[i_tier];
  const positions = getScaleAxisTickPositions(
    plotAreaY,
    plotAreaHeight,
    ticks.length,
    clearance,
    "y",
  );
  // Top to bottom (highest value to lowest), matching previous output order.
  const result: { y: number; tickValue: number }[] = [];
  for (let i_tick = ticks.length - 1; i_tick >= 0; i_tick--) {
    result.push({ y: positions[i_tick], tickValue: ticks[i_tick] });
  }
  return result;
}
