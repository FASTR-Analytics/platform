// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, type RectCoordsDims } from "../deps.ts";
import type { ValueRange } from "../types.ts";

export type MappedValueCoordinate =
  | {
    coords: Coordinates;
    val: number;
    barExtent: number;
  }
  | undefined;

export function calculateMappedCoordinates(
  seriesVals: (number | undefined)[][],
  plotAreaRcd: RectCoordsDims,
  categoryIncrement: number,
  isCentered: boolean,
  gridStrokeWidth: number,
  valueRange: ValueRange,
  orientation: "vertical" | "horizontal" = "vertical",
): MappedValueCoordinate[][] {
  const { maxVal, minVal } = valueRange;

  if (orientation === "horizontal") {
    return seriesVals.map((singleSeries) => {
      return singleSeries.map((val, i_val) => {
        if (val === undefined) {
          return undefined;
        }

        const extraForStroke = isCentered ? 0 : gridStrokeWidth;
        const y = plotAreaRcd.y() +
          extraForStroke +
          categoryIncrement / 2 +
          i_val * (extraForStroke + categoryIncrement);

        const barExtent = plotAreaRcd.w() *
          ((val - minVal) / (maxVal - minVal));
        // coords.x() is at the VALUE end of the bar (mirrors coords.y() being
        // the value end in vertical).
        const x = plotAreaRcd.x() + barExtent;

        return { coords: new Coordinates({ x, y }), val, barExtent };
      });
    });
  }

  return seriesVals.map((singleSeries) => {
    return singleSeries.map((val, i_val) => {
      if (val === undefined) {
        return undefined;
      }

      const extraWidthForStrokeIfNeeded = isCentered ? 0 : gridStrokeWidth;
      const x = plotAreaRcd.x() +
        extraWidthForStrokeIfNeeded +
        categoryIncrement / 2 +
        i_val * (extraWidthForStrokeIfNeeded + categoryIncrement);

      const barExtent = plotAreaRcd.h() * ((val - minVal) / (maxVal - minVal));
      const y = plotAreaRcd.y() + (plotAreaRcd.h() - barExtent);

      return { coords: new Coordinates({ x, y }), val, barExtent };
    });
  });
}
