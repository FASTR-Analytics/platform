// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { OverhangClearance, YValueAxisWidthInfo } from "../../types.ts";
import { getValueAxisTickPositions } from "../value_axis_tick_positions.ts";

export function calculateHorizontalGridLinesForTier(
  i_tier: number,
  yValueAxisWidthInfo: YValueAxisWidthInfo,
  subChartY: number,
  subChartHeight: number,
  clearance: OverhangClearance,
): { y: number; tickValue: number }[] {
  const ticks = yValueAxisWidthInfo.yAxisTickValues[i_tier];
  const positions = getValueAxisTickPositions(
    subChartY,
    subChartHeight,
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
