// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getPeriodIdFromTime } from "../../deps.ts";
import type {
  MergedTimeseriesStyle,
  PeriodType,
  RenderContext,
} from "../../deps.ts";
import {
  getLargePeriodLabel,
  getSmallPeriodLabelIfAny,
  getYearDigits,
  isLargePeriod,
} from "./helpers.ts";
import type { XPeriodAxisMeasuredInfo } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______         __    __                                      __                  __                            __            //
// /       \       /  |  /  |                                    /  |                /  |                          /  |           //
// $$$$$$$  |      $$ |  $$ |        ______    ______    ______  $$/   ______    ____$$ |        ______   __    __ $$/   _______  //
// $$ |__$$ |      $$  \/$$/        /      \  /      \  /      \ /  | /      \  /    $$ |       /      \ /  \  /  |/  | /       | //
// $$    $$<        $$  $$<        /$$$$$$  |/$$$$$$  |/$$$$$$  |$$ |/$$$$$$  |/$$$$$$$ |       $$$$$$  |$$  \/$$/ $$ |/$$$$$$$/  //
// $$$$$$$  |        $$$$  \       $$ |  $$ |$$    $$ |$$ |  $$/ $$ |$$ |  $$ |$$ |  $$ |       /    $$ | $$  $$<  $$ |$$      \  //
// $$ |  $$ |       $$ /$$  |      $$ |__$$ |$$$$$$$$/ $$ |      $$ |$$ \__$$ |$$ \__$$ |      /$$$$$$$ | /$$$$  \ $$ | $$$$$$  | //
// $$ |  $$ |      $$ |  $$ |      $$    $$/ $$       |$$ |      $$ |$$    $$/ $$    $$ |      $$    $$ |/$$/ $$  |$$ |/     $$/  //
// $$/   $$/       $$/   $$/       $$$$$$$/   $$$$$$$/ $$/       $$/  $$$$$$/   $$$$$$$/        $$$$$$$/ $$/   $$/ $$/ $$$$$$$/   //
//                                 $$ |                                                                                           //
//                                 $$ |                                                                                           //
//                                 $$/                                                                                            //
//                                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// NOTE: This function needs data from TimeseriesDataTransformed
// We pass the needed data as parameters to avoid importing from higher-numbered modules
export function renderXPeriodAxisForLane(
  rc: RenderContext,
  i_lane: number,
  subChartAreaX: number,
  mx: XPeriodAxisMeasuredInfo,
  nTimePoints: number,
  timeMin: number,
  periodType: PeriodType,
  s: MergedTimeseriesStyle,
  renderAxis: boolean,
): number[] {
  const axisY = mx.xAxisRcd.y() + s.grid.axisStrokeWidth / 2;
  const verticalGridLines: number[] = [];

  if (renderAxis) {
    rc.rLine(
      [
        [subChartAreaX, axisY],
        [subChartAreaX + mx.subChartAreaWidth, axisY],
      ],
      {
        strokeColor: s.grid.axisColor,
        strokeWidth: s.grid.axisStrokeWidth,
        lineDash: "solid",
      },
    );
  }

  let currentX = mx.periodAxisType === "year-centered"
    ? subChartAreaX
    : subChartAreaX + s.grid.gridStrokeWidth / 2;
  const tickY = mx.xAxisRcd.y() + s.grid.axisStrokeWidth;
  let prevLargeTickX: number | undefined = undefined;
  let prevLargeTickPeriodId: number | undefined = undefined;
  const largeTicks: { leftX: number; rightX: number; periodId: number }[] = [];

  for (let i_val = 0; i_val < nTimePoints; i_val++) {
    const time = timeMin + i_val;
    const period = getPeriodIdFromTime(time, periodType);
    const isLargeTick = mx.periodAxisType !== "year-centered" &&
      (i_val === 0 || isLargePeriod(period, periodType));

    /////////////////
    //             //
    //    Ticks    //
    //             //
    /////////////////

    if (isLargeTick) {
      verticalGridLines.push(currentX);
      if (renderAxis) {
        rc.rLine(
          [
            [currentX, tickY],
            [currentX, mx.xAxisRcd.bottomY()],
          ],
          {
            strokeColor: s.grid.axisColor,
            strokeWidth: s.grid.gridStrokeWidth,
            lineDash: "solid",
          },
        );
      }
      if (prevLargeTickX && prevLargeTickPeriodId) {
        largeTicks.push({
          leftX: prevLargeTickX,
          rightX: currentX,
          periodId: prevLargeTickPeriodId,
        });
      }
      prevLargeTickPeriodId = period;
      prevLargeTickX = currentX;
    } else {
      if (mx.periodAxisSmallTickH !== "none") {
        if (mx.periodAxisType !== "year-centered") {
          if (renderAxis) {
            rc.rLine(
              [
                [currentX, tickY],
                [currentX, tickY + mx.periodAxisSmallTickH],
              ],
              {
                strokeColor: s.grid.axisColor,
                strokeWidth: s.grid.gridStrokeWidth,
                lineDash: "solid",
              },
            );
          }
        } else {
          if (i_val % s.xPeriodAxis.showEveryNthTick === 0) {
            verticalGridLines.push(currentX + mx.periodIncrementWidth / 2);
            if (renderAxis) {
              rc.rLine(
                [
                  [currentX + mx.periodIncrementWidth / 2, tickY],
                  [
                    currentX + mx.periodIncrementWidth / 2,
                    tickY + mx.periodAxisSmallTickH,
                  ],
                ],
                {
                  strokeColor: s.grid.axisColor,
                  strokeWidth: s.grid.gridStrokeWidth,
                  lineDash: "solid",
                },
              );
            }
          }
        }
      }
    }

    /////////////////////////////
    //                         //
    //    Small tick labels    //
    //                         //
    /////////////////////////////

    const smallLabel = getSmallPeriodLabelIfAny(
      period,
      mx.periodAxisType,
      s.xPeriodAxis.calendar,
    );
    if (renderAxis && smallLabel && mx.periodAxisSmallTickH !== "none") {
      if (mx.periodAxisType !== "year-centered") {
        const mText = rc.mText(
          smallLabel,
          s.text.base,
          mx.periodIncrementWidth,
        );
        rc.rText(
          mText,
          [
            currentX +
            (s.grid.gridStrokeWidth + mx.periodIncrementWidth) / 2,
            tickY + s.xPeriodAxis.periodLabelSmallTopPadding,
          ],
          "center",
        );
      } else {
        if (i_val % s.xPeriodAxis.showEveryNthTick === 0) {
          const digits = getYearDigits(
            mx.periodIncrementWidth * s.xPeriodAxis.showEveryNthTick,
            mx.fourDigitYearW,
          );
          const yearLabel = getLargePeriodLabel(period, digits);
          const mText = rc.mText(
            yearLabel,
            s.text.base,
            mx.periodIncrementWidth * s.xPeriodAxis.showEveryNthTick,
          );
          rc.rText(
            mText,
            [
              currentX + mx.periodIncrementWidth / 2,
              tickY +
              mx.periodAxisSmallTickH +
              s.xPeriodAxis.periodLabelSmallTopPadding,
            ],
            "center",
          );
        }
      }
    }

    currentX += mx.periodAxisType === "year-centered"
      ? mx.periodIncrementWidth
      : s.grid.gridStrokeWidth + mx.periodIncrementWidth;
  }

  //////////////////////////
  //                      //
  //    Add final tick    //
  //                      //
  //////////////////////////

  if (mx.periodAxisType !== "year-centered") {
    verticalGridLines.push(currentX);
    if (renderAxis) {
      rc.rLine(
        [
          [currentX, tickY],
          [currentX, mx.xAxisRcd.bottomY()],
        ],
        {
          strokeColor: s.grid.axisColor,
          strokeWidth: s.grid.gridStrokeWidth,
          lineDash: "solid",
        },
      );
    }
  }
  if (prevLargeTickX && prevLargeTickPeriodId) {
    largeTicks.push({
      leftX: prevLargeTickX,
      rightX: currentX,
      periodId: prevLargeTickPeriodId,
    });
  }

  ////////////////////////////////////
  //                                //
  //    Render large tick labels    //
  //                                //
  ////////////////////////////////////

  const minLargeTickSpace = Math.min(
    ...largeTicks.map((largeTick) => {
      return largeTick.rightX - largeTick.leftX - s.grid.gridStrokeWidth;
    }),
  );
  const digits = getYearDigits(minLargeTickSpace, mx.fourDigitYearW);

  if (renderAxis) {
    for (const largeTick of largeTicks) {
      const mText = rc.mText(
        getLargePeriodLabel(largeTick.periodId, digits),
        s.text.base,
        mx.periodIncrementWidth,
      );
      const spaceForLargeTickLabel = largeTick.rightX -
        largeTick.leftX -
        s.grid.gridStrokeWidth;
      if (mText.dims.w() <= spaceForLargeTickLabel) {
        rc.rText(
          mText,
          [
            largeTick.leftX + (largeTick.rightX - largeTick.leftX) / 2,
            mx.xAxisRcd.bottomY() - mText.dims.h(),
          ],
          "center",
        );
      }
    }
  }

  if (mx.periodAxisType === "year-centered") {
    verticalGridLines.push(subChartAreaX + s.grid.gridStrokeWidth / 2);
    verticalGridLines.push(
      subChartAreaX + mx.subChartAreaWidth - s.grid.gridStrokeWidth / 2,
    );
  }

  return verticalGridLines;
}
