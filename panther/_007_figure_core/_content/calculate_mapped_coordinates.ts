// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, type RectCoordsDims } from "../deps.ts";
import type { YScaleAxisWidthInfo } from "../types.ts";

export type MappedValueCoordinate = {
  coords: Coordinates;
  val: number;
  barHeight: number;
} | undefined;

export function calculateMappedCoordinates(
  seriesVals: (number | undefined)[][],
  plotAreaRcd: RectCoordsDims,
  incrementWidth: number,
  isCentered: boolean,
  gridStrokeWidth: number,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  i_tier: number,
): MappedValueCoordinate[][] {
  const maxYVal = yScaleAxisWidthInfo.yAxisTickValues[i_tier]?.at(-1) ?? 1;
  const minYVal = yScaleAxisWidthInfo.yAxisTickValues[i_tier]?.at(0) ?? 0;

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

      const barHeight = plotAreaRcd.h() *
        ((val - minYVal) / (maxYVal - minYVal));
      const y = plotAreaRcd.y() + (plotAreaRcd.h() - barHeight);

      return { coords: new Coordinates({ x, y }), val, barHeight };
    });
  });
}
