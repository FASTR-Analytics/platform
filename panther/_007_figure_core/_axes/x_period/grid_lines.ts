// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getPeriodIdFromTime } from "../../deps.ts";
import type { PeriodType, RectCoordsDims } from "../../deps.ts";
import { isLargePeriod } from "./helpers.ts";
import type { XPeriodAxisMeasuredInfo } from "./types.ts";

// NOTE: This function needs data from TimeseriesDataTransformed
// We pass the needed data as parameters to avoid importing from higher-numbered modules
export function calculateVerticalGridLinesForLaneXPeriod(
  i_lane: number,
  plotAreaRcd: RectCoordsDims,
  xPeriodAxisMeasuredInfo: XPeriodAxisMeasuredInfo,
  periodType: PeriodType,
  timeMin: number,
  nTimePoints: number,
  gridStrokeWidth: number,
  showEveryNthTick: number,
): { x: number; tickValue?: number }[] {
  const mx = xPeriodAxisMeasuredInfo;
  const verticalGridLines: { x: number; tickValue?: number }[] = [];

  let currentX = mx.periodAxisType === "year-centered"
    ? plotAreaRcd.x()
    : plotAreaRcd.x() + gridStrokeWidth / 2;

  for (let i_val = 0; i_val < nTimePoints; i_val++) {
    const time = timeMin + i_val;
    const period = getPeriodIdFromTime(time, periodType);
    const isLargeTick = mx.periodAxisType !== "year-centered" &&
      (i_val === 0 || isLargePeriod(period, periodType));

    if (isLargeTick) {
      verticalGridLines.push({ x: currentX, tickValue: period });
    } else {
      if (mx.periodAxisSmallTickH !== "none") {
        if (mx.periodAxisType === "year-centered") {
          if (i_val % showEveryNthTick === 0) {
            verticalGridLines.push({
              x: currentX + mx.periodIncrementWidth / 2,
              tickValue: period,
            });
          }
        }
      }
    }

    currentX += mx.periodIncrementWidth;
  }

  // Add final grid line at right edge (only for non-centered period axis)
  if (mx.periodAxisType !== "year-centered") {
    verticalGridLines.push({ x: plotAreaRcd.rightX() - gridStrokeWidth / 2 });
  }

  return verticalGridLines;
}
