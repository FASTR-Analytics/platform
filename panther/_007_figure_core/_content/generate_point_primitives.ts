// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DataLabel,
  type Primitive,
  RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
  type DataLabelOwnershipMap,
} from "./content_generation_types.ts";

export function generatePointPrimitives(
  mapped: MappedValueCoordinate[][],
  labelOwner: DataLabelOwnershipMap,
  ctx: ContentGenerationContext,
): Primitive[] {
  const primitives: Primitive[] = [];
  const s = ctx.contentStyle;

  for (let i_val = 0; i_val < ctx.nVals; i_val++) {
    for (let i_series = 0; i_series < ctx.nSeries; i_series++) {
      const mappedVal = mapped[i_series][i_val];
      if (mappedVal === undefined) continue;

      const seriesInfo = buildSeriesInfo(ctx, i_series, mapped);
      const valueInfo = buildValueInfo(seriesInfo, mappedVal.val, i_val);
      const pointStyle = s.points.getStyle(valueInfo);
      if (!pointStyle.show) continue;

      let dataLabel: DataLabel | undefined;
      if (labelOwner[i_series][i_val] === "points") {
        const labelStr = s.dataLabelFormatter(valueInfo);
        if (labelStr?.trim()) {
          const mText = ctx.rc.mText(labelStr, ctx.dataLabelsTextStyle, 9999);
          const offset = mText.ti.fontSize * 0.3;
          const relPos = pointStyle.dataLabelPosition === "top"
            ? { rx: 0.5, dy: -(pointStyle.radius + offset) }
            : pointStyle.dataLabelPosition === "bottom"
            ? { rx: 0.5, dy: pointStyle.radius + offset }
            : pointStyle.dataLabelPosition === "left"
            ? { dx: -(pointStyle.radius + offset), ry: 0.5 }
            : pointStyle.dataLabelPosition === "right"
            ? { dx: pointStyle.radius + offset, ry: 0.5 }
            : { rx: 0.5, ry: 0.5 };
          dataLabel = {
            text: labelStr,
            mText,
            relativePosition: relPos,
          };
        }
      }

      const pointBounds = new RectCoordsDims({
        x: mappedVal.coords.x() - pointStyle.radius,
        y: mappedVal.coords.y() - pointStyle.radius,
        w: pointStyle.radius * 2,
        h: pointStyle.radius * 2,
      });

      primitives.push({
        type: "chart-data-point",
        key:
          `point-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_val}`,
        bounds: pointBounds,
        zIndex: Z_INDEX.CONTENT_POINT,
        meta: { value: valueInfo },
        coords: mappedVal.coords,
        style: pointStyle,
        dataLabel,
      });

      const ebStyle = s.errorBars.getStyle(valueInfo);
      if (ebStyle.show && ctx.mappedBoundsUb && ctx.mappedBoundsLb) {
        const ubMapped = ctx.mappedBoundsUb[i_series]?.[i_val];
        const lbMapped = ctx.mappedBoundsLb[i_series]?.[i_val];
        if (ubMapped && lbMapped) {
          const capWidth = pointStyle.radius * 2 * ebStyle.capWidthProportion;
          primitives.push({
            type: "chart-error-bar",
            key:
              `errorbar-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_val}`,
            bounds: new RectCoordsDims({
              x: mappedVal.coords.x() - capWidth / 2,
              y: Math.min(ubMapped.coords.y(), lbMapped.coords.y()),
              w: capWidth,
              h: Math.abs(ubMapped.coords.y() - lbMapped.coords.y()),
            }),
            zIndex: Z_INDEX.CONTENT_POINT - 1,
            meta: { value: valueInfo },
            centerX: mappedVal.coords.x(),
            ubY: ubMapped.coords.y(),
            lbY: lbMapped.coords.y(),
            strokeColor: ebStyle.strokeColor,
            strokeWidth: ebStyle.strokeWidth,
            capWidth,
          });
        }
      }
    }
  }

  return primitives;
}
