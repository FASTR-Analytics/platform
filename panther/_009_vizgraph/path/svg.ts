// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PathSpec, Pt } from "../types_geometry.ts";

const CORNER_EPS = 0.25;
// A jog whose middle segment's HALF-length is under this threshold blends
// into an angle-cut S instead of two tight corner quads (the viz-positions
// shallow-jog smoothing, `_MIN_ANGLE_DISPLACEMENT_THRESHOLD`): near-level
// edges read as gentle slopes, not double kinks.
const SHALLOW_JOG_HALF_LEN = 8;

// Renderer-neutral rounded-path vocabulary: what to draw, computed once from
// PathSpec (radius clamps + shallow-jog smoothing) so every renderer (SVG
// `d`, canvas/PDF segments) paints identical corners.
export type PathCommand =
  | { type: "move"; x: number; y: number }
  | { type: "line"; x: number; y: number }
  | { type: "quad"; cpx: number; cpy: number; x: number; y: number };

// PathSpec → drawing commands. Interior points round with their per-point
// radius, clamped to half of each adjacent segment — on short segments the
// radius collapses toward a plain angle cut instead of overshooting (the
// viz-positions short-segment fallback, DOC_VIZGRAPH_ARCHITECTURE.md
// lineage). Shallow jogs (two corners around a middle segment shorter than
// 2×SHALLOW_JOG_HALF_LEN, where the half-segment clamp — not the authored
// radius — is what binds) additionally widen along their outer segments by
// an angle displacement of up to half the shorter outer span, fading out as
// the middle approaches the threshold; the two corner curves meet at the
// middle's midpoint with matching tangents, so the jog renders as one
// gentle S.
export function pathRenderCommands(path: PathSpec): PathCommand[] {
  const pts = path.points;
  if (pts.length === 0) {
    return [];
  }
  const commands: PathCommand[] = [{ type: "move", x: pts[0].x, y: pts[0].y }];
  if (pts.length === 1) {
    return commands;
  }

  const n = pts.length;
  const segLen: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    segLen.push(dist(pts[k], pts[k + 1]));
  }

  // Per corner (point index 1..n-2): how far the curve reaches back along
  // the incoming segment / forward along the outgoing one, and where its
  // control point sits (the corner itself, unless jog-shifted).
  const radius: number[] = [];
  const entryDist: number[] = [];
  const exitDist: number[] = [];
  const cp: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const r = i >= 1 && i <= n - 2 ? path.corners[i - 1] ?? 0 : 0;
    radius.push(r);
    // Symmetric by default (the pre-smoothing behavior): both sides clamp to
    // the SHORTER adjacent half-segment. The jog pass overrides per side.
    const clamped = i >= 1 && i <= n - 2
      ? Math.min(r, segLen[i - 1] / 2, segLen[i] / 2)
      : 0;
    entryDist.push(clamped);
    exitDist.push(clamped);
    cp.push({ x: pts[i].x, y: pts[i].y });
  }

  // Shallow-jog pass over interior segments whose BOTH ends are corners.
  for (let k = 1; k <= n - 3; k++) {
    const m = segLen[k];
    const halfM = m / 2;
    if (m < CORNER_EPS || halfM >= SHALLOW_JOG_HALF_LEN) {
      continue;
    }
    // Only when the half-segment clamp binds — an authored radius tighter
    // than the middle's half stays a deliberate tight corner.
    if (Math.min(radius[k], radius[k + 1]) < halfM) {
      continue;
    }
    const outerIn = segLen[k - 1];
    const outerOut = segLen[k + 1];
    const ad = (Math.min(outerIn, outerOut) / 2) *
      (1 - halfM / SHALLOW_JOG_HALF_LEN);
    if (ad < CORNER_EPS) {
      continue;
    }
    // The pair's curves meet at the middle's midpoint.
    exitDist[k] = halfM;
    entryDist[k + 1] = halfM;
    // Widen along each outer segment, unless that segment is itself a
    // shallow middle (staircase): its distances belong to its own jog.
    if (!isShallowMiddle(k - 1, n, segLen, radius)) {
      const room = outerIn / 2;
      const adEff = Math.min(ad, room - Math.min(radius[k], room));
      if (adEff > 0) {
        entryDist[k] = Math.min(radius[k], room) + adEff;
        cp[k] = towards(pts[k], pts[k - 1], adEff / outerIn);
      }
    }
    if (!isShallowMiddle(k + 1, n, segLen, radius)) {
      const room = outerOut / 2;
      const adEff = Math.min(ad, room - Math.min(radius[k + 1], room));
      if (adEff > 0) {
        exitDist[k + 1] = Math.min(radius[k + 1], room) + adEff;
        cp[k + 1] = towards(pts[k + 1], pts[k + 2], adEff / outerOut);
      }
    }
  }

  for (let i = 1; i < n - 1; i++) {
    const inLen = segLen[i - 1];
    const outLen = segLen[i];
    if (
      entryDist[i] < CORNER_EPS || exitDist[i] < CORNER_EPS ||
      inLen < CORNER_EPS || outLen < CORNER_EPS
    ) {
      commands.push({ type: "line", x: pts[i].x, y: pts[i].y });
      continue;
    }
    const entry = towards(pts[i], pts[i - 1], entryDist[i] / inLen);
    const exit = towards(pts[i], pts[i + 1], exitDist[i] / outLen);
    commands.push({ type: "line", x: entry.x, y: entry.y });
    commands.push({
      type: "quad",
      cpx: cp[i].x,
      cpy: cp[i].y,
      x: exit.x,
      y: exit.y,
    });
  }
  commands.push({ type: "line", x: pts[n - 1].x, y: pts[n - 1].y });
  return commands;
}

