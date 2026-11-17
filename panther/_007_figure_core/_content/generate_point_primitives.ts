// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type DataLabel,
  type Primitive,
  RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import { chartValueItem } from "../chart_items.ts";
import { buildLabelHalo } from "../label_halo.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildDataLabelTextStyle,
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
  const seriesInfos = Array.from(
    { length: ctx.nSerieses },
    (_, i) => buildSeriesInfo(ctx, i, mapped),
  );

  for (let i_value = 0; i_value < ctx.nValues; i_value++) {
    for (let i_series = 0; i_series < ctx.nSerieses; i_series++) {
      const mappedValue = mapped[i_series][i_value];
      if (mappedValue === undefined) continue;

      const valueInfo = buildValueInfo(
        ctx,
        seriesInfos[i_series],
        mappedValue.value,
        i_value,
      );
      const pointStyle = s.points.getStyle(valueInfo);
      if (!pointStyle.show) continue;

      let dataLabel: DataLabel | undefined;
      if (labelOwner[i_series][i_value] === "points") {
        const dl = pointStyle.dataLabel;
        const labelStr = s.points.textFormatter !== "none"
          ? s.points.textFormatter(valueInfo)
          : String(mappedValue.value);

        const textStyle = buildDataLabelTextStyle(ctx.dataLabelsTextStyle, dl);

        const mText = ctx.rc.mText(labelStr, textStyle, 9999);
        const halo = buildLabelHalo(dl);
        const hasDecoration = halo !== undefined;

        if (labelStr.trim() || hasDecoration) {
          const cx = mappedValue.coords.x();
          const cy = mappedValue.coords.y();
          const off = pointStyle.radius + dl.offset;
          const pos = pointStyle.dataLabelPosition === "top"
            ? new Coordinates([cx, cy - off])
            : pointStyle.dataLabelPosition === "bottom"
            ? new Coordinates([cx, cy + off])
            : pointStyle.dataLabelPosition === "left"
            ? new Coordinates([cx - off, cy])
            : pointStyle.dataLabelPosition === "right"
            ? new Coordinates([cx + off, cy])
            : mappedValue.coords;
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
            halo,
          };
        }
      }

      const pointBounds = new RectCoordsDims({
        x: mappedValue.coords.x() - pointStyle.radius,
        y: mappedValue.coords.y() - pointStyle.radius,
        w: pointStyle.radius * 2,
        h: pointStyle.radius * 2,
      });

      primitives.push({
        type: "chart-data-point",
        key:
          `point-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_series}-${i_value}`,
        item: chartValueItem(ctx.itemDataDimensions, valueInfo),
        part: "marker",
        bounds: pointBounds,
        hitBounds: pointBounds,
        zIndex: Z_INDEX.CONTENT_POINT,
        meta: { value: valueInfo },
        annotationGroup: pointStyle.annotationGroup,
        coords: mappedValue.coords,
        style: pointStyle,
        dataLabel,
      });
    }
  }

  return primitives;
}
