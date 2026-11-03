// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  pathRenderCommands,
  pathRenderCommandsClosedRing,
  pullBackEnd,
  RectCoordsDims,
} from "../deps.ts";
import type {
  Arrowhead,
  PathCommand,
  PathSegment,
  PathSpec,
  Pt,
  Rect,
} from "../deps.ts";
import type { Side } from "../types.ts";

const CORNER_EPS = 0.25;
// Quadratic → cubic control-point conversion factor.
const QUAD_TO_CUBIC = 2 / 3;
// Bezier approximation of a quarter circle.
const KAPPA = 0.5523;

export function scalePt(p: Pt, sf: number, origin: Pt): Pt {
  return { x: origin.x + p.x * sf, y: origin.y + p.y * sf };
}

export function scaleRect(r: Rect, sf: number, origin: Pt): RectCoordsDims {
  return new RectCoordsDims({
    x: origin.x + r.x * sf,
    y: origin.y + r.y * sf,
    w: r.w * sf,
    h: r.h * sf,
  });
}

export function insetRect(r: RectCoordsDims, inset: number): RectCoordsDims {
  return new RectCoordsDims({
    x: r.x() + inset,
    y: r.y() + inset,
    w: Math.max(0, r.w() - 2 * inset),
    h: Math.max(0, r.h() - 2 * inset),
  });
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) {
    throw new Error("union needs at least one rect");
  }
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export function edgePointOf(r: Rect, side: Side, t: number): Pt {
  switch (side) {
    case "top":
      return { x: r.x + r.w * t, y: r.y };
    case "bottom":
      return { x: r.x + r.w * t, y: r.y + r.h };
    case "left":
      return { x: r.x, y: r.y + r.h * t };
    case "right":
      return { x: r.x + r.w, y: r.y + r.h * t };
  }
}

export function roundedRectSegments(
  r: RectCoordsDims,
  radius: number,
): PathSegment[] {
  const rad = Math.min(radius, r.w() / 2, r.h() / 2);
  const k = rad * KAPPA;
  const x1 = r.x();
  const y1 = r.y();
  const x2 = r.rightX();
  const y2 = r.bottomY();
  return [
    { type: "moveTo", x: x1 + rad, y: y1 },
    { type: "lineTo", x: x2 - rad, y: y1 },
    {
      type: "bezierCurveTo",
      cp1x: x2 - rad + k,
      cp1y: y1,
      cp2x: x2,
      cp2y: y1 + rad - k,
      x: x2,
      y: y1 + rad,
    },
    { type: "lineTo", x: x2, y: y2 - rad },
    {
      type: "bezierCurveTo",
      cp1x: x2,
      cp1y: y2 - rad + k,
      cp2x: x2 - rad + k,
      cp2y: y2,
      x: x2 - rad,
      y: y2,
    },
    { type: "lineTo", x: x1 + rad, y: y2 },
    {
      type: "bezierCurveTo",
      cp1x: x1 + rad - k,
      cp1y: y2,
      cp2x: x1,
      cp2y: y2 - rad + k,
      x: x1,
      y: y2 - rad,
    },
    { type: "lineTo", x: x1, y: y1 + rad },
    {
      type: "bezierCurveTo",
      cp1x: x1,
      cp1y: y1 + rad - k,
      cp2x: x1 + rad - k,
      cp2y: y1,
      x: x1 + rad,
      y: y1,
    },
  ];
}

export function openPathSegments(path: PathSpec): PathSegment[] {
  return commandsToSegments(pathRenderCommands(path));
}

export function closedRingSegments(ring: PathSpec): PathSegment[] {
  return commandsToSegments(pathRenderCommandsClosedRing(ring));
}

