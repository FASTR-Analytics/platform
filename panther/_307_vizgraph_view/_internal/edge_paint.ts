// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { toSvgPath } from "../deps.ts";
import type { PathSpec } from "../deps.ts";

// The panther family arrowhead, view-side (renderer-internal by decision —
// the figure paints the identical shape in generate_primitives /
// renderArrowhead): an OPEN V, wings ±30° back from the tip, arm length
// ARROWHEAD_SIZE (= the figure style's default arrowheadSize), stroked at
// edge thickness with round joins. The tip vertex sits exactly on the node
// boundary (engine contract), so the SHAFT is pulled back by thickness/2 —
// the round-joined V paints that far beyond its vertex, and the pull-back
// makes the painted tip touch the boundary instead of crossing it.

export const ARROWHEAD_SIZE = 7;
const WING_ANGLE = Math.PI / 6;
const MIN_SEGMENT = 0.01;

export function shaftPath(path: PathSpec, thickness: number): string {
  const pts = path.points.map((pt) => ({ x: pt.x, y: pt.y }));
  pullBackEnd(pts, thickness / 2);
  return toSvgPath({ points: pts, corners: path.corners });
}

export function arrowheadPath(path: PathSpec): string | undefined {
  const pts = path.points;
  if (pts.length < 2) {
    return undefined;
  }
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  if (Math.hypot(dx, dy) < MIN_SEGMENT) {
    return undefined;
  }
  const backward = Math.atan2(dy, dx) + Math.PI;
  const a1 = backward + WING_ANGLE;
  const a2 = backward - WING_ANGLE;
  const p1x = tip.x + Math.cos(a1) * ARROWHEAD_SIZE;
  const p1y = tip.y + Math.sin(a1) * ARROWHEAD_SIZE;
  const p2x = tip.x + Math.cos(a2) * ARROWHEAD_SIZE;
  const p2y = tip.y + Math.sin(a2) * ARROWHEAD_SIZE;
  return `M ${p1x} ${p1y} L ${tip.x} ${tip.y} L ${p2x} ${p2y}`;
}

function pullBackEnd(pts: { x: number; y: number }[], amount: number): void {
  if (amount <= 0 || pts.length < 2) {
    return;
  }
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < MIN_SEGMENT) {
    return;
  }
  const pullBack = Math.min(amount, len - MIN_SEGMENT);
  end.x -= (dx / len) * pullBack;
  end.y -= (dy / len) * pullBack;
}
