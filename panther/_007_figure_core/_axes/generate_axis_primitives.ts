// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartAxisPrimitive,
  HeaderItem,
  ItemCoordinate,
  LineStyle,
  MergedGridStyle,
  MergedXPeriodAxisStyle,
  MergedXScaleAxisStyle,
  MergedXTextAxisStyle,
  MergedYScaleAxisStyle,
  MergedYTextAxisStyle,
  NestedIdentity,
  PeriodType,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import {
  buildItem,
  computeBoundsForPath,
  Coordinates,
  getPeriodIdFromTime,
  labelBoxRcd,
  slotCoordinate,
  unionRectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import { type ChartItemAxes, periodCoordinate } from "../chart_items.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import type { XScaleAxisHeightInfo } from "./x_scale/types.ts";
import type { YTextAxisWidthInfo } from "./y_text/types.ts";
import type { OverhangClearance, YScaleAxisWidthInfo } from "../types.ts";
import { getScaleAxisTickPositions } from "./scale_tick_positions.ts";
import {
  getLargePeriodLabel,
  getSmallPeriodLabelIfAny,
  isLargePeriod,
  labelFitsCell,
  pickLargeLabelForm,
  shouldLabelYear,
} from "./x_period/helpers.ts";

// Tick label alignment for scale axes. "center" centers every label on its
// tick; "inset" pulls the first/last labels inward so they stay within the
// plot extent without any overhang clearance.
function getScaleTickLabelAlignment(
  i_tick: number,
  nTicks: number,
  mode: "center" | "inset",
  axis: "x" | "y",
): { h: "left" | "center" | "right"; v: "top" | "middle" | "bottom" } {
  if (mode === "center" || nTicks <= 1) {
    return axis === "x"
      ? { h: "center", v: "top" }
      : { h: "right", v: "middle" };
  }
  if (axis === "x") {
    if (i_tick === 0) {
      return { h: "left", v: "top" };
    }
    if (i_tick === nTicks - 1) {
      return { h: "right", v: "top" };
    }
    return { h: "center", v: "top" };
  }
  if (i_tick === 0) {
    return { h: "right", v: "bottom" };
  }
  if (i_tick === nTicks - 1) {
    return { h: "right", v: "top" };
  }
  return { h: "right", v: "middle" };
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    X-Text Axis Primitive Generation                                       //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateXTextAxisPrimitive(
  rc: RenderContext,
  itemAxes: ChartItemAxes,
  i_pane: number,
  i_lane: number,
  subChartAreaX: number,
  mx: XTextAxisMeasuredInfo,
  indicatorHeaders: HeaderItem[],
  axisStyle: MergedXTextAxisStyle,
  gridStyle: MergedGridStyle,
  // Proportional band layout: this band's own width (bands are unequal, so
  // the shared mx.subChartAreaWidth is wrong for the axis line).
  bandWidthOverride?: number,
): ChartAxisPrimitive {
  const sx = axisStyle;
  const sg = gridStyle;
  const slots = xAxisSlots(itemAxes, i_pane, i_lane);

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
      indicatorHeaders[i_indicator].label,
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels
        ? mx.verticalTickLabelMaxHeight
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

    const label: TickLabel = {
      mText,
      position: labelPosition,
      alignment: { h: "center", v: "top" },
    };
    ticks.push({
      position: new Coordinates([tickX, tickY]),
      tickLine: {
        start: new Coordinates([tickX, tickY]),
        end: new Coordinates([tickX, tickY + sx.tickHeight]),
      },
      label,
      value: indicatorHeaders[i_indicator],
      ...tickIdentity(
        slots.coordinates,
        slotCoordinate(
          itemAxes.indicator?.dimension,
          indicatorHeaders[i_indicator],
        ),
        label,
      ),
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
      new Coordinates([
        subChartAreaX + (bandWidthOverride ?? mx.subChartAreaWidth),
        axisY,
      ]),
    ],
    style: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  return withPaintedBounds({
    type: "chart-axis",
    key: `x-text-axis-${i_pane}-${i_lane}`,
    item: buildItem(slots.coordinates),
    meta: { axisType: "x-text", ...slots.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridStrokeWidth,
      lineDash: "solid",
    },
    zIndex: Z_INDEX.AXIS,
  });
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    X-Period Axis Primitive Generation                                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateXPeriodAxisPrimitive(
  rc: RenderContext,
  itemAxes: ChartItemAxes,
  i_pane: number,
  i_lane: number,
  subChartAreaX: number,
  mx: XPeriodAxisMeasuredInfo,
  period: {
    dimension: string;
    periodType: PeriodType;
    timeMin: number;
    nTimePoints: number;
  },
  axisStyle: MergedXPeriodAxisStyle,
  gridStyle: MergedGridStyle,
): ChartAxisPrimitive {
  const sx = axisStyle;
  const sg = gridStyle;
  const { periodType, timeMin, nTimePoints } = period;
  const slots = xAxisSlots(itemAxes, i_pane, i_lane);

  const axisY = mx.xAxisRcd.y() + sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];
  const tickY = mx.xAxisRcd.y() + sg.axisStrokeWidth;
  // Every time point that gets a label gets a tick in the same iteration, so
  // the label goes to the most recent tick, the tick at its period.
  const labelLastTick = (label: TickLabel, periodId: number) => {
    ticks[ticks.length - 1] = {
      ...ticks[ticks.length - 1],
      label,
      ...tickIdentity(
        slots.coordinates,
        periodCoordinate(period.dimension, periodId),
        label,
      ),
    };
  };

  // Full-height ticks bound the year-label cells. With boundaryTicksEveryYear
  // every year start gets one and cells are single bands (labelled every Nth);
  // otherwise only labelled starts get one and each cell spans N bands.
  let currentX = mx.periodAxisType === "year-centered"
    ? subChartAreaX
    : subChartAreaX + sg.gridStrokeWidth / 2;
  let prevLargeTickX: number | undefined = undefined;
  let prevLargeTickPeriodId: number | undefined = undefined;
  let prevLargeTickIVal = 0;
  const cells: {
    leftX: number;
    rightX: number;
    periodId: number;
    nPoints: number;
  }[] = [];

  // Loop through time points
  for (let i_val = 0; i_val < nTimePoints; i_val++) {
    const time = timeMin + i_val;
    const periodId = getPeriodIdFromTime(time, periodType);
    const isYearStart = mx.periodAxisType !== "year-centered" &&
      (i_val === 0 || isLargePeriod(periodId, periodType, sx.calendar));
    const isLargeTick = isYearStart &&
      (i_val === 0 || mx.boundaryTicksEveryYear ||
        shouldLabelYear(
          periodId,
          periodType,
          mx.yearSkipInterval,
          sx.calendar,
        ));

    if (isLargeTick) {
      // Large tick (year boundary) - full height
      ticks.push({
        position: new Coordinates([currentX, tickY]),
        tickLine: {
          start: new Coordinates([currentX, tickY]),
          end: new Coordinates([currentX, mx.xAxisRcd.bottomY()]),
        },
        value: periodId,
      });

      if (prevLargeTickX !== undefined && prevLargeTickPeriodId !== undefined) {
        cells.push({
          leftX: prevLargeTickX,
          rightX: currentX,
          periodId: prevLargeTickPeriodId,
          nPoints: i_val - prevLargeTickIVal,
        });
      }
      prevLargeTickPeriodId = periodId;
      prevLargeTickX = currentX;
      prevLargeTickIVal = i_val;
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
            value: periodId,
          });
        } else {
          // Year-centered: centered ticks
          if (i_val % mx.yearSkipInterval === 0) {
            const tickX = currentX + mx.periodIncrementWidth / 2;
            ticks.push({
              position: new Coordinates([tickX, tickY]),
              tickLine: {
                start: new Coordinates([tickX, tickY]),
                end: new Coordinates([tickX, tickY + mx.periodAxisSmallTickH]),
              },
              value: periodId,
            });
          }
        }
      }
    }

    // Small period labels (months/quarters) - render for ALL periods
    const smallLabel = getSmallPeriodLabelIfAny(
      periodId,
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
        labelLastTick({
          mText,
          position: labelPos,
          alignment: { h: "center", v: "top" },
        }, periodId);
      } else {
        // Year-centered: label every Nth
        if (i_val % mx.yearSkipInterval === 0) {
          const form = pickLargeLabelForm(
            mx.labelSpan,
            mx.labelSpan,
            mx.labelGap,
            mx.largeLabelForms,
          );
          const yearLabel = getLargePeriodLabel(periodId, form);
          const mText = rc.mText(
            yearLabel,
            sx.text.xPeriodAxisTickLabels,
            mx.periodIncrementWidth * mx.yearSkipInterval,
          );
          const labelPos = new Coordinates([
            currentX + mx.periodIncrementWidth / 2,
            tickY + mx.periodAxisSmallTickH + sx.periodLabelSmallTopPadding,
          ]);
          labelLastTick({
            mText,
            position: labelPos,
            alignment: { h: "center", v: "top" },
          }, periodId);
        }
      }
    }

    currentX += mx.periodAxisType === "year-centered"
      ? mx.periodIncrementWidth
      : sg.gridStrokeWidth + mx.periodIncrementWidth;
  }

  if (prevLargeTickX !== undefined && prevLargeTickPeriodId !== undefined) {
    cells.push({
      leftX: prevLargeTickX,
      rightX: currentX,
      periodId: prevLargeTickPeriodId,
      nPoints: nTimePoints - prevLargeTickIVal,
    });
  }

  // Year labels, one per labelled cell, starting labelGap right of the cell's
  // boundary tick: the tick marks the instant the year begins and the label
  // reads onward from it. Under boundaryTicksEveryYear only every Nth band is
  // labelled; otherwise every cell is (its left tick was placed on label
  // parity, except the axis start, which keeps its label as the reader's
  // anchor). One form serves the whole axis: the widest that fits every cell
  // able to take at least the shortest form. A cell too narrow even for that,
  // a sliver of a partial band at either edge, goes unlabelled rather than
  // dragging the form down.
  const shortestFormW = mx.largeLabelForms[mx.largeLabelForms.length - 1].w;
  const labelInset = sg.gridStrokeWidth / 2 + mx.labelGap;
  const labelledCells = cells
    .map((cell) => ({
      ...cell,
      labelX: cell.leftX + labelInset,
      roomW: cell.rightX - sg.gridStrokeWidth / 2 - cell.leftX - labelInset,
    }))
    .filter((cell) =>
      (!mx.boundaryTicksEveryYear ||
        shouldLabelYear(
          cell.periodId,
          periodType,
          mx.yearSkipInterval,
          sx.calendar,
        )) &&
      labelFitsCell(shortestFormW, cell.roomW)
    );
  const form = pickLargeLabelForm(
    mx.labelSpan,
    Math.min(...labelledCells.map((cell) => cell.roomW)),
    mx.labelGap,
    mx.largeLabelForms,
  );
  for (const cell of labelledCells) {
    const mText = rc.mText(
      getLargePeriodLabel(cell.periodId, form),
      sx.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    );
    if (!labelFitsCell(mText.dims.w(), cell.roomW)) {
      continue;
    }
    const labelPos = new Coordinates([
      cell.labelX,
      mx.xAxisRcd.bottomY() - mText.dims.h(),
    ]);
    const label: TickLabel = {
      mText,
      position: labelPos,
      alignment: { h: "left", v: "top" },
    };
    // Pseudo-tick carrying the label (no tick line). A cell of one annual
    // time point names that year; any other cell spans several time points
    // and names none.
    ticks.push({
      position: labelPos,
      label,
      value: cell.periodId,
      ...(periodType === "year" && cell.nPoints === 1
        ? tickIdentity(
          slots.coordinates,
          periodCoordinate(period.dimension, cell.periodId),
          label,
        )
        : {}),
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

  return withPaintedBounds({
    type: "chart-axis",
    key: `x-period-axis-${i_pane}-${i_lane}`,
    item: buildItem(slots.coordinates),
    meta: { axisType: "x-period", ...slots.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridStrokeWidth,
      lineDash: "solid",
    },
    zIndex: Z_INDEX.AXIS,
  });
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Y-Scale Axis Primitive Generation                                      //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateYScaleAxisPrimitive(
  rc: RenderContext,
  itemAxes: ChartItemAxes,
  i_pane: number,
  i_tier: number,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartAreaY: number,
  subChartAreaHeight: number,
  clearance: OverhangClearance,
  axisLabelText: string | undefined,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
): ChartAxisPrimitive {
  const my = yScaleAxisWidthInfo;
  const slots = yAxisSlots(itemAxes, i_pane, i_tier);
  const axisX = yAxisRcd.rightX() - sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const tickValues = my.yAxisTickValues[i_tier];
  const tickPositions = getScaleAxisTickPositions(
    subChartAreaY,
    subChartAreaHeight,
    tickValues.length,
    clearance,
    "y",
  );

  // This goes down (from top to bottom, which is high values to low values)
  for (let i_tick = tickValues.length - 1; i_tick >= 0; i_tick--) {
    const tickVal = tickValues[i_tick];
    const tickY = tickPositions[i_tick];
    const tickLabel = my.tickLabelFormatter(tickVal);
    const mTickLabel = rc.mText(tickLabel, sy.text.yScaleAxisTickLabels, 9999);

    ticks.push({
      position: new Coordinates([axisX, tickY]),
      tickLine: {
        start: new Coordinates([
          yAxisRcd.rightX() - (sg.axisStrokeWidth + sy.tickWidth),
          tickY,
        ]),
        end: new Coordinates([
          yAxisRcd.rightX() - sg.axisStrokeWidth,
          tickY,
        ]),
      },
      label: {
        mText: mTickLabel,
        position: new Coordinates([
          yAxisRcd.rightX() -
          (sg.axisStrokeWidth + sy.tickWidth + sy.tickLabelGap),
          tickY,
        ]),
        alignment: getScaleTickLabelAlignment(
          i_tick,
          tickValues.length,
          sy.tickLabelAlignment,
          "y",
        ),
      },
      value: tickVal,
    });
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

  let axisLabel: ChartAxisPrimitive["axisLabel"];
  if (axisLabelText) {
    const mLabel = rc.mText(
      axisLabelText,
      sy.text.yScaleAxisLabel,
      Number.POSITIVE_INFINITY,
      { rotation: "anticlockwise" },
    );
    axisLabel = {
      mText: mLabel,
      position: new Coordinates([
        yAxisRcd.x() + my.tierHeaderAndLabelGapWidth,
        subChartAreaY + subChartAreaHeight / 2,
      ]),
      alignment: { h: "left", v: "middle" },
    };
  }

  return withPaintedBounds({
    type: "chart-axis",
    key: `y-scale-axis-${i_pane}-${i_tier}`,
    item: buildItem(slots.coordinates),
    meta: { axisType: "y-scale", ...slots.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridStrokeWidth,
      lineDash: "solid",
    },
    axisLabel,
    zIndex: Z_INDEX.AXIS,
  });
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    X-Scale Axis Primitive Generation                                       //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateXScaleAxisPrimitive(
  rc: RenderContext,
  itemAxes: ChartItemAxes,
  i_pane: number,
  i_lane: number,
  xScaleHeightInfo: XScaleAxisHeightInfo,
  xAxisRcd: RectCoordsDims,
  subChartAreaX: number,
  subChartAreaWidth: number,
  clearance: OverhangClearance,
  axisLabelText: string | undefined,
  sx: MergedXScaleAxisStyle,
  sg: MergedGridStyle,
): ChartAxisPrimitive {
  const slots = xAxisSlots(itemAxes, i_pane, i_lane);
  const axisY = xAxisRcd.y() + sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const tickValues = xScaleHeightInfo.xAxisTickValues[i_lane];
  const tickPositions = getScaleAxisTickPositions(
    subChartAreaX,
    subChartAreaWidth,
    tickValues.length,
    clearance,
    "x",
  );

  for (let i_tick = 0; i_tick < tickValues.length; i_tick++) {
    const tickVal = tickValues[i_tick];
    const tickX = tickPositions[i_tick];
    const tickLabel = xScaleHeightInfo.tickLabelFormatter(tickVal);
    const mTickLabel = rc.mText(tickLabel, sx.text.xScaleAxisTickLabels, 9999);

    ticks.push({
      position: new Coordinates([tickX, axisY]),
      tickLine: {
        start: new Coordinates([
          tickX,
          xAxisRcd.y() + sg.axisStrokeWidth,
        ]),
        end: new Coordinates([
          tickX,
          xAxisRcd.y() + sg.axisStrokeWidth + sx.tickHeight,
        ]),
      },
      label: {
        mText: mTickLabel,
        position: new Coordinates([
          tickX,
          xAxisRcd.y() + sg.axisStrokeWidth + sx.tickHeight + sx.tickLabelGap,
        ]),
        alignment: getScaleTickLabelAlignment(
          i_tick,
          tickValues.length,
          sx.tickLabelAlignment,
          "x",
        ),
      },
      value: tickVal,
    });
  }

  // Axis line (horizontal at top of xAxisRcd)
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([subChartAreaX - sg.gridStrokeWidth / 2, axisY]),
      new Coordinates([
        subChartAreaX + subChartAreaWidth + sg.gridStrokeWidth / 2,
        axisY,
      ]),
    ],
    style: {
      show: true,
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  let axisLabel: ChartAxisPrimitive["axisLabel"];
  if (axisLabelText) {
    const mLabel = rc.mText(
      axisLabelText,
      sx.text.xScaleAxisLabel,
      Number.POSITIVE_INFINITY,
    );
    axisLabel = {
      mText: mLabel,
      position: new Coordinates([
        subChartAreaX + subChartAreaWidth / 2,
        xAxisRcd.bottomY() - mLabel.dims.h(),
      ]),
      alignment: { h: "center", v: "top" },
    };
  }

  return withPaintedBounds({
    type: "chart-axis",
    key: `x-scale-axis-${i_pane}-${i_lane}`,
    item: buildItem(slots.coordinates),
    meta: { axisType: "x-scale", ...slots.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridStrokeWidth,
      lineDash: "solid",
    },
    axisLabel,
    zIndex: Z_INDEX.AXIS,
  });
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Y-Text Axis Primitive Generation                                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateYTextAxisPrimitive(
  rc: RenderContext,
  itemAxes: ChartItemAxes,
  i_pane: number,
  i_tier: number,
  yAxisWidthInfo: YTextAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartAreaY: number,
  subChartAreaHeight: number,
  indicatorHeaders: HeaderItem[],
  sy: MergedYTextAxisStyle,
  sg: MergedGridStyle,
): ChartAxisPrimitive {
  const slots = yAxisSlots(itemAxes, i_pane, i_tier);
  const axisX = yAxisRcd.rightX() - sg.axisStrokeWidth / 2;
  const centeredTicks = sy.tickPosition === "center";
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const nIndicators = indicatorHeaders.length;
  const rowInner = centeredTicks
    ? subChartAreaHeight / Math.max(1, nIndicators)
    : (subChartAreaHeight - sg.gridStrokeWidth * (nIndicators + 1)) /
      Math.max(1, nIndicators);

  let currentY = centeredTicks
    ? subChartAreaY
    : subChartAreaY + sg.gridStrokeWidth / 2;

  const tickX = yAxisRcd.rightX() - sg.axisStrokeWidth;

  for (let i_indicator = 0; i_indicator < nIndicators; i_indicator++) {
    const tickY = centeredTicks ? currentY + rowInner / 2 : currentY;

    const mText = rc.mText(
      indicatorHeaders[i_indicator].label,
      sy.text.yTextAxisTickLabels,
      yAxisWidthInfo.maxTickLabelW,
    );

    const labelPosition = centeredTicks
      ? new Coordinates([
        tickX - sy.tickWidth - sy.tickLabelGap,
        currentY + rowInner / 2,
      ])
      : new Coordinates([
        tickX - sy.tickWidth - sy.tickLabelGap,
        currentY + (sg.gridStrokeWidth + rowInner) / 2,
      ]);

    const label: TickLabel = {
      mText,
      position: labelPosition,
      alignment: { h: "right", v: "middle" },
    };
    ticks.push({
      position: new Coordinates([axisX, tickY]),
      tickLine: {
        start: new Coordinates([tickX - sy.tickWidth, tickY]),
        end: new Coordinates([tickX, tickY]),
      },
      label,
      value: indicatorHeaders[i_indicator],
      ...tickIdentity(
        slots.coordinates,
        slotCoordinate(
          itemAxes.indicator?.dimension,
          indicatorHeaders[i_indicator],
        ),
        label,
      ),
    });

    currentY += centeredTicks ? rowInner : rowInner + sg.gridStrokeWidth;
  }

  // Final tick at bottom boundary when sides mode
  if (!centeredTicks) {
    ticks.push({
      position: new Coordinates([axisX, currentY]),
      tickLine: {
        start: new Coordinates([tickX - sy.tickWidth, currentY]),
        end: new Coordinates([tickX, currentY]),
      },
      value: "",
    });
  }

  // Axis line (vertical at right edge of Y-axis area)
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

  return withPaintedBounds({
    type: "chart-axis",
    key: `y-text-axis-${i_pane}-${i_tier}`,
    item: buildItem(slots.coordinates),
    meta: { axisType: "y-text", ...slots.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridStrokeWidth,
      lineDash: "solid",
    },
    zIndex: Z_INDEX.AXIS,
  });
}

type TickLabel = NonNullable<ChartAxisPrimitive["ticks"][number]["label"]>;

// An x-axis serves one lane of its pane, and every tier.
function xAxisSlots(itemAxes: ChartItemAxes, i_pane: number, i_lane: number) {
  const paneHeader = itemAxes.pane?.headers[i_pane];
  const laneHeader = itemAxes.lane?.headers[i_lane];
  return {
    meta: { paneIndex: i_pane, laneIndex: i_lane, paneHeader, laneHeader },
    coordinates: [
      slotCoordinate(itemAxes.pane?.dimension, paneHeader),
      slotCoordinate(itemAxes.lane?.dimension, laneHeader),
    ],
  };
}

// A y-axis serves one tier of its pane, and every lane.
function yAxisSlots(itemAxes: ChartItemAxes, i_pane: number, i_tier: number) {
  const paneHeader = itemAxes.pane?.headers[i_pane];
  const tierHeader = itemAxes.tier?.headers[i_tier];
  return {
    meta: { paneIndex: i_pane, tierIndex: i_tier, paneHeader, tierHeader },
    coordinates: [
      slotCoordinate(itemAxes.pane?.dimension, paneHeader),
      slotCoordinate(itemAxes.tier?.dimension, tierHeader),
    ],
  };
}

// A tick whose label names one member (an indicator, a period) stands for
// that member within its axis, and is hit on its label.
function tickIdentity(
  axisCoordinates: ItemCoordinate[],
  member: ItemCoordinate,
  label: TickLabel,
): NestedIdentity {
  const item = member === undefined
    ? undefined
    : buildItem([...axisCoordinates, member]);
  if (item === undefined) {
    return {};
  }
  return {
    item,
    part: "header",
    hitBounds: labelBoxRcd(
      label.mText,
      label.position,
      label.alignment.h,
      label.alignment.v,
    ),
  };
}

// An axis's bounds are what it paints: its line, tick lines, tick labels and
// axis label.
function withPaintedBounds(
  axis: Omit<ChartAxisPrimitive, "bounds">,
): ChartAxisPrimitive {
  const lineRects = [
    computeBoundsForPath(axis.axisLine.coords, axis.axisLine.style.strokeWidth),
    ...axis.ticks.flatMap((tick) =>
      tick.tickLine
        ? [
          computeBoundsForPath(
            [tick.tickLine.start, tick.tickLine.end],
            axis.tickStyle.strokeWidth,
          ),
        ]
        : []
    ),
  ];
  const textRects = [
    ...axis.ticks.flatMap((tick) => tick.label ? [tick.label] : []),
    ...(axis.axisLabel ? [axis.axisLabel] : []),
  ].map((l) => labelBoxRcd(l.mText, l.position, l.alignment.h, l.alignment.v));
  return { ...axis, bounds: unionRectCoordsDims([...lineRects, ...textRects]) };
}
