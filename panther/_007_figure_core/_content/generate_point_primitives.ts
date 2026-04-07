// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type DataLabel,
  getAdjustedFont,
  getColor,
  type Primitive,
  RectCoordsDims,
  type TextInfoUnkeyed,
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
      const valueInfo = buildValueInfo(
        seriesInfo,
        mappedVal.val,
        i_val,
        ctx.valueRange.minVal,
        ctx.valueRange.maxVal,
      );
      const pointStyle = s.points.getStyle(valueInfo);
      if (!pointStyle.show) continue;

      let dataLabel: DataLabel | undefined;
      if (labelOwner[i_series][i_val] === "points") {
        const dl = pointStyle.dataLabel;
        const labelStr = s.points.textFormatter !== "none"
          ? s.points.textFormatter(valueInfo)
          : String(mappedVal.val);

        const textStyle: TextInfoUnkeyed = {
          ...ctx.dataLabelsTextStyle,
          ...(dl.color !== undefined ? { color: getColor(dl.color) } : {}),
          ...(dl.relFontSize !== undefined
            ? { fontSize: ctx.dataLabelsTextStyle.fontSize * dl.relFontSize }
            : {}),
          ...(dl.font !== undefined
            ? { font: getAdjustedFont(ctx.dataLabelsTextStyle.font, dl.font) }
            : {}),
        };

        const mText = ctx.rc.mText(labelStr, textStyle, 9999);
        const hasDecoration = dl.backgroundColor !== "none" ||
          dl.border !== "none";

        if (labelStr.trim() || hasDecoration) {
          const cx = mappedVal.coords.x();
          const cy = mappedVal.coords.y();
          const off = pointStyle.radius + dl.offset;
          const pos = pointStyle.dataLabelPosition === "top"
            ? new Coordinates([cx, cy - off])
            : pointStyle.dataLabelPosition === "bottom"
            ? new Coordinates([cx, cy + off])
            : pointStyle.dataLabelPosition === "left"
            ? new Coordinates([cx - off, cy])
            : pointStyle.dataLabelPosition === "right"
            ? new Coordinates([cx + off, cy])
            : mappedVal.coords;
          const alignH = pointStyle.dataLabelPosition === "left"
            ? "right" as const
            : pointStyle.dataLabelPosition === "right"
            ? "left" as const
            : "center" as const;
          const alignV = pointStyle.dataLabelPosition === "top"
            ? "bottom" as const
            : pointStyle.dataLabelPosition === "bottom"
            ? "top" as const
            : "middle" as const;
          dataLabel = {
            mText,
            position: pos,
            alignH,
            alignV,
            style: hasDecoration
              ? {
                backgroundColor: dl.backgroundColor !== "none"
                  ? getColor(dl.backgroundColor)
                  : undefined,
                padding: dl.padding,
                border: dl.border !== "none"
                  ? {
                    color: getColor(dl.border.color),
                    width: dl.border.width,
                  }
                  : undefined,
                rectRadius: dl.rectRadius,
              }
              : undefined,
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
        annotationGroup: pointStyle.annotationGroup,
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
