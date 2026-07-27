// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PathSegment } from "../deps.ts";
import type { PieTotal } from "../types.ts";

// Cubic-bezier arc approximation. k = 4/3 × tan(θ/4) is exact at the endpoints
// and tangents; capping each bezier at a quarter turn keeps the max radial
// error around 2.7e-4 × r — invisible at any output size. This is the correct
// cross-target representation anyway: PDF has no arc operator, so an arc in a
// PDF IS a bezier.
const MAX_ARC_SEGMENT = Math.PI / 2;

export const TWO_PI = Math.PI * 2;

// A sweep this close to the whole turn IS the whole turn: the radial edges
// coincide, so there is nothing left for them to constrain.
const FULL_TURN_EPSILON = 1e-9;

export function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// The denominator a cell's geometry is laid out against, and the one its
// reported shares are computed against. They differ only when the values
// overflow a declared total:
//
//   resolvedTotal = total === "sum" ? Σ : max(total, Σ)
//   share         = value / (total === "sum" ? Σ : total)
//
// so an overflowing pie fills the circle exactly once (segments proportional,
// no overlap, no dropped slice) while PieSliceInfo.share still reports the
// true 1.03. The max() also absorbs float slop (Σ = 100.0000000001) with no
// tolerance constant.
export type ResolvedPieTotal = {
  // Denominator for angles.
  geometryTotal: number;
  // Denominator for the reported share.
  declaredTotal: number;
  // The unfilled part of a partial pie, as a fraction of the circle.
  remainderFraction: number;
};

export function resolvePieTotal(
  total: PieTotal,
  sumOfValues: number,
): ResolvedPieTotal {
  if (total === "sum") {
    return {
      geometryTotal: sumOfValues,
      declaredTotal: sumOfValues,
      remainderFraction: 0,
    };
  }
  // An explicitly empty (or negative) envelope is degenerate, not an overflow:
  // there is no denominator to divide by, so the cell renders nothing. The
  // max() below is only for values that overrun a POSITIVE envelope.
  if (total <= 0) {
    return { geometryTotal: 0, declaredTotal: total, remainderFraction: 0 };
  }
  const geometryTotal = Math.max(total, sumOfValues);
  return {
    geometryTotal,
    declaredTotal: total,
    remainderFraction: geometryTotal > 0
      ? Math.max(0, (geometryTotal - sumOfValues) / geometryTotal)
      : 0,
  };
}

// A ratio of exactly 1 would leave no ring to draw.
const MAX_INNER_RADIUS_RATIO = 0.99;

export function clampInnerRadiusRatio(ratio: number): number {
  return Math.min(Math.max(ratio, 0), MAX_INNER_RADIUS_RATIO);
}

export type SliceAngles = {
  startAngle: number;
  endAngle: number;
};

// Lays out sweeps (fractions of the circle, summing to <= 1) as angle pairs
// from `startAngleDeg`, honouring direction and the inter-slice pad.
//
// padAngle is taken out of each slice's own sweep rather than added between
// slices, so N slices always close the circle exactly — adding gaps would make
// the drawn total exceed 2pi. A pad wider than the slice collapses it to zero
// rather than inverting it.
export function layOutSliceAngles(
  sweepFractions: number[],
  opts: {
    startAngleDeg: number;
    direction: "clockwise" | "counterclockwise";
    padAngleDeg: number;
  },
): SliceAngles[] {
  const sign = opts.direction === "clockwise" ? 1 : -1;
  const pad = degreesToRadians(Math.max(0, opts.padAngleDeg));
  let cursor = degreesToRadians(opts.startAngleDeg);

  return sweepFractions.map((fraction) => {
    const full = fraction * TWO_PI;
    const drawn = Math.max(0, full - pad);
    const halfGap = (full - drawn) / 2;
    const start = cursor + sign * halfGap;
    const end = start + sign * drawn;
    cursor += sign * full;
    return opts.direction === "clockwise"
      ? { startAngle: start, endAngle: end }
      : { startAngle: end, endAngle: start };
  });
}

