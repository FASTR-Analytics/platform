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
  edgeCrossings: number;
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
    edgeCrossings: countEdgeCrossings(g),
  };
}

// Geometric crossings between drawn segments of DIFFERENT edges — the
// between-column count that stage-3's combinatorial crossing number does not
// see (it counts order inversions per gutter, before ports, tracks, and
// channels have shaped anything). Strictly proper crossings only: shared
// endpoints and collinear overlaps score 0, so the fans and bundles that meet
// at a port are not counted as crossing each other.
const CROSS_EPS = 1e-9;

type Seg = { x1: number; y1: number; x2: number; y2: number; edge: string };

function countEdgeCrossings(g: Geometry): number {
  const segs: Seg[] = [];
  for (const [id, e] of Object.entries(g.edges)) {
    const pts = e.path.points;
    for (let i = 1; i < pts.length; i++) {
      segs.push({
        x1: pts[i - 1].x,
        y1: pts[i - 1].y,
        x2: pts[i].x,
        y2: pts[i].y,
        edge: id,
      });
    }
  }
  let count = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].edge !== segs[j].edge && properlyCross(segs[i], segs[j])) {
        count++;
      }
    }
  }
  return count;
}

function properlyCross(a: Seg, b: Seg): boolean {
  const d1 = side(a, b.x1, b.y1);
  const d2 = side(a, b.x2, b.y2);
  const d3 = side(b, a.x1, a.y1);
  const d4 = side(b, a.x2, a.y2);
  return d1 * d2 < -CROSS_EPS && d3 * d4 < -CROSS_EPS;
}

function side(s: Seg, px: number, py: number): number {
  return (s.x2 - s.x1) * (py - s.y1) - (s.y2 - s.y1) * (px - s.x1);
}
