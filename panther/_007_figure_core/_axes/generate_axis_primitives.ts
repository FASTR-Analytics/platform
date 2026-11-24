// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  ChartAxisPrimitive,
  ChartValueAxis,
  ItemCoordinate,
  LineStyle,
  MergedGridStyle,
  NestedIdentity,
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
import type { SubChart } from "../sub_charts.ts";
import type { OverhangClearance } from "../types.ts";
import type { MeasuredXAxis } from "./measure_x_axis.ts";
import type { MeasuredYAxis } from "./measure_y_axis.ts";
import { getValueAxisTickPositions } from "./value_axis_tick_positions.ts";
import { yValueAxisLabelRotation } from "./y_value/measure.ts";
import {
  getLargePeriodLabel,
  getSmallPeriodLabelIfAny,
  isLargePeriod,
  labelFitsSpan,
  pickLargeLabelForm,
  shouldLabelYear,
} from "./x_period/helpers.ts";

// The side of the sub-charts a value axis stands on: its tick labels stand
// beyond its axis line on that side, aligned toward the line.
type ValueAxisPlacement = "left" | "right" | "bottom" | "top";

// Tick label alignment for value axes. "center" centers every label on its
// tick; "inset" pulls the first/last labels inward so they stay within the
// value axis extent without any overhang clearance.
function getValueAxisTickLabelAlignment(
  i_tick: number,
  nTicks: number,
  mode: "center" | "inset",
  placement: ValueAxisPlacement,
): { alignH: AlignH; alignV: AlignV } {
  if (placement === "bottom" || placement === "top") {
    const alignV = placement === "bottom" ? "top" : "bottom";
    if (mode === "center" || nTicks <= 1) {
      return { alignH: "center", alignV };
    }
    if (i_tick === 0) {
      return { alignH: "left", alignV };
    }
    if (i_tick === nTicks - 1) {
      return { alignH: "right", alignV };
    }
    return { alignH: "center", alignV };
  }
  const alignH = placement === "left" ? "right" : "left";
  if (mode === "center" || nTicks <= 1) {
    return { alignH, alignV: "middle" };
  }
  if (i_tick === 0) {
    return { alignH, alignV: "bottom" };
  }
  if (i_tick === nTicks - 1) {
    return { alignH, alignV: "top" };
  }
  return { alignH, alignV: "middle" };
}