// Quadratic corners become their exact cubic equivalent: PathSegment has no
// quadratic form.
function commandsToSegments(commands: PathCommand[]): PathSegment[] {
  const segments: PathSegment[] = [];
  let cursor: Pt = { x: 0, y: 0 };
  for (const command of commands) {
    if (command.type === "move") {
      segments.push({ type: "moveTo", x: command.x, y: command.y });
    } else if (command.type === "line") {
      segments.push({ type: "lineTo", x: command.x, y: command.y });
    } else {
      segments.push({
        type: "bezierCurveTo",
        cp1x: cursor.x + QUAD_TO_CUBIC * (command.cpx - cursor.x),
        cp1y: cursor.y + QUAD_TO_CUBIC * (command.cpy - cursor.y),
        cp2x: command.x + QUAD_TO_CUBIC * (command.cpx - command.x),
        cp2y: command.y + QUAD_TO_CUBIC * (command.cpy - command.y),
        x: command.x,
        y: command.y,
      });
    }
    cursor = { x: command.x, y: command.y };
  }
  return segments;
}

// The shaft pulled back at one end by the engine's pullBackEnd, so a
// round-joined arrowhead's painted tip lands on the authored endpoint.
export function pullBack(
  pts: Pt[],
  amount: number,
  end: "start" | "end",
): Pt[] {
  if (end === "end") {
    return pullBackEnd(pts, amount);
  }
  return pullBackEnd([...pts].reverse(), amount).reverse();
}

// Uniform inward offset of a closed rectilinear ring: each axis-aligned edge
// shifts toward the interior (the side from the ring's signed area) and
// adjacent shifted edges re-intersect (a horizontal edge fixes y, a vertical
// one x), so a ring's stroke lies inside the rect it bounds.
export function insetRectilinearRing(pts: Pt[], inset: number): Pt[] {
  const n = pts.length;
  if (inset <= 0 || n < 3) {
    return pts;
  }
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    area2 += p.x * q.y - q.x * p.y;
  }
  const sign = area2 >= 0 ? 1 : -1;
  const shifted = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < CORNER_EPS) {
      return { x: p.x, y: p.y, horizontal: true };
    }
    const nx = (-(q.y - p.y) / len) * sign * inset;
    const ny = ((q.x - p.x) / len) * sign * inset;
    return {
      x: p.x + nx,
      y: p.y + ny,
      horizontal: Math.abs(q.x - p.x) >= Math.abs(q.y - p.y),
    };
  });
  return pts.map((_, i) => {
    const inEdge = shifted[(i + n - 1) % n];
    const outEdge = shifted[i];
    return inEdge.horizontal
      ? { x: outEdge.x, y: inEdge.y }
      : { x: inEdge.x, y: outEdge.y };
  });
}

export function arrowheadAt(
  pts: Pt[],
  size: number,
  end: "start" | "end",
): Arrowhead | undefined {
  if (pts.length < 2 || size <= 0) {
    return undefined;
  }
  const tip = end === "end" ? pts[pts.length - 1] : pts[0];
  const from = end === "end" ? pts[pts.length - 2] : pts[1];
  if (Math.hypot(tip.x - from.x, tip.y - from.y) < CORNER_EPS) {
    return undefined;
  }
  return {
    position: new Coordinates([tip.x, tip.y]),
    angle: Math.atan2(tip.y - from.y, tip.x - from.x),
    size,
  };
}

export function boundsOfPoints(pts: Pt[], pad: number): RectCoordsDims {
  if (pts.length === 0) {
    return new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 });
  }
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  return new RectCoordsDims({
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  });
}

// The point at normalized arc length t along a polyline.
export function pointAlong(pts: Pt[], t: number): Pt {
  if (pts.length === 0) {
    throw new Error("pointAlong needs at least one point");
  }
  if (pts.length === 1) {
    return pts[0];
  }
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lengths.push(len);
    total += len;
  }
  if (total === 0) {
    return pts[0];
  }
  let remaining = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 0 : remaining / lengths[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
      };
    }
    remaining -= lengths[i];
  }
  return pts[pts.length - 1];
}
