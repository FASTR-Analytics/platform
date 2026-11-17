// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";
import type { XTextAxisMeasuredInfo } from "./types.ts";

export function calculateVerticalGridLinesForLaneXText(
  subChartRcd: RectCoordsDims,
  xTextAxisMeasuredInfo: XTextAxisMeasuredInfo,
  nIndicators: number,
  gridLineStrokeWidth: number,
  centeredTicks: boolean,
): { x: number; tickValue?: number }[] {
  const mx = xTextAxisMeasuredInfo;
  const verticalGridLines: { x: number; tickValue?: number }[] = [];

  let currentX = centeredTicks
    ? subChartRcd.x()
    : subChartRcd.x() + gridLineStrokeWidth / 2;

  for (let i_indicator = 0; i_indicator < nIndicators; i_indicator++) {
    if (centeredTicks) {
      verticalGridLines.push({
        x: currentX + mx.slotExtent / 2,
      });
    } else {
      verticalGridLines.push({ x: currentX });
    }

    currentX += centeredTicks
      ? mx.slotExtent
      : mx.slotExtent + gridLineStrokeWidth;
  }

  // Add final grid line at right edge (only for non-centered ticks)
  if (!centeredTicks) {
    verticalGridLines.push({
      x: subChartRcd.rightX() - gridLineStrokeWidth / 2,
    });
  }

  return verticalGridLines;
}
