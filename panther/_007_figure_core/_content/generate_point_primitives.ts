// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlignH,
  type AlignV,
  Coordinates,
  type DataLabel,
  type Primitive,
  RectCoordsDims,
  type ResolvedPointStyle,
  Z_INDEX,
} from "../deps.ts";
import { chartValueItem } from "../chart_items.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import type {
  ContentGenerationContext,
  ResolvedDataLabel,
  ResolvedValue,
  SubChartContent,
} from "./content_generation_types.ts";

export function generatePointPrimitives(
  mapped: MappedValueCoordinate[][],
  content: SubChartContent,
  ctx: ContentGenerationContext,
): Primitive[] {
  const primitives: Primitive[] = [];
  const { i_pane, i_tier, i_lane, nValues } = ctx.subChart;

  for (let i_value = 0; i_value < nValues; i_value++) {
    for (let i_series = 0; i_series < mapped.length; i_series++) {
      const mappedValue = mapped[i_series][i_value];
      const resolvedValue = content.resolvedValues[i_series][i_value];
      if (mappedValue === undefined || resolvedValue === undefined) {
        continue;
      }

      const pointStyle = resolvedValue.point;
      if (!pointStyle.show) continue;

      const pointBounds = new RectCoordsDims({
        x: mappedValue.coords.x() - pointStyle.radius,
        y: mappedValue.coords.y() - pointStyle.radius,
        w: pointStyle.radius * 2,
        h: pointStyle.radius * 2,
      });

      const label = resolvedValue.label;
      primitives.push({
        type: "chart-data-point",
        key: `point-${i_pane}-${i_tier}-${i_lane}-${i_series}-${i_value}`,
        item: chartValueItem(ctx.itemDataDimensions, resolvedValue.info),
        part: "marker",
        bounds: pointBounds,
        hitBounds: pointBounds,
        zIndex: Z_INDEX.CONTENT_POINT,
        meta: { value: resolvedValue.info },
        annotationGroup: pointStyle.annotationGroup,
        coords: mappedValue.coords,
        style: pointStyle,
        dataLabel: label?.owner === "points"
          ? makePointDataLabel(
            label,
            pointStyle.dataLabelPosition,
            mappedValue.coords,
          )
          : undefined,
      });
    }
  }

  return primitives;
}

export function pointLabelPlace(
  centre: Coordinates,
  side: ResolvedPointStyle["dataLabelPosition"],
  offset: number,
): { position: Coordinates; alignH: AlignH; alignV: AlignV } {
  const cx = centre.x();
  const cy = centre.y();
  switch (side) {
    case "top":
      return {
        position: new Coordinates([cx, cy - offset]),
        alignH: "center",
        alignV: "bottom",
      };
    case "bottom":
      return {
        position: new Coordinates([cx, cy + offset]),
        alignH: "center",
        alignV: "top",
      };
    case "left":
      return {
        position: new Coordinates([cx - offset, cy]),
        alignH: "right",
        alignV: "middle",
      };
    case "right":
      return {
        position: new Coordinates([cx + offset, cy]),
        alignH: "left",
        alignV: "middle",
      };
  }
}

function makePointDataLabel(
  label: ResolvedDataLabel,
  dataLabelPosition: ResolvedValue["point"]["dataLabelPosition"],
  coords: Coordinates,
): DataLabel {
  return {
    mText: label.mText,
    ...pointLabelPlace(coords, dataLabelPosition, label.offset),
    halo: label.halo,
  };
}
