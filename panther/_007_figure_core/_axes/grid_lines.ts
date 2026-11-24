// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { SubChart } from "../sub_charts.ts";
import type { MeasuredXAxis } from "./measure_x_axis.ts";
import type { MeasuredYAxis } from "./measure_y_axis.ts";
import { calculateVerticalGridLinesForLaneXPeriod } from "./x_period/grid_lines.ts";
import { calculateVerticalGridLinesForLaneXValue } from "./x_value/grid_lines.ts";
import { calculateHorizontalGridLinesForTier as calculateHorizontalGridLinesForTierYValue } from "./y_value/grid_lines.ts";

export function calculateValueAndValueGridLines(
  subChart: Extract<SubChart, { kind: "value-and-value" }>,
  xAxis: Extract<MeasuredXAxis, { type: "value" }>,
  yAxis: Extract<MeasuredYAxis, { type: "value" }>,
): {
  horizontalLines: { y: number; tickValue: number }[];
  verticalLines: { x: number; tickValue: number }[];
} {
  return {
    horizontalLines: calculateHorizontalGridLinesForTierYValue(
      subChart.i_tier,
      yAxis.info,
      subChart.rcd.y(),
      subChart.rcd.h(),
      subChart.yValueClearance,
    ),
    verticalLines: calculateVerticalGridLinesForLaneXValue(
      subChart.i_lane,
      xAxis.info.xValueAxisHeightInfo,
      subChart.rcd.x(),
      subChart.rcd.w(),
      subChart.xValueClearance,
    ),
  };
}

export function calculateXAxisGridLines(
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  xAxis: MeasuredXAxis,
  gridLineStrokeWidth: number,
): { x: number; tickValue?: number }[] {
  switch (xAxis.type) {
    case "text":
      return categoryGridLines(
        subChart.rcd.x(),
        subChart.rcd.w(),
        subChart.nSlots,
        subChart.slotExtent,
        subChart.isCentered,
        gridLineStrokeWidth,
      ).map((x) => ({ x }));
    case "period":
      return calculateVerticalGridLinesForLaneXPeriod(
        subChart.rcd,
        xAxis.info,
        xAxis.config.periodType,
        xAxis.config.timeMin,
        xAxis.config.nTimePoints,
        gridLineStrokeWidth,
        xAxis.config.axisStyle.showEveryNthTick,
        xAxis.config.axisStyle.calendar,
      );
    case "value":
      return calculateVerticalGridLinesForLaneXValue(
        subChart.i_lane,
        xAxis.info.xValueAxisHeightInfo,
        subChart.rcd.x(),
        subChart.rcd.w(),
        subChart.valueClearance,
      );
  }
}

export function calculateYAxisGridLines(
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  yAxis: MeasuredYAxis,
  gridLineStrokeWidth: number,
): { y: number; tickValue?: number }[] {
  switch (yAxis.type) {
    case "value":
      return calculateHorizontalGridLinesForTierYValue(
        subChart.i_tier,
        yAxis.info,
        subChart.rcd.y(),
        subChart.rcd.h(),
        subChart.valueClearance,
      );
    case "text":
      return categoryGridLines(
        subChart.rcd.y(),
        subChart.rcd.h(),
        subChart.nSlots,
        subChart.slotExtent,
        subChart.isCentered,
        gridLineStrokeWidth,
      ).map((y) => ({ y }));
  }
}

function categoryGridLines(
  origin: number,
  extent: number,
  nSlots: number,
  slotExtent: number,
  centered: boolean,
  gsw: number,
): number[] {
  const lines: number[] = [];
  let current = centered ? origin : origin + gsw / 2;
  for (let ordinal = 0; ordinal < nSlots; ordinal++) {
    lines.push(centered ? current + slotExtent / 2 : current);
    current += centered ? slotExtent : slotExtent + gsw;
  }
  if (!centered) {
    lines.push(origin + extent - gsw / 2);
  }
  return lines;
}
