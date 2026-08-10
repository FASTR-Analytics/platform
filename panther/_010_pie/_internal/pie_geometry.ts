// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedPieStyle, PathSegment } from "../deps.ts";
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

// A whole turn is the maximum: past it slices would overlap themselves.
const FULL_SWEEP_ANGLE_DEG = 360;
// One degree is the floor because below it there is no chart: at half a degree a
// 500 DU gauge draws a 4 DU sliver. Its job is to BOUND the sizing terms, both of
// which scale as 1/sin(sweep) — not to avoid a division by zero, which cannot
// happen here since the two extent sums are never both zero:
//
//   worst ideal-height aspect  ~ 1/sin(MIN_SWEEP_ANGLE_DEG)
//   worst fit scale s0         ~ 1/sin(MIN_SWEEP_ANGLE_DEG) cell extents
//
// The worst case is a thin PIE sector rather than a thin ring segment: the sector
// contains the hub, so one extent sum stays at ~1 while the other shrinks with
// the sweep. Measured over every start angle and ratio, the worst aspect is
// 5.7e7 at a 1e-6 degree floor and 57.3 at this one — so a 1 degree sector still
// legitimately asks to be ~57x as tall as it is wide, but the quantity is now
// bounded by a derived factor instead of running away. That residual is accepted:
// the ink stays inside its cell either way, and capping it further would mean an
// arbitrary constant, or a style-side decay function like `idealHeight`'s, for
// input no chart author writes.
const MIN_SWEEP_ANGLE_DEG = 1;

export function clampSweepAngleDeg(deg: number): number {
  return Math.min(Math.max(deg, MIN_SWEEP_ANGLE_DEG), FULL_SWEEP_ANGLE_DEG);
}

export type SliceAngles = {
  startAngle: number;
  endAngle: number;
};

