// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, DataDimension, PointType } from "../deps.ts";
import type { ValueAxisOfSeries } from "../_axes/axis_configs.ts";

export type LegendEntry = {
  // The series id the entry stands for, when it stands for one.
  id?: string;
  label: string;
  color: ColorKeyOrString;
  pointStyle?: PointType | "as-block" | "as-line";
  lineDash?: "solid" | "dashed";
  lineStrokeWidthScaleFactor?: number;
};

export type LegendSwatch = Pick<LegendEntry, "pointStyle" | "lineDash">;

export type LegendSeries = {
  dimension: DataDimension | undefined;
  valueAxisOfSeries?: ValueAxisOfSeries;
  swatches?: LegendSwatch[];
};

export function isArrayOfLegendEntries(
  arr: LegendEntry[] | string[],
): arr is LegendEntry[] {
  if (arr.length === 0) {
    return false;
  }
  return typeof arr[0] === "object";
}
