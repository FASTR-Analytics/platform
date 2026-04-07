// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
  type DataLabelOwner,
  type DataLabelOwnershipMap,
} from "./content_generation_types.ts";

export function resolveDataLabelOwnership(
  mapped: MappedValueCoordinate[][],
  ctx: ContentGenerationContext,
): DataLabelOwnershipMap {
  const s = ctx.contentStyle;
  const result: DataLabelOwnershipMap = [];

  for (let i_series = 0; i_series < ctx.nSeries; i_series++) {
    const row: DataLabelOwner[] = [];
    for (let i_val = 0; i_val < ctx.nVals; i_val++) {
      const mappedVal = mapped[i_series][i_val];
      if (mappedVal === undefined) {
        row.push("none");
        continue;
      }

      const seriesInfo = buildSeriesInfo(ctx, i_series, mapped);
      const valueInfo = buildValueInfo(
        seriesInfo,
        mappedVal.val,
        i_val,
        ctx.valueRange.minVal,
        ctx.valueRange.maxVal,
      );

      const pointStyle = s.points.getStyle(valueInfo);
      if (pointStyle.show && pointStyle.dataLabel.show) {
        row.push("points");
        continue;
      }

      const barStyle = s.bars.getStyle(valueInfo);
      if (barStyle.show && barStyle.dataLabel.show) {
        row.push("bars");
        continue;
      }

      const lineStyle = s.lines.getStyle(seriesInfo);
      if (lineStyle.show && lineStyle.dataLabel.show) {
        row.push("lines");
        continue;
      }

      row.push("none");
    }
    result.push(row);
  }

  return result;
}
