// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PathSpec, Pt } from "../types_geometry.ts";

const PARAM_EPS = 1e-6;

// Pairwise tween-time normalization (PLAN_VIZGRAPH.md §4): any two PathSpecs
// for the same edge are tweenable. Both paths are parametrized by normalized
// arc length; the union of their breakpoint parameters becomes the shared
// structure (coincident points inserted for this pair only — output paths
// never carry padding). At t=0 the result traces `a` exactly, at t=1 `b`.
export function tween(a: PathSpec, b: PathSpec, t: number): PathSpec {
  const pa = parametrize(a);
  const pb = parametrize(b);
  const union = mergeParams(pa.params, pb.params);

  const points: Pt[] = [];
  const radii: number[] = [];
  for (const u of union) {
    const sa = sampleAt(a, pa.params, u);
    const sb = sampleAt(b, pb.params, u);
    points.push({
      x: sa.point.x + (sb.point.x - sa.point.x) * t,
      y: sa.point.y + (sb.point.y - sa.point.y) * t,
    });
    radii.push(sa.radius + (sb.radius - sa.radius) * t);
  }
  return { points, corners: radii.slice(1, Math.max(1, radii.length - 1)) };
}

type Parametrized = { params: number[] };

function parametrize(path: PathSpec): Parametrized {
  const pts = path.points;
  if (pts.length <= 1) {
    return { params: pts.map(() => 0) };
  }
  const cumulative: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    );
  }
  const total = cumulative[cumulative.length - 1];
  if (total < PARAM_EPS) {
    return { params: pts.map((_, i) => i / (pts.length - 1)) };
  }
  return { params: cumulative.map((d) => d / total) };
}

function mergeParams(a: number[], b: number[]): number[] {
  const merged = [...a, ...b].sort((x, y) => x - y);
  const out: number[] = [];
  for (const u of merged) {
    if (out.length === 0 || u - out[out.length - 1] > PARAM_EPS) {
      out.push(u);
    }
  }
  if (out.length === 0) {
    out.push(0);
  }
  return out;
}

type Sample = { point: Pt; radius: number };

function sampleAt(path: PathSpec, params: number[], u: number): Sample {
  const pts = path.points;
  if (pts.length === 0) {
    return { point: { x: 0, y: 0 }, radius: 0 };
  }
  if (pts.length === 1) {
    return { point: pts[0], radius: 0 };
  }
  for (let i = 0; i < params.length; i++) {
    if (Math.abs(params[i] - u) <= PARAM_EPS) {
      const interior = i > 0 && i < pts.length - 1;
      return { point: pts[i], radius: interior ? path.corners[i - 1] ?? 0 : 0 };
    }
  }
  let k = 0;
  while (k < params.length - 2 && params[k + 1] < u) {
    k++;
  }
  const span = params[k + 1] - params[k];
  const f = span < PARAM_EPS ? 0 : (u - params[k]) / span;
  return {
    point: {
      x: pts[k].x + (pts[k + 1].x - pts[k].x) * f,
      y: pts[k].y + (pts[k + 1].y - pts[k].y) * f,
    },
    radius: 0,
  };
}
