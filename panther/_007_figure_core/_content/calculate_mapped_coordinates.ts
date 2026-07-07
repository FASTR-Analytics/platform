// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, type RectCoordsDims } from "../deps.ts";
import type { OverhangClearance, ValueRange } from "../types.ts";

export type MappedValueCoordinate =
  | {
    coords: Coordinates;
    val: number;
    barExtent: number;
  }
  | undefined;

// positionOrdinals (unbalanced indicator membership): maps a value's dense
// storage index to its position ordinal within the pane's visible subset.
// Storage index stays global for every data lookup; only the position along
// the category axis uses the ordinal. Omitted (balanced) = identity. A
// defined value whose storage index has no ordinal is masked and renders
// nothing (by construction visibility covers every defined value/bound, so
// this only guards inconsistent hand-built masks).
export function calculateMappedCoordinates(
  seriesVals: (number | undefined)[][],
  plotAreaRcd: RectCoordsDims,
  categoryIncrement: number,
  isCentered: boolean,
  gridStrokeWidth: number,
  valueRange: ValueRange,
  valueClearance: OverhangClearance,
  orientation: "vertical" | "horizontal" = "vertical",
  positionOrdinals?: (number | undefined)[],
): MappedValueCoordinate[][] {
  const { maxVal, minVal } = valueRange;

  if (orientation === "horizontal") {
    const effectiveW = plotAreaRcd.w() - valueClearance.start -
      valueClearance.end;
    return seriesVals.map((singleSeries) => {
      return singleSeries.map((val, i_val) => {
        if (val === undefined) {
          return undefined;
        }

        const i_pos = positionOrdinals ? positionOrdinals[i_val] : i_val;
        if (i_pos === undefined) {
          return undefined;
        }

        const extraForStroke = isCentered ? 0 : gridStrokeWidth;
        const y = plotAreaRcd.y() +
          extraForStroke +
          categoryIncrement / 2 +
          i_pos * (extraForStroke + categoryIncrement);

        const barExtent = effectiveW *
          ((val - minVal) / (maxVal - minVal));
        // coords.x() is at the VALUE end of the bar (mirrors coords.y() being
        // the value end in vertical).
        const x = plotAreaRcd.x() + valueClearance.start + barExtent;

        return { coords: new Coordinates({ x, y }), val, barExtent };
      });
    });
  }

  const effectiveH = plotAreaRcd.h() - valueClearance.start -
    valueClearance.end;
  return seriesVals.map((singleSeries) => {
    return singleSeries.map((val, i_val) => {
      if (val === undefined) {
        return undefined;
      }

      const i_pos = positionOrdinals ? positionOrdinals[i_val] : i_val;
      if (i_pos === undefined) {
        return undefined;
      }

      const extraWidthForStrokeIfNeeded = isCentered ? 0 : gridStrokeWidth;
      const x = plotAreaRcd.x() +
        extraWidthForStrokeIfNeeded +
        categoryIncrement / 2 +
        i_pos * (extraWidthForStrokeIfNeeded + categoryIncrement);

      const barExtent = effectiveH * ((val - minVal) / (maxVal - minVal));
      const y = plotAreaRcd.y() + valueClearance.end + (effectiveH - barExtent);

      return { coords: new Coordinates({ x, y }), val, barExtent };
    });
  });
}