// Lays out sweeps (fractions of the pie's total sweep, summing to <= 1) as
// angle pairs from `startAngleDeg`, honouring direction.
//
// `sweepRadians` is how far the whole pie runs — a whole turn for a pie, less
// for a gauge. Fractions are therefore fractions OF THE SWEEP, which is what
// makes an explicit `total`'s remainder slice become a gauge's track with no
// extra machinery.
//
// These are the DATA angles: contiguous, and summing to exactly the drawn
// total. The inter-slice gap is deliberately NOT taken out here — a
// constant-width gap is an angular inset that VARIES with radius (see
// `resolveSliceInset`), so it can only be applied by the path builder, and
// everything that reasons about "which slice is at this bearing" (labels,
// hit-testing) wants the contiguous angles anyway.
export function layOutSliceAngles(
  sweepFractions: number[],
  opts: {
    startAngleDeg: number;
    direction: "clockwise" | "counterclockwise";
    sweepRadians?: number;
  },
): SliceAngles[] {
  const sign = opts.direction === "clockwise" ? 1 : -1;
  const sweepRadians = opts.sweepRadians ?? TWO_PI;
  let cursor = degreesToRadians(opts.startAngleDeg);

  return sweepFractions.map((fraction) => {
    const start = cursor;
    const end = start + sign * fraction * sweepRadians;
    cursor = end;
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

// The bounding box of an annular sector, in units of the OUTER radius, measured
// outward from the pie centre. This is pie's counterpart to map's projection
// bounds (MapUnitGeometry.contentHalfW/contentHalfH), and it drives the same
// four things: the cell fit, the recentring, the outside-label budget and the
// ideal aspect. A whole turn is the { 1, 1, 1, 1 } special case, which is
// precisely why a plain pie is untouched by any of it.
//
// The sector measured is the one the STYLE declares — see
// `resolvePieSilhouette`, which is the only caller that matters.
//
// A ring segment that stays on one side of an axis yields a NEGATIVE extent on
// the far side — the shape genuinely does not reach the centre line. That is
// intended: clamping it to 0 would make every such gauge smaller than the cell
// can hold. (A pie sector contains the hub, so its extents are >= 0 anyway.)
export type SilhouetteExtents = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const FULL_DISC_SILHOUETTE: SilhouetteExtents = {
  left: 1,
  right: 1,
  top: 1,
  bottom: 1,
};

// Whether the silhouette's bbox IS the disc's bbox. Callers use this to stay on
// their pre-gauge code path: the recentring arithmetic is NOT bit-identical to
// `slotRcd.centerX()` even when it is mathematically equal, so a full pie must
// keep taking the original route.
//
// It reads true for some PARTIAL sweeps, and that is correct rather than a false
// positive: any sweep past three quarters that starts on an axis contains all
// four axis directions, so its bounding box genuinely is the full disc's, and
// centring that box on the cell centre is genuinely right. What the flag means is
// "the disc bbox", never "a whole turn".
export function isFullDiscSilhouette(extents: SilhouetteExtents): boolean {
  return extents.left === 1 && extents.right === 1 && extents.top === 1 &&
    extents.bottom === 1;
}

// Exact, and no search is needed: the extrema of an annular sector are at its
// two radial endpoints (taken at both radii), at whichever of the four axis
// directions the sweep contains (taken at the outer radius — a point on the
// inner arc is dominated by the outer point at the same bearing), and at the
// hub when the sector is a pie rather than a ring segment.
export function silhouetteExtents(spec: {
  startAngle: number;
  endAngle: number;
  // Clamped, as `clampInnerRadiusRatio` returns it.
  innerRadiusRatio: number;
}): SilhouetteExtents {
  const sweep = Math.abs(spec.endAngle - spec.startAngle);
  // A sweep this close to the whole turn IS the disc. This is a short-circuit
  // for intent, not for correctness: a full turn contains all four axis
  // directions, and cos/sin at exact multiples of pi/2 give exactly +/-1, so the
  // general path below already returns exactly { 1, 1, 1, 1 }. Removing this is
  // behaviour-preserving, so expect it to survive mutation testing.
  if (sweep >= TWO_PI - FULL_TURN_EPSILON) {
    return { ...FULL_DISC_SILHOUETTE };
  }

  const lo = Math.min(spec.startAngle, spec.endAngle);
  const hi = Math.max(spec.startAngle, spec.endAngle);
  const ratio = spec.innerRadiusRatio;

  const points: { x: number; y: number }[] = [];
  for (const angle of [lo, hi]) {
    for (const r of [ratio, 1]) {
      points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
  }
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const axis = quadrant * (Math.PI / 2);
    if (normalizeTurn(axis - lo) <= sweep) {
      points.push({ x: Math.cos(axis), y: Math.sin(axis) });
    }
  }
  if (ratio <= 0) {
    points.push({ x: 0, y: 0 });
  }

  let left = -Infinity;
  let right = -Infinity;
  let top = -Infinity;
  let bottom = -Infinity;
  for (const p of points) {
    left = Math.max(left, -p.x);
    right = Math.max(right, p.x);
    top = Math.max(top, -p.y);
    bottom = Math.max(bottom, p.y);
  }
  return { left, right, top, bottom };
}

// The footprint the STYLE declares — the arc `startAngle` and `sweepAngle`
// reserve, whatever fraction of it the data goes on to fill.
//
// Declared, not drawn, and that is the whole point: a gauge's frame must not
// move as its value changes. Sizing a `remainder.mode: "gap"` cell on the ink
// alone would make the same gauge a different size at 30% and at 90%, and would
// give grid siblings with different values different centres. It also means a
// full-turn pie is the { 1, 1, 1, 1 } disc no matter what its data does, so
// every pre-gauge pie is measured exactly as before.
//
// Direction is load-bearing: 180 degrees clockwise from 9 o'clock is the top
// half, counterclockwise is the bottom half.
export function resolvePieSilhouette(
  mergedStyle: MergedPieStyle,
): SilhouetteExtents {
  const startAngle = degreesToRadians(mergedStyle.pie.startAngle);
  const sign = mergedStyle.pie.direction === "clockwise" ? 1 : -1;
  const sweep = degreesToRadians(
    clampSweepAngleDeg(mergedStyle.pie.sweepAngle),
  );
  return silhouetteExtents({
    startAngle,
    endAngle: startAngle + sign * sweep,
    innerRadiusRatio: clampInnerRadiusRatio(mergedStyle.pie.innerRadiusRatio),
  });
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
//
// `edgeInset` is the slice's own half-gap: with a gap the DRAWN shape is the
// sector narrowed by asin(edgeInset / r) at each radius, so a label judged
// against the bare sector would overhang into the gap. The inset is widest at
// the box's nearest radius, so applying it there is sufficient (and, being the
// tightest of the values it takes over the box, conservative).
export function wedgeFitsBox(
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
  boxCenter: { x: number; y: number },
  w: number,
  h: number,
  edgeInset = 0,
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

  const inset = edgeInset > 0
    ? Math.asin(Math.min(1, edgeInset / Math.hypot(nearX, nearY)))
    : 0;
  const arc = subtendedArc(boxCenter, halfW, halfH);
  const offset = normalizeTurn(arc.start - Math.min(startAngle, endAngle));
  return offset >= inset && offset + arc.length <= sweep - inset;
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
  // The full width of the gap between this slice and each of its neighbours.
  // Half of it is taken off each of this slice's own radial edges, as a
  // constant PERPENDICULAR distance from the boundary ray — so a gap is a
  // parallel-sided channel of exactly this width the whole way out, and the
  // slice reads as a band rather than a wedge whose gap fans open at the rim.
  sliceGap: number;
};

// How the gap reshapes one slice. The inset edge stays `halfGap` from the
// boundary ray at every radius, which means the angle it eats grows as the
// radius shrinks: asin(halfGap / r). Far enough in, the two inset edges meet
// and the slice ends in an apex instead of an inner arc.
type SliceInset = {
  halfGap: number;
  // Angular inset at the outer / inner radius.
  outerDelta: number;
  innerDelta: number;
  // Radius at which the two inset edges cross.
  apexR: number;
  useApex: boolean;
};

// undefined when the gap leaves no slice to draw at all.
function resolveSliceInset(p: SlicePathParams): SliceInset | undefined {
  const sweep = Math.abs(p.endAngle - p.startAngle);
  const halfGap = Math.max(0, p.sliceGap) / 2;
  if (halfGap >= p.outerR) return undefined;

  const outerDelta = Math.asin(halfGap / p.outerR);
  // A slice narrower than the gap is dropped rather than inverted — the same
  // contract a zero-sweep slice has always had.
  if (2 * outerDelta >= sweep) return undefined;

  // halfGap / sin(sweep/2) is exactly where the two inset edges cross, for any
  // sweep up to a half turn. Past a half turn they no longer bound the slice
  // near the centre at all, so the half-turn value (halfGap itself, the foot of
  // the perpendicular) is held rather than letting 1/sin run away as the sweep
  // approaches the full turn.
  const apexR = halfGap / Math.sin(Math.min(sweep, Math.PI) / 2);
  const useApex = p.innerR <= apexR;
  if (useApex && apexR >= p.outerR) return undefined;

  return {
    halfGap,
    outerDelta,
    // innerR > apexR >= halfGap here, so this asin is always in range.
    innerDelta: useApex ? 0 : Math.asin(halfGap / p.innerR),
    apexR,
    useApex,
  };
}

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

  // A full ring has no radial edges — no neighbour to gap against, no corner to
  // round or join — so it is two independent circles (outer forward, inner
  // back) and the even-odd fill rule punches the hole. A full disc is just the
  // outer circle.
  if (sweep >= TWO_PI - FULL_TURN_EPSILON) {
    appendCircle(segments, cx, cy, outerR, startAngle);
    if (innerR > 0) {
      appendCircle(segments, cx, cy, innerR, startAngle);
    }
    return segments;
  }

  const inset = resolveSliceInset(p);
  if (!inset) return segments;

  const corner = resolveCornerRadius(p, inset);
  if (corner > 0) {
    const rounded = buildRoundedSlicePath(p, inset, corner);
    if (rounded) return rounded;
  }
  return buildSquareSlicePath(p, inset);
}

// A point on one inset radial edge: `along` out from the centre along the
// boundary ray, then `halfGap` off it on the slice's own side.
function edgePoint(
  cx: number,
  cy: number,
  rayAngle: number,
  normalAngle: number,
  halfGap: number,
  along: number,
): { x: number; y: number } {
  return {
    x: cx + along * Math.cos(rayAngle) + halfGap * Math.cos(normalAngle),
    y: cy + along * Math.sin(rayAngle) + halfGap * Math.sin(normalAngle),
  };
}

function buildSquareSlicePath(
  p: SlicePathParams,
  inset: SliceInset,
): PathSegment[] {
  const { cx, cy, innerR, outerR, startAngle, endAngle } = p;
  const dir = endAngle > startAngle ? 1 : -1;
  const segments: PathSegment[] = [];

  const outerStartA = startAngle + dir * inset.outerDelta;
  const outerEndA = endAngle - dir * inset.outerDelta;
  const outerStart = polarPoint(cx, cy, outerR, outerStartA);
  // At zero gap the apex is the pie centre and this is the classic wedge.
  const tail = inset.useApex
    ? polarPoint(cx, cy, inset.apexR, (startAngle + endAngle) / 2)
    : polarPoint(cx, cy, innerR, startAngle + dir * inset.innerDelta);

  segments.push({ type: "moveTo", x: tail.x, y: tail.y });
  segments.push({ type: "lineTo", x: outerStart.x, y: outerStart.y });
  appendArc(segments, cx, cy, outerR, outerStartA, outerEndA);

  if (inset.useApex) {
    segments.push({ type: "lineTo", x: tail.x, y: tail.y });
    return segments;
  }

  const innerEndA = endAngle - dir * inset.innerDelta;
  const innerEnd = polarPoint(cx, cy, innerR, innerEndA);
  segments.push({ type: "lineTo", x: innerEnd.x, y: innerEnd.y });
  appendArc(
    segments,
    cx,
    cy,
    innerR,
    innerEndA,
    startAngle + dir * inset.innerDelta,
  );
  segments.push({ type: "lineTo", x: tail.x, y: tail.y });
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
// the outer radius when the wedge runs to an apex). Both are measured on the
// DRAWN wedge, so a gap — which shortens the thickness at an apex and narrows
// every chord — tightens the clamp with it.
function resolveCornerRadius(p: SlicePathParams, inset: SliceInset): number {
  if (p.cornerRadius <= 0) return 0;
  const sweep = Math.abs(p.endAngle - p.startAngle);
  const thickness = p.outerR - (inset.useApex ? inset.apexR : p.innerR);
  const limitingR = inset.useApex ? p.outerR : p.innerR;
  const drawnSweep = Math.max(
    0,
    sweep - 2 * (inset.useApex ? inset.outerDelta : inset.innerDelta),
  );
  const chord = 2 * limitingR * Math.sin(Math.min(drawnSweep, Math.PI) / 2);
  return Math.max(0, Math.min(p.cornerRadius, thickness / 2, chord / 2));
}

// Rounded wedge: each corner is replaced by a fillet arc of radius `corner`
// tangent to both the (inset) radial edge and the ring arc it meets. A fillet's
// centre lies at radius (outerR − corner) or (innerR + corner) AND at
// perpendicular distance (halfGap + corner) from the boundary ray, so its
// bearing is δ = asin((halfGap + corner) / thatRadius) off the ray — the plain
// asin(corner / centreR) at zero gap. It meets the ring arc at its own bearing,
// and the radial edge at the foot of the perpendicular, centreR·cos(δ) out
// along the ray. Traversing the wedge turns the same way at all four corners,
// so every fillet sweeps in the traversal direction.
//
// undefined when the wedge is too narrow to hold its fillets — the caller falls
// back to the square wedge rather than drawing an inverted arc.
function buildRoundedSlicePath(
  p: SlicePathParams,
  inset: SliceInset,
  corner: number,
): PathSegment[] | undefined {
  const { cx, cy, innerR, outerR, startAngle, endAngle } = p;
  const dir = endAngle > startAngle ? 1 : -1;
  const sweep = Math.abs(endAngle - startAngle);
  const quarter = Math.PI / 2;
  const halfGap = inset.halfGap;
  const offset = halfGap + corner;

  const outerCentreR = outerR - corner;
  if (offset >= outerCentreR) return undefined;
  const outerDelta = Math.asin(offset / outerCentreR);
  if (2 * outerDelta > sweep) return undefined;

  const innerCentreR = innerR + corner;
  if (!inset.useApex && offset >= innerCentreR) return undefined;
  const innerDelta = inset.useApex ? 0 : Math.asin(offset / innerCentreR);
  if (2 * innerDelta > sweep) return undefined;

  const outerStartA = startAngle + dir * outerDelta;
  const outerEndA = endAngle - dir * outerDelta;
  const innerStartA = startAngle + dir * innerDelta;
  const innerEndA = endAngle - dir * innerDelta;

  // How far out along each boundary ray the fillets touch their radial edge.
  const outerAlong = outerCentreR * Math.cos(outerDelta);
  const innerAlong = inset.useApex
    ? inset.apexR * Math.cos(sweep / 2)
    : innerCentreR * Math.cos(innerDelta);
  // No edge left between the two fillets (or between a fillet and the apex).
  if (outerAlong <= innerAlong) return undefined;

  const startNormal = startAngle + dir * quarter;
  const endNormal = endAngle - dir * quarter;

  const segments: PathSegment[] = [];
  const tail = inset.useApex
    ? polarPoint(cx, cy, inset.apexR, (startAngle + endAngle) / 2)
    : edgePoint(cx, cy, startAngle, startNormal, halfGap, innerAlong);
  const outerEdgeStart = edgePoint(
    cx,
    cy,
    startAngle,
    startNormal,
    halfGap,
    outerAlong,
  );

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

  if (!inset.useApex) {
    const innerEdgeEnd = edgePoint(
      cx,
      cy,
      endAngle,
      endNormal,
      halfGap,
      innerAlong,
    );
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
