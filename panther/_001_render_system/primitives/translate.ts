// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, type RectCoordsDims } from "../deps.ts";
import type {
  ChartCaptionPrimitive,
  ChartLegendPrimitive,
  ScaleLegendGradientPrimitive,
  ScaleLegendSteppedPrimitive,
} from "./types.ts";

export type SurroundsPrimitive =
  | ChartCaptionPrimitive
  | ChartLegendPrimitive
  | ScaleLegendGradientPrimitive
  | ScaleLegendSteppedPrimitive;

export function translatePrimitive(
  p: SurroundsPrimitive,
  dx: number,
  dy: number,
): SurroundsPrimitive {
  const pt = (c: Coordinates) => new Coordinates([c.x() + dx, c.y() + dy]);
  const rect = (r: RectCoordsDims) =>
    r.getAdjusted({ x: r.x() + dx, y: r.y() + dy });
  const noData = <
    N extends { rect: RectCoordsDims; labelPosition: Coordinates },
  >(
    n: N | undefined,
  ): N | undefined =>
    n === undefined
      ? undefined
      : { ...n, rect: rect(n.rect), labelPosition: pt(n.labelPosition) };
  const bounds = rect(p.bounds);
  const annotationBounds = p.annotationBounds && rect(p.annotationBounds);
  switch (p.type) {
    case "chart-caption":
      return { ...p, bounds, annotationBounds, position: pt(p.position) };
    case "chart-legend":
      return {
        ...p,
        bounds,
        annotationBounds,
        items: p.items.map((item) => ({
          ...item,
          labelPosition: pt(item.labelPosition),
          symbol: item.symbol.type === "point"
            ? { ...item.symbol, position: pt(item.symbol.position) }
            : item.symbol.type === "line"
            ? { ...item.symbol, coords: item.symbol.coords.map(pt) }
            : { ...item.symbol, position: rect(item.symbol.position) },
        })),
      };
    case "scale-legend-gradient":
      return {
        ...p,
        bounds,
        annotationBounds,
        barRect: rect(p.barRect),
        ticks: p.ticks.map((t) => ({
          ...t,
          labelPosition: pt(t.labelPosition),
        })),
        noData: noData(p.noData),
      };
    case "scale-legend-stepped":
      return {
        ...p,
        bounds,
        annotationBounds,
        steps: p.steps.map((s) => ({ ...s, rect: rect(s.rect) })),
        labels: p.labels.map((l) => ({ ...l, position: pt(l.position) })),
        noData: noData(p.noData),
      };
  }
}
