// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { SubChart } from "../sub_charts.ts";
import type { ValueRange } from "../types.ts";
import type { ResolvedDataLabel } from "./content_generation_types.ts";
import {
  type Orientation,
  valueAxisExtentOfRect,
} from "./orientation_helpers.ts";

type MeasuredLabel = {
  label: Pick<ResolvedDataLabel, "anchorValue" | "endExtent"> | undefined;
  valueRange: ValueRange;
};

// Each label is read as a fraction of the value range of the axis its series
// is drawn against, which its info carries.
export function measureDataLabelEndClearance(
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  orientation: Orientation,
): number {
  const valueAxisExtent = valueAxisExtentOfRect(subChart.rcd, orientation);
  if (valueAxisExtent <= 0) {
    return 0;
  }
  const startClearance = subChart.valueClearance.start;
  const labels: MeasuredLabel[] = [
    ...subChart.content.resolvedValues.flat().flatMap((resolvedValue) =>
      resolvedValue === undefined
        ? []
        : [{ label: resolvedValue.label, valueRange: resolvedValue.info }]
    ),
    ...subChart.content.resolvedCascadeArrows.map((arrow) => ({
      label: arrow.label,
      valueRange: arrow.from,
    })),
  ];
  return labels.reduce((needed, { label, valueRange }) => {
    const range = valueRange.valueMax - valueRange.valueMin;
    if (label === undefined || label.endExtent <= 0 || range <= 0) {
      return needed;
    }
    const f = Math.min(1, (label.anchorValue - valueRange.valueMin) / range);
    if (f <= 0) {
      return needed;
    }
    const ce =
      (label.endExtent - (valueAxisExtent - startClearance) * (1 - f)) /
      f;
    return ce > needed ? ce : needed;
  }, 0);
}