export function polarPoint(
  cx: number,
  cy: number,
  r: number,
  angle: number,
): { x: number; y: number } {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Does an axis-aligned w x h box centred at `boxCenter` (given RELATIVE to the
// pie centre) lie inside the annular sector? This is how much room a label has
// if it sits inside the slice, asked in the frame the label is actually drawn
// in — the predecessor returned (chord, thickness), which are screen width and
// height only where a slice points straight up or down, and are transposed at
// 3 and 9 o'clock.
//
// Exact, and no search is needed: a rectangle lies inside an annular sector iff
// it stays within the outer radius, clears the inner radius, and subtends an
// arc the sector contains. Direction-independent — only |endAngle - startAngle|
// and the lower of the two are used.
export function wedgeFitsBox(
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
  boxCenter: { x: number; y: number },
  w: number,
  h: number,
): boolean {
  const halfW = w / 2;
  const halfH = h / 2;
  const dx = Math.abs(boxCenter.x);
  const dy = Math.abs(boxCenter.y);

  // Outer: the farthest point of a rectangle from a point is always a corner.
  if (Math.hypot(dx + halfW, dy + halfH) > outerR) return false;

  // Inner: the nearest point may be on an edge, so this is the full
  // point-to-rectangle distance, not the nearest corner.
  const nearX = Math.max(0, dx - halfW);
  const nearY = Math.max(0, dy - halfH);
  if (Math.hypot(nearX, nearY) < innerR) return false;

  const sweep = Math.abs(endAngle - startAngle);
  // A full sweep has no angular constraint left to apply.
  if (sweep >= TWO_PI - FULL_TURN_EPSILON) return true;
  // The pie centre inside the box means the box subtends the whole turn, which
  // only a full sweep could have contained.
  if (nearX === 0 && nearY === 0) return false;

  const arc = subtendedArc(boxCenter, halfW, halfH);
  const offset = normalizeTurn(arc.start - Math.min(startAngle, endAngle));
  return offset + arc.length <= sweep;
}

// The minimal arc containing all four corner bearings. A convex body that does
// not contain the origin subtends less than a half turn, so the arc is the
// complement of the widest gap between consecutive bearings.
function subtendedArc(
  boxCenter: { x: number; y: number },
  halfW: number,
  halfH: number,
): { start: number; length: number } {
  const bearings = [
    Math.atan2(boxCenter.y - halfH, boxCenter.x - halfW),
    Math.atan2(boxCenter.y - halfH, boxCenter.x + halfW),
    Math.atan2(boxCenter.y + halfH, boxCenter.x + halfW),
    Math.atan2(boxCenter.y + halfH, boxCenter.x - halfW),
  ].sort((a, b) => a - b);

  let widestGapIndex = bearings.length - 1;
  let widestGap = bearings[0] + TWO_PI - bearings[bearings.length - 1];
  for (let i = 0; i < bearings.length - 1; i++) {
    const gap = bearings[i + 1] - bearings[i];
    if (gap > widestGap) {
      widestGap = gap;
      widestGapIndex = i;
    }
  }
  return {
    start: bearings[(widestGapIndex + 1) % bearings.length],
    length: TWO_PI - widestGap,
  };
}

function normalizeTurn(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

// Half-width of the circle at a given y — the analytic version of map's
// coastline ray-cast, so pie leader lines hug the arc exactly. Returns the
// centre when y is outside the circle, so the hook always yields a number.
export function circleEdgeAtY(
  cx: number,
  cy: number,
  r: number,
  side: "left" | "right",
  y: number,
): number {
  const dy = y - cy;
  const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
  return side === "left" ? cx - dx : cx + dx;
}

// Appends bezier segments approximating the arc from `fromAngle` to `toAngle`
// at radius r. Assumes the current point is already on the arc at `fromAngle`.
function appendArc(
  segments: PathSegment[],
  cx: number,
  cy: number,
  r: number,
  fromAngle: number,
  toAngle: number,
): void {
  const total = toAngle - fromAngle;
  if (r <= 0 || total === 0) return;

  const steps = Math.max(1, Math.ceil(Math.abs(total) / MAX_ARC_SEGMENT));
  const step = total / steps;
  const k = (4 / 3) * Math.tan(step / 4);

  let angle = fromAngle;
  for (let i = 0; i < steps; i++) {
    const next = angle + step;
    const p0 = polarPoint(cx, cy, r, angle);
    const p1 = polarPoint(cx, cy, r, next);
    segments.push({
      type: "bezierCurveTo",
      cp1x: p0.x - k * r * Math.sin(angle),
      cp1y: p0.y + k * r * Math.cos(angle),
      cp2x: p1.x + k * r * Math.sin(next),
      cp2y: p1.y - k * r * Math.cos(next),
      x: p1.x,
      y: p1.y,
    });
    angle = next;
  }
}

export type SlicePathParams = {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
  cornerRadius: number;
};

// A wedge as an explicitly closed path.
//
// The closing segment is explicit on purpose: PathSegment has no closePath, and
// while canvas fill() auto-closes, stroke() does not — a stroked slice would
// otherwise be missing its closing edge. (Map regions get away with it only
// because GeoJSON polygon rings repeat their first coordinate by spec.)
export function buildSlicePath(p: SlicePathParams): PathSegment[] {
  const { cx, cy, innerR, outerR, startAngle, endAngle } = p;
  const segments: PathSegment[] = [];
  if (outerR <= 0 || startAngle === endAngle) return segments;

  const sweep = Math.abs(endAngle - startAngle);
  const isFullCircle = sweep >= TWO_PI - FULL_TURN_EPSILON;
  const corner = resolveCornerRadius(p, isFullCircle);

  // A full ring has no radial edges to round or join, so it is two independent
  // circles (outer forward, inner back) — the even-odd fill rule punches the
  // hole. A full disc is just the outer circle.
  if (isFullCircle) {
    appendCircle(segments, cx, cy, outerR, startAngle);
    if (innerR > 0) {
      appendCircle(segments, cx, cy, innerR, startAngle);
    }
    return segments;
  }

  if (corner > 0) {
    return buildRoundedSlicePath(p, corner);
  }

  const outerStart = polarPoint(cx, cy, outerR, startAngle);

  if (innerR <= 0) {
    segments.push({ type: "moveTo", x: cx, y: cy });
    segments.push({ type: "lineTo", x: outerStart.x, y: outerStart.y });
    appendArc(segments, cx, cy, outerR, startAngle, endAngle);
    segments.push({ type: "lineTo", x: cx, y: cy });
    return segments;
  }

  const innerEnd = polarPoint(cx, cy, innerR, endAngle);
  segments.push({ type: "moveTo", x: outerStart.x, y: outerStart.y });
  appendArc(segments, cx, cy, outerR, startAngle, endAngle);
  segments.push({ type: "lineTo", x: innerEnd.x, y: innerEnd.y });
  appendArc(segments, cx, cy, innerR, endAngle, startAngle);
  segments.push({ type: "lineTo", x: outerStart.x, y: outerStart.y });
  return segments;
}

function appendCircle(
  segments: PathSegment[],
  cx: number,
  cy: number,
  r: number,
  fromAngle: number,
): void {
  const start = polarPoint(cx, cy, r, fromAngle);
  segments.push({ type: "moveTo", x: start.x, y: start.y });
  appendArc(segments, cx, cy, r, fromAngle, fromAngle + TWO_PI);
  segments.push({ type: "lineTo", x: start.x, y: start.y });
}

// Clamped so a fillet can never exceed what the wedge can hold: half the radial
// thickness, and half the shortest chord (the one at the inner radius, or at
// the outer radius when the wedge reaches the centre).
function resolveCornerRadius(
  p: SlicePathParams,
  isFullCircle: boolean,
): number {
  if (p.cornerRadius <= 0 || isFullCircle) return 0;
  const sweep = Math.abs(p.endAngle - p.startAngle);
  const thickness = p.outerR - p.innerR;
  const limitingR = p.innerR > 0 ? p.innerR : p.outerR;
  const chord = 2 * limitingR * Math.sin(Math.min(sweep, Math.PI) / 2);
  return Math.max(0, Math.min(p.cornerRadius, thickness / 2, chord / 2));
}

// Rounded wedge: each corner is replaced by a fillet arc of radius `corner`
// tangent to both the radial edge and the ring arc it meets. A fillet's centre
// lies at radius (outerR − corner) or (innerR + corner), offset along the arc
// by the angle δ = asin(corner / thatRadius) that puts it exactly `corner`
// away from the radial edge — so the fillet meets the radial edge at radius
// sqrt(centreR² − corner²) and the ring arc at the fillet centre's own angle.
// Traversing the wedge turns the same way at all four corners, so every fillet
// sweeps in the traversal direction.
function buildRoundedSlicePath(
  p: SlicePathParams,
  corner: number,
): PathSegment[] {
  const { cx, cy, innerR, outerR, startAngle, endAngle } = p;
  const dir = endAngle > startAngle ? 1 : -1;
  const sweep = Math.abs(endAngle - startAngle);
  const quarter = Math.PI / 2;

  const outerCentreR = outerR - corner;
  const outerDelta = Math.asin(Math.min(1, corner / outerCentreR));
  const innerCentreR = innerR + corner;
  const innerDelta = innerR > 0
    ? Math.asin(Math.min(1, corner / innerCentreR))
    : 0;

  // Fillets eat angular width off both ends of each arc. If they would meet
  // (or cross), the wedge is too narrow to round — fall back to the square
  // wedge rather than drawing an inverted arc.
  if (2 * outerDelta > sweep || 2 * innerDelta > sweep) {
    return buildSlicePath({ ...p, cornerRadius: 0 });
  }

  const outerStartA = startAngle + dir * outerDelta;
  const outerEndA = endAngle - dir * outerDelta;
  const innerStartA = startAngle + dir * innerDelta;
  const innerEndA = endAngle - dir * innerDelta;

  // Where each fillet touches its radial edge.
  const outerEdgeR = Math.sqrt(
    Math.max(0, outerCentreR * outerCentreR - corner * corner),
  );
  const innerEdgeR = Math.sqrt(
    Math.max(0, innerCentreR * innerCentreR - corner * corner),
  );

  const segments: PathSegment[] = [];
  const tail = innerR > 0
    ? polarPoint(cx, cy, innerEdgeR, startAngle)
    : { x: cx, y: cy };
  const outerEdgeStart = polarPoint(cx, cy, outerEdgeR, startAngle);

  segments.push({ type: "moveTo", x: tail.x, y: tail.y });
  segments.push({ type: "lineTo", x: outerEdgeStart.x, y: outerEdgeStart.y });

  // Leading edge -> outer arc.
  appendFillet(
    segments,
    polarPoint(cx, cy, outerCentreR, outerStartA),
    corner,
    startAngle - dir * quarter,
    outerStartA,
    dir,
  );
  appendArc(segments, cx, cy, outerR, outerStartA, outerEndA);
  // Outer arc -> trailing edge.
  appendFillet(
    segments,
    polarPoint(cx, cy, outerCentreR, outerEndA),
    corner,
    outerEndA,
    endAngle + dir * quarter,
    dir,
  );

  if (innerR > 0) {
    const innerEdgeEnd = polarPoint(cx, cy, innerEdgeR, endAngle);
    segments.push({ type: "lineTo", x: innerEdgeEnd.x, y: innerEdgeEnd.y });
    // Trailing edge -> inner arc (the fillet centre is INSIDE the ring, so the
    // tangent point on the arc lies radially inward: angle + pi).
    appendFillet(
      segments,
      polarPoint(cx, cy, innerCentreR, innerEndA),
      corner,
      endAngle + dir * quarter,
      innerEndA + Math.PI,
      dir,
    );
    appendArc(segments, cx, cy, innerR, innerEndA, innerStartA);
    // Inner arc -> leading edge.
    appendFillet(
      segments,
      polarPoint(cx, cy, innerCentreR, innerStartA),
      corner,
      innerStartA + Math.PI,
      startAngle - dir * quarter,
      dir,
    );
  }

  segments.push({ type: "lineTo", x: tail.x, y: tail.y });
  return segments;
}

// One corner fillet: an arc of radius `r` about `centre` from `fromAngle` to
// `toAngle`, normalized so the sweep runs in direction `dir`.
function appendFillet(
  segments: PathSegment[],
  centre: { x: number; y: number },
  r: number,
  fromAngle: number,
  toAngle: number,
  dir: number,
): void {
  if (r <= 0) return;
  let sweep = toAngle - fromAngle;
  while (dir > 0 && sweep < 0) sweep += TWO_PI;
  while (dir < 0 && sweep > 0) sweep -= TWO_PI;
  appendArc(segments, centre.x, centre.y, r, fromAngle, fromAngle + sweep);
}

// Every point the path touches, control points included. The convex hull of a
// bezier's control points contains the curve, so feeding these to
// computeBoundsForPath gives a correct (slightly conservative) bound.
export function pathSegmentPoints(
  segments: PathSegment[],
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const s of segments) {
    if (s.type === "bezierCurveTo") {
      points.push({ x: s.cp1x, y: s.cp1y }, { x: s.cp2x, y: s.cp2y });
    }
    points.push({ x: s.x, y: s.y });
  }
  return points;
}
