// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Pt } from "../types_geometry.ts";

const CORNER_EPS = 0.25;

// The path's last point moved back along its last segment by `amount`, so
// an arrowhead whose round-joined V reaches half its stroke past the vertex
// paints its tip on the authored endpoint instead of past it. A segment
// shorter than the engine's corner epsilon is left alone.
export function pullBackEnd(pts: Pt[], amount: number): Pt[] {
  if (amount <= 0 || pts.length < 2) {
    return pts;
  }
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < CORNER_EPS) {
    return pts;
  }
  const pull = Math.min(amount, len - CORNER_EPS);
  return [
    ...pts.slice(0, -1),
    { x: end.x - (dx / len) * pull, y: end.y - (dy / len) * pull },
  ];
}
