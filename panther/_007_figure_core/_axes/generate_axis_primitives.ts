// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartAxisPrimitive,
  LineStyle,
  MeasuredText,
  PeriodType,
  RenderContext,
} from "../deps.ts";
import { Coordinates, getPeriodIdFromTime, Z_INDEX } from "../deps.ts";
import type {
  MergedChartOVStyle,
  MergedGridStyle,
  MergedTimeseriesStyle,
  MergedYScaleAxisStyle,
  RectCoordsDims,
} from "../deps.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import type { YScaleAxisData, YScaleAxisWidthInfo } from "../types.ts";
import {
  getLargePeriodLabel,
  getSmallPeriodLabelIfAny,
  getYearDigits,
  isLargePeriod,
} from "./x_period/helpers.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    X-Text Axis Primitive Generation                                       //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateXTextAxisPrimitive(
  rc: RenderContext,
  i_pane: number,
  i_lane: number,
  subChartAreaX: number,
  mx: XTextAxisMeasuredInfo,
  indicatorHeaders: string[],
  s: MergedChartOVStyle,
): ChartAxisPrimitive {
  const sx = s.xTextAxis;
  const sg = s.grid;

  const axisY = mx.xAxisRcd.y() + sg.axisStrokeWidth / 2;
  const centeredTicks = sx.tickPosition === "center";
  const ticks: ChartAxisPrimitive["ticks"] = [];

  let currentX = centeredTicks
    ? subChartAreaX
    : subChartAreaX + sg.gridStrokeWidth / 2;
  const tickY = mx.xAxisRcd.y() + sg.axisStrokeWidth;

  // Generate ticks for each indicator
  for (
    let i_indicator = 0;
    i_indicator < indicatorHeaders.length;
    i_indicator++
  ) {
    const tickX = centeredTicks
      ? currentX + mx.indicatorAreaInnerWidth / 2
      : currentX;

    // Measure tick label
    const mText = rc.mText(
      indicatorHeaders[i_indicator],
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels
        ? Number.POSITIVE_INFINITY
        : mx.indicatorAreaInnerWidth,
      { rotation: sx.verticalTickLabels ? "anticlockwise" : undefined },
    );

    // Calculate label position
    const labelPosition = centeredTicks
      ? new Coordinates([
        currentX + mx.indicatorAreaInnerWidth / 2,
        tickY + sx.tickHeight + sx.tickLabelGap,
      ])
      : new Coordinates([
        currentX + (sg.gridStrokeWidth + mx.indicatorAreaInnerWidth) / 2,
        tickY + sx.tickLabelGap,
      ]);

    ticks.push({
      position: new Coordinates([tickX, tickY]),
      tickLine: {
        start: new Coordinates([tickX, tickY]),
        end: new Coordinates([tickX, tickY + sx.tickHeight]),
      },
      label: {
        mText,
        position: labelPosition,
        alignment: { h: "center", v: "top" },
      },
      value: indicatorHeaders[i_indicator],
    });

    currentX += centeredTicks
      ? mx.indicatorAreaInnerWidth
      : sg.gridStrokeWidth + mx.indicatorAreaInnerWidth;
  }

  // Add final tick if not centered
  if (!centeredTicks) {
    ticks.push({
      position: new Coordinates([currentX, tickY]),
      tickLine: {
        start: new Coordinates([currentX, tickY]),
        end: new Coordinates([currentX, tickY + sx.tickHeight]),
      },
      value: "",
    });
  }

  // Axis line
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([subChartAreaX, axisY]),
      new Coordinates([subChartAreaX + mx.subChartAreaWidth, axisY]),
    ],
    style: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  return {
    type: "chart-axis",
    key: `x-text-axis-${i_pane}-${i_lane}`,
    bounds: mx.xAxisRcd,
    meta: {
      axisType: "x-text",
      paneIndex: i_pane,
      laneIndex: i_lane,
    },
    ticks,
    axisLine,
    zIndex: (Z_INDEX as any).AXIS,
  };
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    X-Period Axis Primitive Generation                                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateXPeriodAxisPrimitive(
  rc: RenderContext,
  i_pane: number,
  i_lane: number,
  subChartAreaX: number,
  mx: XPeriodAxisMeasuredInfo,
  nTimePoints: number,
  timeMin: number,
  periodType: PeriodType,
  s: MergedTimeseriesStyle,
): ChartAxisPrimitive {
  const sx = s.xPeriodAxis;
  const sg = s.grid;

  const axisY = mx.xAxisRcd.y() + sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];
  const tickY = mx.xAxisRcd.y() + sg.axisStrokeWidth;

  // Track large ticks (year boundaries) for large labels
  let currentX = mx.periodAxisType === "year-centered"
    ? subChartAreaX
    : subChartAreaX + sg.gridStrokeWidth / 2;
  let prevLargeTickX: number | undefined = undefined;
  let prevLargeTickPeriodId: number | undefined = undefined;
  const largeTicks: { leftX: number; rightX: number; periodId: number }[] = [];

  // Loop through time points
  for (let i_val = 0; i_val < nTimePoints; i_val++) {
    const time = timeMin + i_val;
    const period = getPeriodIdFromTime(time, periodType);
    const isLargeTick = mx.periodAxisType !== "year-centered" &&
      (i_val === 0 || isLargePeriod(period, periodType));

    if (isLargeTick) {
      // Large tick (year boundary) - full height
      ticks.push({
        position: new Coordinates([currentX, tickY]),
        tickLine: {
          start: new Coordinates([currentX, tickY]),
          end: new Coordinates([currentX, mx.xAxisRcd.bottomY()]),
        },
        value: period,
      });

      if (prevLargeTickX !== undefined && prevLargeTickPeriodId !== undefined) {
        largeTicks.push({
          leftX: prevLargeTickX,
          rightX: currentX,
          periodId: prevLargeTickPeriodId,
        });
      }
      prevLargeTickPeriodId = period;
      prevLargeTickX = currentX;
    } else {
      // Small tick (month/quarter)
      if (mx.periodAxisSmallTickH !== "none") {
        if (mx.periodAxisType !== "year-centered") {
          ticks.push({
            position: new Coordinates([currentX, tickY]),
            tickLine: {
              start: new Coordinates([currentX, tickY]),
              end: new Coordinates([currentX, tickY + mx.periodAxisSmallTickH]),
            },
            value: period,
          });
        } else {
          // Year-centered: centered ticks
          if (i_val % sx.showEveryNthTick === 0) {
            const tickX = currentX + mx.periodIncrementWidth / 2;
            ticks.push({
              position: new Coordinates([tickX, tickY]),
              tickLine: {
                start: new Coordinates([tickX, tickY]),
                end: new Coordinates([tickX, tickY + mx.periodAxisSmallTickH]),
              },
              value: period,
            });
          }
        }
      }
    }

    // Small period labels (months/quarters) - render for ALL periods
    const smallLabel = getSmallPeriodLabelIfAny(
      period,
      mx.periodAxisType,
      sx.calendar,
    );
    if (smallLabel && mx.periodAxisSmallTickH !== "none") {
      if (mx.periodAxisType !== "year-centered") {
        const mText = rc.mText(
          smallLabel,
          sx.text.xPeriodAxisTickLabels,
          mx.periodIncrementWidth,
        );
        const labelPos = new Coordinates([
          currentX + (sg.gridStrokeWidth + mx.periodIncrementWidth) / 2,
          tickY + sx.periodLabelSmallTopPadding,
        ]);
        // Add label to most recent tick
        if (ticks.length > 0) {
          ticks[ticks.length - 1].label = {
            mText,
            position: labelPos,
            alignment: { h: "center", v: "top" },
          };
        }
      } else {
        // Year-centered: label every Nth
        if (i_val % sx.showEveryNthTick === 0) {
          const digits = getYearDigits(
            mx.periodIncrementWidth * sx.showEveryNthTick,
            mx.fourDigitYearW,
          );
          const yearLabel = getLargePeriodLabel(period, digits);
          const mText = rc.mText(
            yearLabel,
            sx.text.xPeriodAxisTickLabels,
            mx.periodIncrementWidth * sx.showEveryNthTick,
          );
          const labelPos = new Coordinates([
            currentX + mx.periodIncrementWidth / 2,
            tickY + mx.periodAxisSmallTickH + sx.periodLabelSmallTopPadding,
          ]);
          if (ticks.length > 0) {
            ticks[ticks.length - 1].label = {
              mText,
              position: labelPos,
              alignment: { h: "center", v: "top" },
            };
          }
        }
      }
    }

    currentX += mx.periodAxisType === "year-centered"
      ? mx.periodIncrementWidth
      : sg.gridStrokeWidth + mx.periodIncrementWidth;
  }

  // Add final tick (if not year-centered)
  if (mx.periodAxisType !== "year-centered") {
    ticks.push({
      position: new Coordinates([currentX, tickY]),
      tickLine: {
        start: new Coordinates([currentX, tickY]),
        end: new Coordinates([currentX, mx.xAxisRcd.bottomY()]),
      },
      value: "",
    });
  }

  if (prevLargeTickX !== undefined && prevLargeTickPeriodId !== undefined) {
    largeTicks.push({
      leftX: prevLargeTickX,
      rightX: currentX,
      periodId: prevLargeTickPeriodId,
    });
  }

  // Add large period labels (year labels spanning multiple periods)
  if (largeTicks.length > 0) {
    const minLargeTickSpace = Math.min(
      ...largeTicks.map((lt) => lt.rightX - lt.leftX - sg.gridStrokeWidth),
    );
    const digits = getYearDigits(minLargeTickSpace, mx.fourDigitYearW);

    for (const largeTick of largeTicks) {
      const mText = rc.mText(
        getLargePeriodLabel(largeTick.periodId, digits),
        sx.text.xPeriodAxisTickLabels,
        mx.periodIncrementWidth,
      );
      const spaceForLabel = largeTick.rightX - largeTick.leftX -
        sg.gridStrokeWidth;
      if (mText.dims.w() <= spaceForLabel) {
        // Add a pseudo-tick for the large label (no tick line, just label)
        ticks.push({
          position: new Coordinates([
            largeTick.leftX + (largeTick.rightX - largeTick.leftX) / 2,
            mx.xAxisRcd.bottomY() - mText.dims.h(),
          ]),
          label: {
            mText,
            position: new Coordinates([
              largeTick.leftX + (largeTick.rightX - largeTick.leftX) / 2,
              mx.xAxisRcd.bottomY() - mText.dims.h(),
            ]),
            alignment: { h: "center", v: "top" },
          },
          value: largeTick.periodId,
        });
      }
    }
  }

  // Axis line
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([subChartAreaX, axisY]),
      new Coordinates([subChartAreaX + mx.subChartAreaWidth, axisY]),
    ],
    style: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  return {
    type: "chart-axis",
    key: `x-period-axis-${i_pane}-${i_lane}`,
    bounds: mx.xAxisRcd,
    meta: {
      axisType: "x-period",
      paneIndex: i_pane,
      laneIndex: i_lane,
    },
    ticks,
    axisLine,
    zIndex: (Z_INDEX as any).AXIS,
  };
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Y-Scale Axis Primitive Generation                                      //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateYScaleAxisPrimitive(
  rc: RenderContext,
  i_pane: number,
  i_tier: number,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartAreaY: number,
  subChartAreaHeight: number,
  dy: YScaleAxisData,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
): ChartAxisPrimitive {
  const my = yScaleAxisWidthInfo;
  const axisX = yAxisRcd.rightX() - sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];

  // Generate ticks
  const tickIncrement = subChartAreaHeight /
    (my.yAxisTickValues[i_tier].length - 1);
  let currentY = subChartAreaY;

  // This goes down (from top to bottom, which is high values to low values)
  for (
    let i_tick = my.yAxisTickValues[i_tier].length - 1;
    i_tick >= 0;
    i_tick--
  ) {
    const tickVal = my.yAxisTickValues[i_tier][i_tick];
    const tickLabel = sy.tickLabelFormatter(tickVal);
    const mTickLabel = rc.mText(tickLabel, sy.text.yScaleAxisTickLabels, 9999);

    ticks.push({
      position: new Coordinates([axisX, currentY]),
      tickLine: {
        start: new Coordinates([
          yAxisRcd.rightX() - (sg.axisStrokeWidth + sy.tickWidth),
          currentY,
        ]),
        end: new Coordinates([
          yAxisRcd.rightX() - sg.axisStrokeWidth,
          currentY,
        ]),
      },
      label: {
        mText: mTickLabel,
        position: new Coordinates([
          yAxisRcd.rightX() -
          (sg.axisStrokeWidth + sy.tickWidth + sy.tickLabelGap),
          currentY,
        ]),
        alignment: { h: "right", v: "center" },
      },
      value: tickVal,
    });

    currentY += tickIncrement;
  }

  // Axis line (vertical line for y-axis)
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([axisX, subChartAreaY - sg.gridStrokeWidth / 2]),
      new Coordinates([
        axisX,
        subChartAreaY + subChartAreaHeight + sg.gridStrokeWidth / 2,
      ]),
    ],
    style: {
      show: true,
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  return {
    type: "chart-axis",
    key: `y-scale-axis-${i_pane}-${i_tier}`,
    bounds: yAxisRcd,
    meta: {
      axisType: "y-scale",
      paneIndex: i_pane,
      laneIndex: 0, // Y-axis spans all lanes
      tierIndex: i_tier,
    },
    ticks,
    axisLine,
    zIndex: (Z_INDEX as any).AXIS,
  };
}
