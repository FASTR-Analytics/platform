// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
  type DataLabelOwner,
  type DataLabelOwnershipMap,
} from "./content_generation_types.ts";

export function resolveDataLabelOwnership(
  seriesValues: (number | undefined)[][],
  ctx: ContentGenerationContext,
): DataLabelOwnershipMap {
  const s = ctx.contentStyle;
  const result: DataLabelOwnershipMap = [];

  for (let i_series = 0; i_series < ctx.nSerieses; i_series++) {
    const row: DataLabelOwner[] = [];
    const seriesInfo = buildSeriesInfo(ctx, i_series, seriesValues);
    for (let i_value = 0; i_value < ctx.nValues; i_value++) {
      const value = seriesValues[i_series][i_value];
      if (value === undefined) {
        row.push("none");
        continue;
      }

      const valueInfo = buildValueInfo(ctx, seriesInfo, value, i_value);

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
