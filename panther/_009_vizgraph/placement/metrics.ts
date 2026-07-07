// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Geometry } from "../types_geometry.ts";

// Placement-quality metrics (DOC_VIZGRAPH_PLACEMENT.md): pure functions over
// public Geometry. Proxies to steer by — the eye is the gate; these catch
// regressions and rank candidates. The evaluation panel duplicates these
// definitions inline by design (so old baselines measure identically);
// change them here and there together.
export type PlacementMetrics = {
  boundsW: number;
  boundsH: number;
  layerCenterSpread: number;
  verticalTravel: number;
  bendCount: number;
  whitespaceRatio: number;
};

export function computePlacementMetrics(g: Geometry): PlacementMetrics {
  const spans = new Map<number, { min: number; max: number }>();
  let nodeArea = 0;
  for (const n of Object.values(g.nodes)) {
    const s = spans.get(n.layer) ?? { min: Infinity, max: -Infinity };
    s.min = Math.min(s.min, n.y);
    s.max = Math.max(s.max, n.y + n.h);
    spans.set(n.layer, s);
    nodeArea += n.w * n.h;
  }
  const centers = [...spans.values()].map((s) => (s.min + s.max) / 2);
  const layerCenterSpread = centers.length === 0
    ? 0
    : Math.max(...centers) - Math.min(...centers);
  let verticalTravel = 0;
  let bendCount = 0;
  for (const e of Object.values(g.edges)) {
    const pts = e.path.points;
    bendCount += Math.max(0, pts.length - 2);
    for (let i = 1; i < pts.length; i++) {
      verticalTravel += Math.abs(pts[i].y - pts[i - 1].y);
    }
  }
  const boundsArea = g.bounds.w * g.bounds.h;
  return {
    boundsW: g.bounds.w,
    boundsH: g.bounds.h,
    layerCenterSpread,
    verticalTravel,
    bendCount,
    whitespaceRatio: boundsArea === 0 ? 0 : 1 - nodeArea / boundsArea,
  };
}
