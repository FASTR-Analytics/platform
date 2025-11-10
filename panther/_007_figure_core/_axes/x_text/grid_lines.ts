// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";
import type { XTextAxisMeasuredInfo } from "./types.ts";

// NOTE: This function needs data from ChartOVDataTransformed
// We pass the needed data as parameters to avoid importing from higher-numbered modules
export function calculateVerticalGridLinesForLaneXText(
  i_lane: number,
  plotAreaRcd: RectCoordsDims,
  xTextAxisMeasuredInfo: XTextAxisMeasuredInfo,
  nIndicators: number,
  gridStrokeWidth: number,
  centeredTicks: boolean,
): { x: number; tickValue?: number }[] {
  const mx = xTextAxisMeasuredInfo;
  const verticalGridLines: { x: number; tickValue?: number }[] = [];

  let currentX = centeredTicks
    ? plotAreaRcd.x()
    : plotAreaRcd.x() + gridStrokeWidth / 2;

  for (let i_indicator = 0; i_indicator < nIndicators; i_indicator++) {
    if (centeredTicks) {
      verticalGridLines.push({
        x: currentX + mx.indicatorAreaInnerWidth / 2,
      });
    } else {
      verticalGridLines.push({ x: currentX });
    }

    currentX += mx.indicatorAreaInnerWidth + gridStrokeWidth;
  }

  // Add final grid line at right edge (only for non-centered ticks)
  if (!centeredTicks) {
    verticalGridLines.push({ x: plotAreaRcd.rightX() - gridStrokeWidth / 2 });
  }

  return verticalGridLines;
}
