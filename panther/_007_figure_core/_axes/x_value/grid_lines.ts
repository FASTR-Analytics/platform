// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { OverhangClearance } from "../../types.ts";
import { getValueAxisTickPositions } from "../value_axis_tick_positions.ts";
import type { XValueAxisHeightInfo } from "./types.ts";

export function calculateVerticalGridLinesForLaneXValue(
  i_lane: number,
  xValueAxisHeightInfo: XValueAxisHeightInfo,
  subChartX: number,
  subChartWidth: number,
  clearance: OverhangClearance,
): { x: number; tickValue: number }[] {
  const ticks = xValueAxisHeightInfo.xAxisTickValues[i_lane];
  const positions = getValueAxisTickPositions(
    subChartX,
    subChartWidth,
    ticks.length,
    clearance,
    "x",
  );
  return positions.map((x, i) => ({ x, tickValue: ticks[i] }));
}
