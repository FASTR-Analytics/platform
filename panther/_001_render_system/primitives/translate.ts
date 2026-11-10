// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, type RectCoordsDims } from "../deps.ts";
import type {
  FigureCaptionPrimitive,
  FigureLegendPrimitive,
  FigureScaleLegendGradientPrimitive,
  FigureScaleLegendSteppedPrimitive,
} from "./types.ts";

export type SurroundsPrimitive =
  | FigureCaptionPrimitive
  | FigureLegendPrimitive
  | FigureScaleLegendGradientPrimitive
  | FigureScaleLegendSteppedPrimitive;

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
    case "figure-caption":
      return {
        ...p,
        bounds,
        annotationBounds,
        anchorRcd: rect(p.anchorRcd),
        hitBounds: rect(p.hitBounds),
      };
    case "figure-legend":
      return {
        ...p,
        bounds,
        annotationBounds,
        items: p.items.map((item) => {
          const placed = {
            labelPosition: pt(item.labelPosition),
            symbol: item.symbol.type === "point"
              ? { ...item.symbol, position: pt(item.symbol.position) }
              : item.symbol.type === "line"
              ? { ...item.symbol, coords: item.symbol.coords.map(pt) }
              : { ...item.symbol, position: rect(item.symbol.position) },
          };
          return item.part === undefined
            ? { ...item, ...placed }
            : { ...item, ...placed, hitBounds: rect(item.hitBounds) };
        }),
      };
    case "figure-scale-legend-gradient":
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
    case "figure-scale-legend-stepped":
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
