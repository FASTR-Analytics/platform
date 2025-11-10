// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, PointType } from "../deps.ts";

export type LegendItem = {
  label: string;
  color: ColorKeyOrString;
  pointStyle?: PointType | "as-block" | "as-line";
  lineDash?: "solid" | "dashed";
  lineStrokeWidthScaleFactor?: number;
};

export function isArrayOfLegendItems(
  arr: LegendItem[] | string[],
): arr is LegendItem[] {
  if (arr.length === 0) {
    return false;
  }
  return typeof arr[0] === "object";
}
