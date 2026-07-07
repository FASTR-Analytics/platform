// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PathSpec, Pt } from "../types_geometry.ts";

const CORNER_EPS = 0.25;

// PathSpec → SVG `d`. Interior points round with their per-point radius,
// clamped to half of each adjacent segment — on short segments the radius
// collapses toward a plain angle cut instead of overshooting (the
// viz-positions short-segment fallback, PLAN_VIZGRAPH.md Appendix A2).
export function toSvgPath(path: PathSpec): string {
  const pts = path.points;
  if (pts.length === 0) {
    return "";
  }
  const parts: string[] = [`M ${fmt(pts[0])}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const radius = path.corners[i - 1] ?? 0;
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const inLen = dist(prev, cur);
    const outLen = dist(cur, next);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < CORNER_EPS || inLen < CORNER_EPS || outLen < CORNER_EPS) {
      parts.push(`L ${fmt(cur)}`);
      continue;
    }
    const entry = towards(cur, prev, r / inLen);
    const exit = towards(cur, next, r / outLen);
    parts.push(`L ${fmt(entry)}`, `Q ${fmt(cur)} ${fmt(exit)}`);
  }
  if (pts.length > 1) {
    parts.push(`L ${fmt(pts[pts.length - 1])}`);
  }
  return parts.join(" ");
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function towards(from: Pt, to: Pt, fraction: number): Pt {
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
  };
}

function fmt(pt: Pt): string {
  return `${round2(pt.x)} ${round2(pt.y)}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