export function generateXTextAxisPrimitive(
  rc: RenderContext,
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  xAxis: Extract<MeasuredXAxis, { type: "text" }>,
  gridStyle: MergedGridStyle,
  itemDataDimensions: ChartItemDataDimensions,
): ChartAxisPrimitive {
  const mx = xAxis.info;
  const sx = xAxis.config.axisStyle;
  const sg = gridStyle;
  const { rcd, slotExtent, isCentered } = subChart;
  const identity = xAxisIdentity(
    itemDataDimensions,
    subChart.i_pane,
    subChart.i_lane,
  );

  const axisY = mx.xAxisRcd.y() + sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];

  let currentX = isCentered ? rcd.x() : rcd.x() + sg.gridLineStrokeWidth / 2;
  const tickY = mx.xAxisRcd.y() + sg.axisStrokeWidth;

  for (const i_value of subChart.slotOrder) {
    const indicatorMember = xAxis.config.indicatorMembers[i_value];
    const tickX = isCentered ? currentX + slotExtent / 2 : currentX;

    const mText = rc.mText(
      indicatorMember.label,
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels ? mx.verticalTickLabelMaxHeight : slotExtent,
      { rotation: sx.verticalTickLabels ? "anticlockwise" : undefined },
    );

    const labelPosition = isCentered
      ? new Coordinates([
        currentX + slotExtent / 2,
        tickY + sx.tickLength + sx.tickLabelGap,
      ])
      : new Coordinates([
        currentX + (sg.gridLineStrokeWidth + slotExtent) / 2,
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
      value: indicatorMember,
      ...tickIdentity(
        identity.coordinates,
        itemCoordinate(itemDataDimensions.indicator?.name, indicatorMember),
        label,
      ),
    });

    currentX += isCentered ? slotExtent : sg.gridLineStrokeWidth + slotExtent;
  }

  if (!isCentered) {
    ticks.push({
      position: new Coordinates([currentX, tickY]),
      tickLine: {
        start: new Coordinates([currentX, tickY]),
        end: new Coordinates([currentX, tickY + sx.tickLength]),
      },
      value: "",
    });
  }

  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([rcd.x(), axisY]),
      new Coordinates([rcd.rightX(), axisY]),
    ],
    style: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  return withPaintedBounds({
    type: "chart-axis",
    key: `x-text-axis-${subChart.i_pane}-${subChart.i_lane}`,
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

export function generateXPeriodAxisPrimitive(
  rc: RenderContext,
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  xAxis: Extract<MeasuredXAxis, { type: "period" }>,
  gridStyle: MergedGridStyle,
  itemDataDimensions: ChartItemDataDimensions,
): ChartAxisPrimitive {
  const mx = xAxis.info;
  const sx = xAxis.config.axisStyle;
  const sg = gridStyle;
  const { periodType, timeMin, nTimePoints } = xAxis.config;
  const { rcd, slotExtent } = subChart;
  const identity = xAxisIdentity(
    itemDataDimensions,
    subChart.i_pane,
    subChart.i_lane,
  );

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
        periodCoordinate(xAxis.config.dimension, periodId),
        label,
      ),
    };
  };

  // Full-height ticks bound the year-label spans. With boundaryTicksEveryYear
  // every year start gets one and spans are single years (labelled every Nth);
  // otherwise only labelled starts get one and each span covers N years.
  let currentX = mx.periodAxisType === "year-centered"
    ? rcd.x()
    : rcd.x() + sg.gridLineStrokeWidth / 2;
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
            const tickX = currentX + slotExtent / 2;
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
          slotExtent,
        );
        const labelPos = new Coordinates([
          currentX + (sg.gridLineStrokeWidth + slotExtent) / 2,
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
            slotExtent * mx.yearSkipInterval,
          );
          const labelPos = new Coordinates([
            currentX + slotExtent / 2,
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
      ? slotExtent
      : sg.gridLineStrokeWidth + slotExtent;
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
          periodCoordinate(xAxis.config.dimension, yearSpan.periodId),
          label,
        )
        : {}),
    });
  }

  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([rcd.x(), axisY]),
      new Coordinates([rcd.rightX(), axisY]),
    ],
    style: {
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  return withPaintedBounds({
    type: "chart-axis",
    key: `x-period-axis-${subChart.i_pane}-${subChart.i_lane}`,
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

// The first y value axis stands left of the sub-charts and the second right
// of them, each the other's mirror: its axis line on the edge of its rect
// toward the sub-charts, its ticks and tick labels outward from it.
export function generateYValueAxisPrimitive(
  rc: RenderContext,
  subChart: Pick<SubChart, "rcd" | "i_pane" | "i_tier">,
  clearance: OverhangClearance,
  yAxis: Extract<MeasuredYAxis, { type: "value" }>,
  yAxisRcd: RectCoordsDims,
  valueAxis: ChartValueAxis,
  gridStyle: MergedGridStyle,
  itemDataDimensions: ChartItemDataDimensions,
): ChartAxisPrimitive {
  const my = yAxis.info;
  const sy = yAxis.config.axisStyle;
  const sg = gridStyle;
  const { rcd } = subChart;
  const identity = yAxisIdentity(
    itemDataDimensions,
    subChart.i_pane,
    subChart.i_tier,
  );
  const [axisEdgeX, outward] = valueAxis === "first"
    ? [yAxisRcd.rightX(), -1]
    : [yAxisRcd.x(), 1];
  const axisX = axisEdgeX + outward * (sg.axisStrokeWidth / 2);
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const tickValues = my.yAxisTickValues[subChart.i_tier];
  const tickPositions = getValueAxisTickPositions(
    rcd.y(),
    rcd.h(),
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
          axisEdgeX + outward * (sg.axisStrokeWidth + sy.tickLength),
          tickY,
        ]),
        end: new Coordinates([
          axisEdgeX + outward * sg.axisStrokeWidth,
          tickY,
        ]),
      },
      label: {
        mText: mTickLabel,
        position: new Coordinates([
          axisEdgeX +
          outward * (sg.axisStrokeWidth + sy.tickLength + sy.tickLabelGap),
          tickY,
        ]),
        ...getValueAxisTickLabelAlignment(
          i_tick,
          tickValues.length,
          sy.tickLabelAlignment,
          valueAxis === "first" ? "left" : "right",
        ),
      },
      value: tickValue,
    });
  }

  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([axisX, rcd.y() - sg.gridLineStrokeWidth / 2]),
      new Coordinates([axisX, rcd.bottomY() + sg.gridLineStrokeWidth / 2]),
    ],
    style: {
      show: true,
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  let axisLabel: ChartAxisPrimitive["axisLabel"];
  if (yAxis.config.axisLabel) {
    const mLabel = rc.mText(
      yAxis.config.axisLabel,
      sy.text.yValueAxisLabel,
      Number.POSITIVE_INFINITY,
      { rotation: yValueAxisLabelRotation(valueAxis) },
    );
    axisLabel = valueAxis === "first"
      ? {
        mText: mLabel,
        position: new Coordinates([
          yAxisRcd.x() + my.tierHeaderAndLabelGapWidth,
          rcd.centerY(),
        ]),
        alignH: "left",
        alignV: "middle",
      }
      : {
        mText: mLabel,
        position: new Coordinates([yAxisRcd.rightX(), rcd.centerY()]),
        alignH: "right",
        alignV: "middle",
      };
  }

  return withPaintedBounds({
    type: "chart-axis",
    key: `${
      valueAxis === "first" ? "" : "second-"
    }y-value-axis-${subChart.i_pane}-${subChart.i_tier}`,
    item: buildItem(identity.coordinates),
    meta: { axisType: "y-value", valueAxis, ...identity.meta },
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

// The first x value axis stands below the sub-charts and the second above
// them, each the other's mirror: its axis line on the edge of its rect toward
// the sub-charts, its ticks and tick labels outward from it.
export function generateXValueAxisPrimitive(
  rc: RenderContext,
  subChart: Pick<SubChart, "rcd" | "i_pane" | "i_lane">,
  clearance: OverhangClearance,
  xAxis: Extract<MeasuredXAxis, { type: "value" }>,
  valueAxis: ChartValueAxis,
  gridStyle: MergedGridStyle,
  itemDataDimensions: ChartItemDataDimensions,
): ChartAxisPrimitive {
  const { xAxisRcd, xValueAxisHeightInfo } = xAxis.info;
  const sx = xAxis.config.axisStyle;
  const sg = gridStyle;
  const { rcd } = subChart;
  const identity = xAxisIdentity(
    itemDataDimensions,
    subChart.i_pane,
    subChart.i_lane,
  );
  const [axisEdgeY, outward] = valueAxis === "first"
    ? [xAxisRcd.y(), 1]
    : [xAxisRcd.bottomY(), -1];
  const axisY = axisEdgeY + outward * (sg.axisStrokeWidth / 2);
  const ticks: ChartAxisPrimitive["ticks"] = [];

  const tickValues = xValueAxisHeightInfo.xAxisTickValues[subChart.i_lane];
  const tickPositions = getValueAxisTickPositions(
    rcd.x(),
    rcd.w(),
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
          axisEdgeY + outward * sg.axisStrokeWidth,
        ]),
        end: new Coordinates([
          tickX,
          axisEdgeY + outward * sg.axisStrokeWidth + outward * sx.tickLength,
        ]),
      },
      label: {
        mText: mTickLabel,
        position: new Coordinates([
          tickX,
          axisEdgeY + outward * sg.axisStrokeWidth + outward * sx.tickLength +
          outward * sx.tickLabelGap,
        ]),
        ...getValueAxisTickLabelAlignment(
          i_tick,
          tickValues.length,
          sx.tickLabelAlignment,
          valueAxis === "first" ? "bottom" : "top",
        ),
      },
      value: tickValue,
    });
  }

  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([rcd.x() - sg.gridLineStrokeWidth / 2, axisY]),
      new Coordinates([rcd.rightX() + sg.gridLineStrokeWidth / 2, axisY]),
    ],
    style: {
      show: true,
      strokeColor: sg.axisColor,
      strokeWidth: sg.axisStrokeWidth,
      lineDash: "solid",
    },
  };

  let axisLabel: ChartAxisPrimitive["axisLabel"];
  if (xAxis.config.axisLabel) {
    const mLabel = rc.mText(
      xAxis.config.axisLabel,
      sx.text.xValueAxisLabel,
      Number.POSITIVE_INFINITY,
    );
    axisLabel = {
      mText: mLabel,
      position: new Coordinates([
        rcd.centerX(),
        valueAxis === "first"
          ? xAxisRcd.bottomY() - mLabel.dims.h()
          : xAxisRcd.y(),
      ]),
      alignH: "center",
      alignV: "top",
    };
  }

  return withPaintedBounds({
    type: "chart-axis",
    key: `${
      valueAxis === "first" ? "" : "second-"
    }x-value-axis-${subChart.i_pane}-${subChart.i_lane}`,
    item: buildItem(identity.coordinates),
    meta: { axisType: "x-value", valueAxis, ...identity.meta },
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

export function generateYTextAxisPrimitive(
  rc: RenderContext,
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  yAxis: Extract<MeasuredYAxis, { type: "text" }>,
  yAxisRcd: RectCoordsDims,
  gridStyle: MergedGridStyle,
  itemDataDimensions: ChartItemDataDimensions,
): ChartAxisPrimitive {
  const sy = yAxis.config.axisStyle;
  const sg = gridStyle;
  const { rcd, slotExtent, isCentered } = subChart;
  const identity = yAxisIdentity(
    itemDataDimensions,
    subChart.i_pane,
    subChart.i_tier,
  );
  const axisX = yAxisRcd.rightX() - sg.axisStrokeWidth / 2;
  const ticks: ChartAxisPrimitive["ticks"] = [];

  let currentY = isCentered ? rcd.y() : rcd.y() + sg.gridLineStrokeWidth / 2;

  const tickX = yAxisRcd.rightX() - sg.axisStrokeWidth;

  for (const i_value of subChart.slotOrder) {
    const indicatorMember = yAxis.config.indicatorMembers[i_value];
    const tickY = isCentered ? currentY + slotExtent / 2 : currentY;

    const mText = rc.mText(
      indicatorMember.label,
      sy.text.yTextAxisTickLabels,
      yAxis.info.maxTickLabelW,
    );

    const labelPosition = isCentered
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
      value: indicatorMember,
      ...tickIdentity(
        identity.coordinates,
        itemCoordinate(itemDataDimensions.indicator?.name, indicatorMember),
        label,
      ),
    });

    currentY += isCentered ? slotExtent : slotExtent + sg.gridLineStrokeWidth;
  }

  if (!isCentered) {
    ticks.push({
      position: new Coordinates([axisX, currentY]),
      tickLine: {
        start: new Coordinates([tickX - sy.tickLength, currentY]),
        end: new Coordinates([tickX, currentY]),
      },
      value: "",
    });
  }

  const axisLine: { coords: Coordinates[]; style: LineStyle } = {
    coords: [
      new Coordinates([axisX, rcd.y() - sg.gridLineStrokeWidth / 2]),
      new Coordinates([axisX, rcd.bottomY() + sg.gridLineStrokeWidth / 2]),
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
    key: `y-text-axis-${subChart.i_pane}-${subChart.i_tier}`,
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
