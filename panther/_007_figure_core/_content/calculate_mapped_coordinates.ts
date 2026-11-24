// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assertNotUndefined,
  type ChartValueAxis,
  Coordinates,
  type RectCoordsDims,
} from "../deps.ts";
import type { SubChart } from "../sub_charts.ts";
import type { OverhangClearance, ValueRange } from "../types.ts";
import type { Orientation } from "./orientation_helpers.ts";

export type MappedValueCoordinate =
  | {
    coords: Coordinates;
    value: number;
  }
  | undefined;

export type ValueAxisMapping = {
  subChartRcd: RectCoordsDims;
  valueRange: ValueRange;
  valueClearance: OverhangClearance;
  orientation: Orientation;
};

export function valueRangeOfAxis(
  subChart: Pick<
    Extract<SubChart, { kind: "category-and-value" }>,
    "valueRange" | "secondValueRange"
  >,
  valueAxis: ChartValueAxis,
): ValueRange {
  if (valueAxis === "first") {
    return subChart.valueRange;
  }
  assertNotUndefined(
    subChart.secondValueRange,
    "A series is drawn against a second value axis the sub-chart does not have",
  );
  return subChart.secondValueRange;
}

function effectiveValueAxisExtent(m: ValueAxisMapping): number {
  const extent = m.orientation === "horizontal"
    ? m.subChartRcd.w()
    : m.subChartRcd.h();
  return extent - m.valueClearance.start - m.valueClearance.end;
}

export function valueAxisCoord(value: number, m: ValueAxisMapping): number {
  const { valueMin, valueMax } = m.valueRange;
  const effective = effectiveValueAxisExtent(m);
  const fromStart = effective * ((value - valueMin) / (valueMax - valueMin));
  return m.orientation === "horizontal"
    ? m.subChartRcd.x() + m.valueClearance.start + fromStart
    : m.subChartRcd.y() + m.valueClearance.end + (effective - fromStart);
}

export function zeroLineValue({ valueMin, valueMax }: ValueRange): number {
  return Math.min(Math.max(0, valueMin), valueMax);
}

// At an axis edge the zero line takes the edge's own coordinate, where the
// edge's tick and grid line stand.
export function zeroLineCoord(m: ValueAxisMapping): number {
  const { subChartRcd: rcd, valueRange, valueClearance: clearance } = m;
  if (valueRange.valueMin >= 0) {
    return m.orientation === "horizontal"
      ? rcd.x() + clearance.start
      : rcd.bottomY() - clearance.start;
  }
  if (valueRange.valueMax <= 0) {
    return m.orientation === "horizontal"
      ? rcd.rightX() - clearance.end
      : rcd.y() + clearance.end;
  }
  return valueAxisCoord(0, m);
}

// positionOrdinals: the inverse of the unit's slotOrder, mapping a value's
// dense storage index to its position ordinal. Storage index stays global for
// every data lookup; only the position along the category axis uses the
// ordinal. A defined value whose storage index has no ordinal is masked and
// renders nothing (by construction visibility covers every defined
// value/bound, so this only guards inconsistent hand-built masks).
export function calculateMappedCoordinates(
  seriesValues: (number | undefined)[][],
  subChart: Omit<Extract<SubChart, { kind: "category-and-value" }>, "content">,
  gridLineStrokeWidth: number,
  orientation: Orientation,
): MappedValueCoordinate[][] {
  const { rcd: subChartRcd, slotExtent, isCentered, positionOrdinals } =
    subChart;
  const extraForStroke = isCentered ? 0 : gridLineStrokeWidth;
  const catStart = orientation === "horizontal"
    ? subChartRcd.y()
    : subChartRcd.x();
  return seriesValues.map((singleSeries, i_series) => {
    const m: ValueAxisMapping = {
      subChartRcd,
      valueRange: valueRangeOfAxis(
        subChart,
        subChart.seriesValueAxes[i_series],
      ),
      valueClearance: subChart.valueClearance,
      orientation,
    };
    return singleSeries.map((value, i_value) => {
      if (value === undefined) {
        return undefined;
      }
      const i_pos = positionOrdinals[i_value];
      if (i_pos === undefined) {
        return undefined;
      }
      const cat = catStart +
        extraForStroke +
        slotExtent / 2 +
        i_pos * (extraForStroke + slotExtent);
      const v = valueAxisCoord(value, m);
      return {
        coords: new Coordinates(
          orientation === "horizontal" ? { x: v, y: cat } : { x: cat, y: v },
        ),
        value,
      };
    });
  });
}
