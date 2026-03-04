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
  incrementWidth: number,
  isCentered: boolean,
  gridStrokeWidth: number,
  valueRange: ValueRange,
  orientation: "vertical" | "horizontal" = "vertical",
): MappedValueCoordinate[][] {
  if (orientation === "horizontal") {
    throw new Error("Horizontal coordinate mapping not implemented yet");
  }
  const { maxVal, minVal } = valueRange;

  return seriesVals.map((singleSeries) => {
    return singleSeries.map((val, i_val) => {
      if (val === undefined) {
        return undefined;
      }

      const extraWidthForStrokeIfNeeded = isCentered ? 0 : gridStrokeWidth;
      const x = plotAreaRcd.x() +
        extraWidthForStrokeIfNeeded +
        incrementWidth / 2 +
        i_val * (extraWidthForStrokeIfNeeded + incrementWidth);

      const barExtent = plotAreaRcd.h() * ((val - minVal) / (maxVal - minVal));
      const y = plotAreaRcd.y() + (plotAreaRcd.h() - barExtent);

      return { coords: new Coordinates({ x, y }), val, barExtent };
    });
  });
}
