// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartErrorBarPrimitive,
  type ChartValueInfo,
  type Primitive,
  Z_INDEX,
} from "../deps.ts";
import type { ContentGenerationContext } from "./content_generation_types.ts";
import {
  catCenterOfRect,
  catCoord,
  catExtentOfRect,
  makeErrorBarPrimitive,
  valCoord,
} from "./orientation_helpers.ts";

type Anchor = {
  value: ChartValueInfo;
  categoryCenter: number;
  markExtent: number;
  zIndex: number;
};

// One error bar per cell, anchored on the bar when one is drawn (cap sized
// from the bar thickness), else on the point (cap sized from its diameter).
// Bars and points share the value coordinate, so the anchor only decides the
// cap and the z-order.
export function generateErrorBarPrimitives(
  marks: Primitive[],
  ctx: ContentGenerationContext,
): ChartErrorBarPrimitive[] {
  const ub = ctx.mappedBoundsUb;
  const lb = ctx.mappedBoundsLb;
  if (!ub || !lb) {
    return [];
  }
  const orientation = ctx.orientation;
  const anchors = new Map<string, Anchor>();
  const cellKey = (v: ChartValueInfo) => `${v.i_series}-${v.i_val}`;
  for (const p of marks) {
    if (p.type === "chart-bar") {
      anchors.set(cellKey(p.meta.value), {
        value: p.meta.value,
        categoryCenter: catCenterOfRect(p.bounds, orientation),
        markExtent: catExtentOfRect(p.bounds, orientation),
        zIndex: Z_INDEX.CONTENT_BAR + 1,
      });
    } else if (
      p.type === "chart-data-point" && !anchors.has(cellKey(p.meta.value))
    ) {
      anchors.set(cellKey(p.meta.value), {
        value: p.meta.value,
        categoryCenter: catCoord(p.coords, orientation),
        markExtent: p.style.radius * 2,
        zIndex: Z_INDEX.CONTENT_POINT - 1,
      });
    }
  }

  const primitives: ChartErrorBarPrimitive[] = [];
  for (const a of anchors.values()) {
    const ebStyle = ctx.contentStyle.errorBars.getStyle(a.value);
    if (!ebStyle.show) {
      continue;
    }
    const ubMapped = ub[a.value.i_series]?.[a.value.i_val];
    const lbMapped = lb[a.value.i_series]?.[a.value.i_val];
    if (!ubMapped || !lbMapped) {
      continue;
    }
    primitives.push(makeErrorBarPrimitive({
      key:
        `errorbar-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${a.value.i_series}-${a.value.i_val}`,
      meta: { value: a.value },
      categoryCenter: a.categoryCenter,
      valUb: valCoord(ubMapped.coords, orientation),
      valLb: valCoord(lbMapped.coords, orientation),
      capExtent: a.markExtent * ebStyle.capWidthProportion,
      strokeColor: ebStyle.strokeColor,
      strokeWidth: ebStyle.strokeWidth,
      zIndex: a.zIndex,
      orientation,
    }));
  }
  return primitives;
}
