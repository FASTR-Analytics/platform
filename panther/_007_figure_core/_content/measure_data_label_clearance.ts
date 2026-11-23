// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { SubChart } from "../sub_charts.ts";
import {
  type Orientation,
  valueAxisExtentOfRect,
} from "./orientation_helpers.ts";

export function measureDataLabelEndClearance(
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  orientation: Orientation,
): number {
  const { valueMin, valueMax } = subChart.valueRange;
  const range = valueMax - valueMin;
  const valueAxisExtent = valueAxisExtentOfRect(subChart.rcd, orientation);
  if (range <= 0 || valueAxisExtent <= 0) {
    return 0;
  }
  const startClearance = subChart.valueClearance.start;
  const labels = [
    ...subChart.content.resolvedValues.flat().map((resolvedValue) =>
      resolvedValue?.label
    ),
    ...subChart.content.resolvedCascadeArrows.map((arrow) => arrow.label),
  ];
  return labels.reduce((needed, label) => {
    if (label === undefined || label.endExtent <= 0) {
      return needed;
    }
    const f = Math.min(1, (label.anchorValue - valueMin) / range);
    if (f <= 0) {
      return needed;
    }
    const ce =
      (label.endExtent - (valueAxisExtent - startClearance) * (1 - f)) /
      f;
    return ce > needed ? ce : needed;
  }, 0);
}
