// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getPeriodIdFromTime } from "../../deps.ts";
import type { CalendarType, PeriodType, RectCoordsDims } from "../../deps.ts";
import { isLargePeriod } from "./helpers.ts";
import type { XPeriodAxisMeasuredInfo } from "./types.ts";

export function calculateVerticalGridLinesForLaneXPeriod(
  subChartRcd: RectCoordsDims,
  xPeriodAxisMeasuredInfo: XPeriodAxisMeasuredInfo,
  periodType: PeriodType,
  timeMin: number,
  nTimePoints: number,
  gridLineStrokeWidth: number,
  showEveryNthTick: number,
  calendar: CalendarType,
): { x: number; tickValue?: number }[] {
  const mx = xPeriodAxisMeasuredInfo;
  const verticalGridLines: { x: number; tickValue?: number }[] = [];

  let currentX = mx.periodAxisType === "year-centered"
    ? subChartRcd.x()
    : subChartRcd.x() + gridLineStrokeWidth / 2;

  for (let i_value = 0; i_value < nTimePoints; i_value++) {
    const time = timeMin + i_value;
    const period = getPeriodIdFromTime(time, periodType);
    const isLargeTick = mx.periodAxisType !== "year-centered" &&
      (i_value === 0 || isLargePeriod(period, periodType, calendar));

    if (isLargeTick) {
      verticalGridLines.push({ x: currentX, tickValue: period });
    } else {
      if (mx.periodAxisSmallTickH !== "none") {
        if (mx.periodAxisType === "year-centered") {
          if (i_value % showEveryNthTick === 0) {
            verticalGridLines.push({
              x: currentX + mx.slotExtent / 2,
              tickValue: period,
            });
          }
        }
      }
    }

    currentX += mx.periodAxisType === "year-centered"
      ? mx.slotExtent
      : gridLineStrokeWidth + mx.slotExtent;
  }

  // Add final grid line at right edge (only for non-centered period axis)
  if (mx.periodAxisType !== "year-centered") {
    verticalGridLines.push({
      x: subChartRcd.rightX() - gridLineStrokeWidth / 2,
    });
  }

  return verticalGridLines;
}
