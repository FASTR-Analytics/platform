// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { OverhangClearance } from "../../types.ts";
import { getScaleAxisTickPositions } from "../scale_tick_positions.ts";
import type { XScaleAxisHeightInfo } from "./types.ts";

export function calculateVerticalGridLinesForLaneXScale(
  i_lane: number,
  xScaleHeightInfo: XScaleAxisHeightInfo,
  plotAreaX: number,
  plotAreaWidth: number,
  clearance: OverhangClearance,
): { x: number; tickValue: number }[] {
  const ticks = xScaleHeightInfo.xAxisTickValues[i_lane];
  const positions = getScaleAxisTickPositions(
    plotAreaX,
    plotAreaWidth,
    ticks.length,
    clearance,
    "x",
  );
  return positions.map((x, i) => ({ x, tickValue: ticks[i] }));
}
