// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, PointType } from "../deps.ts";

export type LegendItem = {
  // The series id the entry stands for, when it stands for one.
  id?: string;
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
