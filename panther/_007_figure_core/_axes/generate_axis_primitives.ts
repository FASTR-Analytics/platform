// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  ChartAxisPrimitive,
  DimensionMember,
  ItemCoordinate,
  LineStyle,
  MergedGridStyle,
  MergedXPeriodAxisStyle,
  MergedXTextAxisStyle,
  MergedXValueAxisStyle,
  MergedYTextAxisStyle,
  MergedYValueAxisStyle,
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
  itemCoordinate,
  labelBoxRcd,
  unionRectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import {
  type ChartItemDataDimensions,
  periodCoordinate,
} from "../chart_items.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import type { XValueAxisHeightInfo } from "./x_value/types.ts";
import type { YTextAxisWidthInfo } from "./y_text/types.ts";
import type { OverhangClearance, YValueAxisWidthInfo } from "../types.ts";
import { getValueAxisTickPositions } from "./value_axis_tick_positions.ts";
import {
  getLargePeriodLabel,
  getSmallPeriodLabelIfAny,
  isLargePeriod,
  labelFitsSpan,
  pickLargeLabelForm,
  shouldLabelYear,
} from "./x_period/helpers.ts";

// Tick label alignment for value axes. "center" centers every label on its
// tick; "inset" pulls the first/last labels inward so they stay within the
// value axis extent without any overhang clearance.
function getValueAxisTickLabelAlignment(
  i_tick: number,
  nTicks: number,
  mode: "center" | "inset",
  axis: "x" | "y",
): { alignH: AlignH; alignV: AlignV } {
  if (mode === "center" || nTicks <= 1) {
    return axis === "x"
      ? { alignH: "center", alignV: "top" }
      : { alignH: "right", alignV: "middle" };
  }
  if (axis === "x") {
    if (i_tick === 0) {
      return { alignH: "left", alignV: "top" };
    }
    if (i_tick === nTicks - 1) {
      return { alignH: "right", alignV: "top" };
    }
    return { alignH: "center", alignV: "top" };
  }
  if (i_tick === 0) {
    return { alignH: "right", alignV: "bottom" };
  }
  if (i_tick === nTicks - 1) {
    return { alignH: "right", alignV: "top" };
  }
  return { alignH: "right", alignV: "middle" };
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    X-Text Axis Primitive Generation                                       //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateXTextAxisPrimitive(
  rc: RenderContext,
  itemDataDimensions: ChartItemDataDimensions,
  i_pane: number,
  i_lane: number,
  subChartX: number,
  mx: XTextAxisMeasuredInfo,
  indicatorMembers: DimensionMember[],
  axisStyle: MergedXTextAxisStyle,
  gridStyle: MergedGridStyle,
  // Proportional lane layout: this lane's own width (lanes are unequal, so
  // the shared mx.uniformSubChartWidth is wrong for the axis line).
  laneWidthOverride?: number,
): ChartAxisPrimitive {
  const sx = axisStyle;
  const sg = gridStyle;
  const identity = xAxisIdentity(itemDataDimensions, i_pane, i_lane);

  const axisY = mx.xAxisRcd.y() + sg.axisStrokeWidth / 2;
  const centeredTicks = sx.tickPosition === "center";
  const ticks: ChartAxisPrimitive["ticks"] = [];

  let currentX = centeredTicks
    ? subChartX
    : subChartX + sg.gridLineStrokeWidth / 2;
  const tickY = mx.xAxisRcd.y() + sg.axisStrokeWidth;

  // Generate ticks for each indicator
  for (
    let i_indicator = 0;
    i_indicator < indicatorMembers.length;
    i_indicator++
  ) {
    const tickX = centeredTicks ? currentX + mx.slotExtent / 2 : currentX;

    // Measure tick label
    const mText = rc.mText(
      indicatorMembers[i_indicator].label,
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels ? mx.verticalTickLabelMaxHeight : mx.slotExtent,
      { rotation: sx.verticalTickLabels ? "anticlockwise" : undefined },
    );

    // Calculate label position
    const labelPosition = centeredTicks
      ? new Coordinates([
        currentX + mx.slotExtent / 2,
        tickY + sx.tickLength + sx.tickLabelGap,
      ])
      : new Coordinates([
        currentX + (sg.gridLineStrokeWidth + mx.slotExtent) / 2,
        tickY + sx.tickLabelGap,
      ]);

    const label: TickLabel = {
      mText,
      position: labelPosition,
      alignH: "center",
      alignV: "top",
    };
    ticks.push({
      position: new Coordinates([tickX, tickY]),
      tickLine: {
        start: new Coordinates([tickX, tickY]),
        end: new Coordinates([tickX, tickY + sx.tickLength]),
      },
      label,
      value: indicatorMembers[i_indicator],
      ...tickIdentity(
        identity.coordinates,
        itemCoordinate(
          itemDataDimensions.indicator?.name,
          indicatorMembers[i_indicator],
        ),
        label,
      ),
    });

    currentX += centeredTicks
      ? mx.slotExtent
      : sg.gridLineStrokeWidth + mx.slotExtent;
  }

  // Add final tick if not centered
  if (!centeredTicks) {
    ticks.push({
      position: new Coordinates([currentX, tickY]),
      tickLine: {
        start: new Coordinates([currentX, tickY]),
        end: new Coordinates([currentX, tickY + sx.tickLength]),
      },
      value: "",
    });
  }

  // Axis line
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([subChartX, axisY]),
      new Coordinates([
        subChartX + (laneWidthOverride ?? mx.uniformSubChartWidth),
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
    item: buildItem(identity.coordinates),
    meta: { axisType: "x-text", ...identity.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridLineStrokeWidth,
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
  itemDataDimensions: ChartItemDataDimensions,
  i_pane: number,
  i_lane: number,
  subChartX: number,
  mx: XPeriodAxisMeasuredInfo,
  period: {
    name: string;
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
  const identity = xAxisIdentity(itemDataDimensions, i_pane, i_lane);

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
        identity.coordinates,
        periodCoordinate(period.name, periodId),
        label,
      ),
    };
  };

  // Full-height ticks bound the year-label spans. With boundaryTicksEveryYear
  // every year start gets one and spans are single years (labelled every Nth);
  // otherwise only labelled starts get one and each span covers N years.
  let currentX = mx.periodAxisType === "year-centered"
    ? subChartX
    : subChartX + sg.gridLineStrokeWidth / 2;
  let prevLargeTickX: number | undefined = undefined;
  let prevLargeTickPeriodId: number | undefined = undefined;
  let prevLargeTickIValue = 0;
  const yearSpans: {
    leftX: number;
    rightX: number;
    periodId: number;
    nPoints: number;
  }[] = [];

  // Loop through time points
  for (let i_value = 0; i_value < nTimePoints; i_value++) {
    const time = timeMin + i_value;
    const periodId = getPeriodIdFromTime(time, periodType);
    const isYearStart = mx.periodAxisType !== "year-centered" &&
      (i_value === 0 || isLargePeriod(periodId, periodType, sx.calendar));
    const isLargeTick = isYearStart &&
      (i_value === 0 || mx.boundaryTicksEveryYear ||
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
        yearSpans.push({
          leftX: prevLargeTickX,
          rightX: currentX,
          periodId: prevLargeTickPeriodId,
          nPoints: i_value - prevLargeTickIValue,
        });
      }
      prevLargeTickPeriodId = periodId;
      prevLargeTickX = currentX;
      prevLargeTickIValue = i_value;
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
          if (i_value % mx.yearSkipInterval === 0) {
            const tickX = currentX + mx.slotExtent / 2;
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
          mx.slotExtent,
        );
        const labelPos = new Coordinates([
          currentX + (sg.gridLineStrokeWidth + mx.slotExtent) / 2,
          tickY + sx.periodLabelSmallTopPadding,
        ]);
        labelLastTick({
          mText,
          position: labelPos,
          alignH: "center",
          alignV: "top",
        }, periodId);
      } else {
        // Year-centered: label every Nth
        if (i_value % mx.yearSkipInterval === 0) {
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
            mx.slotExtent * mx.yearSkipInterval,
          );
          const labelPos = new Coordinates([
            currentX + mx.slotExtent / 2,
            tickY + mx.periodAxisSmallTickH + sx.periodLabelSmallTopPadding,
          ]);
          labelLastTick({
            mText,
            position: labelPos,
            alignH: "center",
            alignV: "top",
          }, periodId);
        }
      }
    }

    currentX += mx.periodAxisType === "year-centered"
      ? mx.slotExtent
      : sg.gridLineStrokeWidth + mx.slotExtent;
  }

  if (prevLargeTickX !== undefined && prevLargeTickPeriodId !== undefined) {
    yearSpans.push({
      leftX: prevLargeTickX,
      rightX: currentX,
      periodId: prevLargeTickPeriodId,
      nPoints: nTimePoints - prevLargeTickIValue,
    });
  }

  // Year labels, one per labelled span, starting labelGap right of the span's
  // boundary tick: the tick marks the instant the year begins and the label
  // reads onward from it. Under boundaryTicksEveryYear only every Nth year is
  // labelled; otherwise every span is (its left tick was placed on label
  // parity, except the axis start, which keeps its label as the reader's
  // anchor). One form serves the whole axis: the widest that fits every span
  // able to take at least the shortest form. A span too narrow even for that,
  // a sliver of a partial year at either edge, goes unlabelled rather than
  // dragging the form down.
  const shortestFormW = mx.largeLabelForms[mx.largeLabelForms.length - 1].w;
  const labelInset = sg.gridLineStrokeWidth / 2 + mx.labelGap;
  const labelledYearSpans = yearSpans
    .map((yearSpan) => ({
      ...yearSpan,
      labelX: yearSpan.leftX + labelInset,
      roomW: yearSpan.rightX - sg.gridLineStrokeWidth / 2 - yearSpan.leftX -
        labelInset,
    }))
    .filter((yearSpan) =>
      (!mx.boundaryTicksEveryYear ||
        shouldLabelYear(
          yearSpan.periodId,
          periodType,
          mx.yearSkipInterval,
          sx.calendar,
        )) &&
      labelFitsSpan(shortestFormW, yearSpan.roomW)
    );
  const form = pickLargeLabelForm(
    mx.labelSpan,
    Math.min(...labelledYearSpans.map((yearSpan) => yearSpan.roomW)),
    mx.labelGap,
    mx.largeLabelForms,
  );
  for (const yearSpan of labelledYearSpans) {
    const mText = rc.mText(
      getLargePeriodLabel(yearSpan.periodId, form),
      sx.text.xPeriodAxisTickLabels,
      Number.POSITIVE_INFINITY,
    );
    if (!labelFitsSpan(mText.dims.w(), yearSpan.roomW)) {
      continue;
    }
    const labelPos = new Coordinates([
      yearSpan.labelX,
      mx.xAxisRcd.bottomY() - mText.dims.h(),
    ]);
    const label: TickLabel = {
      mText,
      position: labelPos,
      alignH: "left",
      alignV: "top",
    };
    // Pseudo-tick carrying the label (no tick line). A span of one annual
    // time point names that year; any other span spans several time points
    // and names none.
    ticks.push({
      position: labelPos,
      label,
      value: yearSpan.periodId,
      ...(periodType === "year" && yearSpan.nPoints === 1
        ? tickIdentity(
          identity.coordinates,
          periodCoordinate(period.name, yearSpan.periodId),
          label,
        )
        : {}),
    });
  }

  // Axis line
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([subChartX, axisY]),
      new Coordinates([subChartX + mx.uniformSubChartWidth, axisY]),
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
    item: buildItem(identity.coordinates),
    meta: { axisType: "x-period", ...identity.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridLineStrokeWidth,
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

export function generateYValueAxisPrimitive(
  rc: RenderContext,
  itemDataDimensions: ChartItemDataDimensions,
  i_pane: number,
  i_tier: number,
  yValueAxisWidthInfo: YValueAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartY: number,
  uniformSubChartHeight: number,
  clearance: OverhangClearance,
  axisLabelText: string | undefined,
  sy: MergedYValueAxisStyle,
  sg: MergedGridStyle,
): ChartAxisPrimitive {
  const my = yValueAxisWidthInfo;
  const identity = yAxisIdentity(itemDataDimensions, i_pane, i_tier);
  const axisX = yAxisRcd.rightX() - sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const tickValues = my.yAxisTickValues[i_tier];
  const tickPositions = getValueAxisTickPositions(
    subChartY,
    uniformSubChartHeight,
    tickValues.length,
    clearance,
    "y",
  );

  // This goes down (from top to bottom, which is high values to low values)
  for (let i_tick = tickValues.length - 1; i_tick >= 0; i_tick--) {
    const tickValue = tickValues[i_tick];
    const tickY = tickPositions[i_tick];
    const tickLabel = my.tickLabelFormatter(tickValue);
    const mTickLabel = rc.mText(tickLabel, sy.text.yValueAxisTickLabels, 9999);

    ticks.push({
      position: new Coordinates([axisX, tickY]),
      tickLine: {
        start: new Coordinates([
          yAxisRcd.rightX() - (sg.axisStrokeWidth + sy.tickLength),
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
          (sg.axisStrokeWidth + sy.tickLength + sy.tickLabelGap),
          tickY,
        ]),
        ...getValueAxisTickLabelAlignment(
          i_tick,
          tickValues.length,
          sy.tickLabelAlignment,
          "y",
        ),
      },
      value: tickValue,
    });
  }

  // Axis line (vertical line for y-axis)
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([axisX, subChartY - sg.gridLineStrokeWidth / 2]),
      new Coordinates([
        axisX,
        subChartY + uniformSubChartHeight + sg.gridLineStrokeWidth / 2,
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
      sy.text.yValueAxisLabel,
      Number.POSITIVE_INFINITY,
      { rotation: "anticlockwise" },
    );
    axisLabel = {
      mText: mLabel,
      position: new Coordinates([
        yAxisRcd.x() + my.tierHeaderAndLabelGapWidth,
        subChartY + uniformSubChartHeight / 2,
      ]),
      alignH: "left",
      alignV: "middle",
    };
  }

  return withPaintedBounds({
    type: "chart-axis",
    key: `y-value-axis-${i_pane}-${i_tier}`,
    item: buildItem(identity.coordinates),
    meta: { axisType: "y-value", ...identity.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridLineStrokeWidth,
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

export function generateXValueAxisPrimitive(
  rc: RenderContext,
  itemDataDimensions: ChartItemDataDimensions,
  i_pane: number,
  i_lane: number,
  xValueAxisHeightInfo: XValueAxisHeightInfo,
  xAxisRcd: RectCoordsDims,
  subChartX: number,
  uniformSubChartWidth: number,
  clearance: OverhangClearance,
  axisLabelText: string | undefined,
  sx: MergedXValueAxisStyle,
  sg: MergedGridStyle,
): ChartAxisPrimitive {
  const identity = xAxisIdentity(itemDataDimensions, i_pane, i_lane);
  const axisY = xAxisRcd.y() + sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const tickValues = xValueAxisHeightInfo.xAxisTickValues[i_lane];
  const tickPositions = getValueAxisTickPositions(
    subChartX,
    uniformSubChartWidth,
    tickValues.length,
    clearance,
    "x",
  );

  for (let i_tick = 0; i_tick < tickValues.length; i_tick++) {
    const tickValue = tickValues[i_tick];
    const tickX = tickPositions[i_tick];
    const tickLabel = xValueAxisHeightInfo.tickLabelFormatter(tickValue);
    const mTickLabel = rc.mText(tickLabel, sx.text.xValueAxisTickLabels, 9999);

    ticks.push({
      position: new Coordinates([tickX, axisY]),
      tickLine: {
        start: new Coordinates([
          tickX,
          xAxisRcd.y() + sg.axisStrokeWidth,
        ]),
        end: new Coordinates([
          tickX,
          xAxisRcd.y() + sg.axisStrokeWidth + sx.tickLength,
        ]),
      },
      label: {
        mText: mTickLabel,
        position: new Coordinates([
          tickX,
          xAxisRcd.y() + sg.axisStrokeWidth + sx.tickLength + sx.tickLabelGap,
        ]),
        ...getValueAxisTickLabelAlignment(
          i_tick,
          tickValues.length,
          sx.tickLabelAlignment,
          "x",
        ),
      },
      value: tickValue,
    });
  }

  // Axis line (horizontal at top of xAxisRcd)
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([subChartX - sg.gridLineStrokeWidth / 2, axisY]),
      new Coordinates([
        subChartX + uniformSubChartWidth + sg.gridLineStrokeWidth / 2,
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
      sx.text.xValueAxisLabel,
      Number.POSITIVE_INFINITY,
    );
    axisLabel = {
      mText: mLabel,
      position: new Coordinates([
        subChartX + uniformSubChartWidth / 2,
        xAxisRcd.bottomY() - mLabel.dims.h(),
      ]),
      alignH: "center",
      alignV: "top",
    };
  }

  return withPaintedBounds({
    type: "chart-axis",
    key: `x-value-axis-${i_pane}-${i_lane}`,
    item: buildItem(identity.coordinates),
    meta: { axisType: "x-value", ...identity.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridLineStrokeWidth,
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
  itemDataDimensions: ChartItemDataDimensions,
  i_pane: number,
  i_tier: number,
  yAxisWidthInfo: YTextAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartY: number,
  uniformSubChartHeight: number,
  indicatorMembers: DimensionMember[],
  sy: MergedYTextAxisStyle,
  sg: MergedGridStyle,
): ChartAxisPrimitive {
  const identity = yAxisIdentity(itemDataDimensions, i_pane, i_tier);
  const axisX = yAxisRcd.rightX() - sg.axisStrokeWidth / 2;
  const centeredTicks = sy.tickPosition === "center";
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const nIndicators = indicatorMembers.length;
  const slotExtent = centeredTicks
    ? uniformSubChartHeight / Math.max(1, nIndicators)
    : (uniformSubChartHeight - sg.gridLineStrokeWidth * (nIndicators + 1)) /
      Math.max(1, nIndicators);

  let currentY = centeredTicks
    ? subChartY
    : subChartY + sg.gridLineStrokeWidth / 2;

  const tickX = yAxisRcd.rightX() - sg.axisStrokeWidth;

  for (let i_indicator = 0; i_indicator < nIndicators; i_indicator++) {
    const tickY = centeredTicks ? currentY + slotExtent / 2 : currentY;

    const mText = rc.mText(
      indicatorMembers[i_indicator].label,
      sy.text.yTextAxisTickLabels,
      yAxisWidthInfo.maxTickLabelW,
    );

    const labelPosition = centeredTicks
      ? new Coordinates([
        tickX - sy.tickLength - sy.tickLabelGap,
        currentY + slotExtent / 2,
      ])
      : new Coordinates([
        tickX - sy.tickLength - sy.tickLabelGap,
        currentY + (sg.gridLineStrokeWidth + slotExtent) / 2,
      ]);

    const label: TickLabel = {
      mText,
      position: labelPosition,
      alignH: "right",
      alignV: "middle",
    };
    ticks.push({
      position: new Coordinates([axisX, tickY]),
      tickLine: {
        start: new Coordinates([tickX - sy.tickLength, tickY]),
        end: new Coordinates([tickX, tickY]),
      },
      label,
      value: indicatorMembers[i_indicator],
      ...tickIdentity(
        identity.coordinates,
        itemCoordinate(
          itemDataDimensions.indicator?.name,
          indicatorMembers[i_indicator],
        ),
        label,
      ),
    });

    currentY += centeredTicks
      ? slotExtent
      : slotExtent + sg.gridLineStrokeWidth;
  }

  // Final tick at bottom boundary when sides mode
  if (!centeredTicks) {
    ticks.push({
      position: new Coordinates([axisX, currentY]),
      tickLine: {
        start: new Coordinates([tickX - sy.tickLength, currentY]),
        end: new Coordinates([tickX, currentY]),
      },
      value: "",
    });
  }

  // Axis line (vertical at the right edge of the y axis's rect)
  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([axisX, subChartY - sg.gridLineStrokeWidth / 2]),
      new Coordinates([
        axisX,
        subChartY + uniformSubChartHeight + sg.gridLineStrokeWidth / 2,
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
    item: buildItem(identity.coordinates),
    meta: { axisType: "y-text", ...identity.meta },
    ticks,
    axisLine,
    tickStyle: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.gridLineStrokeWidth,
      lineDash: "solid",
    },
    zIndex: Z_INDEX.AXIS,
  });
}

type TickLabel = NonNullable<ChartAxisPrimitive["ticks"][number]["label"]>;

// An x-axis serves one lane of its pane, and every tier.
function xAxisIdentity(
  itemDataDimensions: ChartItemDataDimensions,
  i_pane: number,
  i_lane: number,
) {
  const paneMember = itemDataDimensions.pane?.members[i_pane];
  const laneMember = itemDataDimensions.lane?.members[i_lane];
  return {
    meta: { i_pane, i_lane, paneMember, laneMember },
    coordinates: [
      itemCoordinate(itemDataDimensions.pane?.name, paneMember),
      itemCoordinate(itemDataDimensions.lane?.name, laneMember),
    ],
  };
}

// A y-axis serves one tier of its pane, and every lane.
function yAxisIdentity(
  itemDataDimensions: ChartItemDataDimensions,
  i_pane: number,
  i_tier: number,
) {
  const paneMember = itemDataDimensions.pane?.members[i_pane];
  const tierMember = itemDataDimensions.tier?.members[i_tier];
  return {
    meta: { i_pane, i_tier, paneMember, tierMember },
    coordinates: [
      itemCoordinate(itemDataDimensions.pane?.name, paneMember),
      itemCoordinate(itemDataDimensions.tier?.name, tierMember),
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
      label.alignH,
      label.alignV,
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
  ].map((l) => labelBoxRcd(l.mText, l.position, l.alignH, l.alignV));
  return { ...axis, bounds: unionRectCoordsDims([...lineRects, ...textRects]) };
}