function isShallowMiddle(
  k: number,
  n: number,
  segLen: number[],
  radius: number[],
): boolean {
  if (k < 1 || k > n - 3) {
    return false;
  }
  const halfM = segLen[k] / 2;
  return segLen[k] >= CORNER_EPS && halfM < SHALLOW_JOG_HALF_LEN &&
    Math.min(radius[k], radius[k + 1]) >= halfM;
}

// Closed-ring variant for group hug outlines (PLAN item: the primitive
// type's anticipated rectilinear `outline`): every vertex is a corner —
// corners[i] belongs to points[i], the last→first segment is implied. Same
// per-corner geometry as pathRenderCommands (radius clamped to half of each
// adjacent segment, quadratic curve through the vertex; the turn direction
// picks convex vs concave automatically), WITHOUT the shallow-jog smoothing
// (rings are rectilinear hugs, not edge jogs). Commands start and end at the
// first vertex's exit point, so the path closes exactly.
export function pathRenderCommandsClosedRing(ring: PathSpec): PathCommand[] {
  const pts = ring.points;
  const n = pts.length;
  if (n === 0) {
    return [];
  }
  if (n < 3) {
    const commands: PathCommand[] = [
      { type: "move", x: pts[0].x, y: pts[0].y },
    ];
    for (let i = 1; i < n; i++) {
      commands.push({ type: "line", x: pts[i].x, y: pts[i].y });
    }
    return commands;
  }
  const segLen: number[] = [];
  for (let i = 0; i < n; i++) {
    segLen.push(dist(pts[i], pts[(i + 1) % n]));
  }
  const clamp: number[] = [];
  for (let i = 0; i < n; i++) {
    const inLen = segLen[(i + n - 1) % n];
    const outLen = segLen[i];
    clamp.push(Math.min(ring.corners[i] ?? 0, inLen / 2, outLen / 2));
  }
  const rounds = (i: number): boolean =>
    clamp[i] >= CORNER_EPS && segLen[i] >= CORNER_EPS &&
    segLen[(i + n - 1) % n] >= CORNER_EPS;
  const entryOf = (i: number): Pt =>
    towards(pts[i], pts[(i + n - 1) % n], clamp[i] / segLen[(i + n - 1) % n]);
  const exitOf = (i: number): Pt =>
    towards(pts[i], pts[(i + 1) % n], clamp[i] / segLen[i]);
  const start = rounds(0) ? exitOf(0) : pts[0];
  const commands: PathCommand[] = [{ type: "move", x: start.x, y: start.y }];
  for (let k = 1; k <= n; k++) {
    const i = k % n;
    if (!rounds(i)) {
      commands.push({ type: "line", x: pts[i].x, y: pts[i].y });
      continue;
    }
    const entry = entryOf(i);
    const exit = exitOf(i);
    commands.push({ type: "line", x: entry.x, y: entry.y });
    commands.push({
      type: "quad",
      cpx: pts[i].x,
      cpy: pts[i].y,
      x: exit.x,
      y: exit.y,
    });
  }
  return commands;
}

// PathSpec → SVG `d`, via pathRenderCommands.
export function toSvgPath(path: PathSpec): string {
  return commandsToSvg(pathRenderCommands(path));
}

// Closed ring → SVG `d` (explicit Z), via pathRenderCommandsClosedRing.
export function toSvgPathClosedRing(ring: PathSpec): string {
  const d = commandsToSvg(pathRenderCommandsClosedRing(ring));
  return d.length === 0 ? d : `${d} Z`;
}

function commandsToSvg(commands: PathCommand[]): string {
  const parts: string[] = [];
  for (const command of commands) {
    if (command.type === "move") {
      parts.push(`M ${fmt(command)}`);
    } else if (command.type === "line") {
      parts.push(`L ${fmt(command)}`);
    } else {
      parts.push(
        `Q ${round2(command.cpx)} ${round2(command.cpy)} ${fmt(command)}`,
      );
    }
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

function fmt(pt: { x: number; y: number }): string {
  return `${round2(pt.x)} ${round2(pt.y)}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
