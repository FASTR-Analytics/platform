// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, type RectCoordsDims } from "../deps.ts";
import type {
  FigureLegendPrimitive,
  FigureScaleLegendGradientPrimitive,
  FigureScaleLegendSteppedPrimitive,
  FigureTextPrimitive,
} from "./types.ts";

export type SurroundsPrimitive =
  | FigureTextPrimitive
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
    case "figure-text":
      return {
        ...p,
        bounds,
        annotationBounds,
        alignRcd: rect(p.alignRcd),
        hitBounds: rect(p.hitBounds),
      };
    case "figure-legend":
      return {
        ...p,
        bounds,
        annotationBounds,
        entries: p.entries.map((entry) => {
          const placed = {
            labelPosition: pt(entry.labelPosition),
            symbol: entry.symbol.type === "point"
              ? { ...entry.symbol, position: pt(entry.symbol.position) }
              : entry.symbol.type === "line"
              ? { ...entry.symbol, coords: entry.symbol.coords.map(pt) }
              : { ...entry.symbol, position: rect(entry.symbol.position) },
          };
          return entry.part === undefined
            ? { ...entry, ...placed }
            : { ...entry, ...placed, hitBounds: rect(entry.hitBounds) };
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
