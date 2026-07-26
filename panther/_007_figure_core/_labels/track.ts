// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The label track: the closed curve a constant clearance outside a figure's
// silhouette (plan N1). A pie's silhouette is a disc so its track comes out a
// circle — the circle is a CONSEQUENCE of the shape, never the model. A map's
// track is the country's own outline pushed outward, which is why it is
// extracted from the distance field rather than from a hull.

import type { DistanceField, Point } from "./distance_field.ts";

export type TrackPoint = {
  x: number;
  y: number;
  // Unit normal pointing AWAY from the silhouette.
  nx: number;
  ny: number;
};

// One closed curve. A silhouette with islands has several (plan N11), and each
// is ordered and relaxed independently — which is what keeps an island's labels
// beside the island.
export type TrackComponent = {
  length: number;
  // Position and outward normal at arc length t, wrapping at `length`.
  pointAt: (t: number) => TrackPoint;
  // The point on this component nearest p, as an arc length (plan N2).
  nearestTo: (p: Point) => { t: number; distance: number };
};

// WHAT THIS CURVE IS FOR, and how accurate it therefore has to be.
//
// The track supplies two things: each label's natural position (the nearest
// point on it, plan N2) and the arc-length ordering that collision relaxation
// runs along (N4). It is NOT what holds a label off the shape — that is done by
// bisecting `clearanceAt`, which is exact (see distance_field.ts), when the box
// is placed (N3). So a small positional error in the polyline costs a little
// ordering precision and nothing else.
//
// Measured on Kenya adm1 (159 rings, 19.6k points, 1 DU pitch): median error
// 0.000 DU, p90 0.013, p99 0.134, with 0.55% of samples up to 2 DU, confined to
// two short stretches at the southern tip where the coast has features finer
// than the clearance. Left as-is deliberately: tightening it would buy ordering
// precision nobody can see, and the invariant that matters is enforced
// elsewhere.
export type LabelTrack = {
  components: TrackComponent[];
  // Distance from a point to the SILHOUETTE — positive outside, negative
  // inside. This is what placement bisects against (plan N3); note it is the
  // silhouette, not the track.
  clearanceAt: (x: number, y: number) => number;
  // The nearest point on the whole track, across every component.
  nearestTo: (
    p: Point,
  ) => { component: number; t: number; distance: number } | undefined;
};

function trackFromComponents(
  components: TrackComponent[],
  clearanceAt: (x: number, y: number) => number,
): LabelTrack {
  return {
    components,
    clearanceAt,
    nearestTo: (p) => {
      let best: { component: number; t: number; distance: number } | undefined;
      for (let i = 0; i < components.length; i++) {
        const hit = components[i].nearestTo(p);
        if (!best || hit.distance < best.distance) {
          best = { component: i, t: hit.t, distance: hit.distance };
        }
      }
      return best;
    },
  };
}

// ---------------------------------------------------------------- the circle

export function circleTrack(
  cx: number,
  cy: number,
  radius: number,
  clearance: number,
): LabelTrack {
  const r = radius + clearance;
  const length = 2 * Math.PI * r;
  const component: TrackComponent = {
    length,
    pointAt: (t) => {
      const a = (((t % length) + length) % length) / r;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      return { x: cx + nx * r, y: cy + ny * r, nx, ny };
    },
    nearestTo: (p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy);
      // Dead centre has no nearest point; any is as good, so take bearing 0.
      const a = d === 0 ? 0 : Math.atan2(dy, dx);
      const t = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * r;
      return { t, distance: Math.abs(d - r) };
    },
  };
  return trackFromComponents(
    [component],
    (x, y) => Math.hypot(x - cx, y - cy) - radius,
  );
}

// ------------------------------------------------------- the real silhouette

function polylineComponent(
  points: Point[],
  normalAt: (p: Point) => { nx: number; ny: number },
): TrackComponent {
  const n = points.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const length = cum[n];

  return {
    length,
    pointAt: (t) => {
      const u = length === 0 ? 0 : (((t % length) + length) % length);
      // Binary search the cumulative table for the containing segment.
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= u) lo = mid;
        else hi = mid;
      }
      const a = points[lo];
      const b = points[(lo + 1) % n];
      const segLen = cum[lo + 1] - cum[lo];
      const f = segLen === 0 ? 0 : (u - cum[lo]) / segLen;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      return { ...p, ...normalAt(p) };
    },
    nearestTo: (p) => {
      let bestD = Infinity;
      let bestT = 0;
      for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        let f = 0;
        if (len2 > 0) {
          f = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
          f = f < 0 ? 0 : f > 1 ? 1 : f;
        }
        const qx = a.x + f * dx;
        const qy = a.y + f * dy;
        const d = Math.hypot(p.x - qx, p.y - qy);
        if (d < bestD) {
          bestD = d;
          bestT = cum[i] + f * Math.sqrt(len2);
        }
      }
      return { t: bestT, distance: bestD };
    },
  };
}

type RawSegment = { ax: number; ay: number; bx: number; by: number };

// Marching squares over the field's lattice at `level`. Emits undirected
// segments; chaining sorts out the loops, which avoids depending on a
// consistent case-table orientation.
function marchingSquares(
  field: DistanceField,
  level: number,
): RawSegment[] {
  const segs: RawSegment[] = [];
  const { cols, rows } = field;
  const lerp = (
    p: Point,
    q: Point,
    a: number,
    b: number,
  ): Point => {
    const denom = b - a;
    const f = denom === 0 ? 0.5 : (level - a) / denom;
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
  };

  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const v0 = field.sample(c, r);
      const v1 = field.sample(c + 1, r);
      const v2 = field.sample(c + 1, r + 1);
      const v3 = field.sample(c, r + 1);
      const idx = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) |
        (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;

      const p0 = field.samplePoint(c, r);
      const p1 = field.samplePoint(c + 1, r);
      const p2 = field.samplePoint(c + 1, r + 1);
      const p3 = field.samplePoint(c, r + 1);
      const top = () => lerp(p0, p1, v0, v1);
      const right = () => lerp(p1, p2, v1, v2);
      const bottom = () => lerp(p3, p2, v3, v2);
      const left = () => lerp(p0, p3, v0, v3);
      const push = (a: Point, b: Point) =>
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });

      switch (idx) {
        case 1:
        case 14:
          push(left(), top());
          break;
        case 2:
        case 13:
          push(top(), right());
          break;
        case 3:
        case 12:
          push(left(), right());
          break;
        case 4:
        case 11:
          push(right(), bottom());
          break;
        case 6:
        case 9:
          push(top(), bottom());
          break;
        case 7:
        case 8:
          push(left(), bottom());
          break;
        // Saddles: the cell centre decides which way the two arcs connect, so
        // a narrow isthmus does not get stitched into the wrong loop.
        case 5:
        case 10: {
          const centre = (v0 + v1 + v2 + v3) / 4;
          const joinedAcrossTopLeft = idx === 5
            ? centre >= level
            : centre < level;
          if (joinedAcrossTopLeft) {
            push(left(), top());
            push(right(), bottom());
          } else {
            push(top(), right());
            push(left(), bottom());
          }
          break;
        }
      }
    }
  }
  return segs;
}

// Chain undirected segments into closed loops by endpoint identity. Endpoints
// produced by neighbouring cells are bit-identical (same lerp on the same edge
// values), so keying on the coordinate pair is exact, not a tolerance match.
function chainLoops(segs: RawSegment[]): Point[][] {
  const key = (x: number, y: number) => `${x},${y}`;
  const ends = new Map<string, number[]>();
  const used = new Array<boolean>(segs.length).fill(false);
  const add = (k: string, i: number) => {
    const list = ends.get(k);
    if (list) list.push(i);
    else ends.set(k, [i]);
  };
  for (let i = 0; i < segs.length; i++) {
    add(key(segs[i].ax, segs[i].ay), i);
    add(key(segs[i].bx, segs[i].by), i);
  }

  const loops: Point[][] = [];
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const s = segs[start];
    const loop: Point[] = [{ x: s.ax, y: s.ay }];
    let cx = s.bx;
    let cy = s.by;
    const firstX = s.ax;
    const firstY = s.ay;

    for (;;) {
      loop.push({ x: cx, y: cy });
      if (cx === firstX && cy === firstY) break;
      const candidates = ends.get(key(cx, cy));
      if (!candidates) break;
      let next = -1;
      for (const i of candidates) {
        if (!used[i]) {
          next = i;
          break;
        }
      }
      if (next < 0) break;
      used[next] = true;
      const seg = segs[next];
      if (seg.ax === cx && seg.ay === cy) {
        cx = seg.bx;
        cy = seg.by;
      } else {
        cx = seg.ax;
        cy = seg.ay;
      }
    }
    // Drop the duplicated closing point, and anything too small to be a curve.
    if (loop.length > 3) {
      if (
        loop[loop.length - 1].x === loop[0].x &&
        loop[loop.length - 1].y === loop[0].y
      ) {
        loop.pop();
      }
      loops.push(loop);
    }
  }
  return loops;
}

// Extracting from the raster puts each vertex within about a pitch of the true
// level set. Pull it onto the exact level by stepping along the field gradient:
// the field is exact in this band (see distance_field.ts), so a few Newton
// steps land the vertex on the real curve rather than the rasterised one.
const REFINE_TOLERANCE_DU = 0.01;

function refineOntoLevel(
  field: DistanceField,
  p: Point,
  target: number,
): Point {
  const h = field.pitch * 0.5;
  const gradientAt = (x: number, y: number) => {
    const gx = (field.distanceAt(x + h, y) - field.distanceAt(x - h, y)) /
      (2 * h);
    const gy = (field.distanceAt(x, y + h) - field.distanceAt(x, y - h)) /
      (2 * h);
    return { gx, gy };
  };

  // Newton is only trusted for SHORT steps. Where the gradient is small — near
  // a medial axis, which is exactly where a coastline's offset curve misbehaves
  // — err*g/|g|^2 will happily teleport the vertex onto a different branch of
  // the level set, and any later refinement then perfects the wrong place.
  // Measured on Kenya: that was the whole of the residual error. Overstep and
  // we abandon Newton entirely rather than trusting where it landed.
  const maxStep = 2 * field.pitch;
  let { x, y } = p;
  for (let i = 0; i < 4; i++) {
    const err = field.distanceAt(x, y) - target;
    if (Math.abs(err) < REFINE_TOLERANCE_DU) return { x, y };
    const { gx, gy } = gradientAt(x, y);
    const g2 = gx * gx + gy * gy;
    if (g2 < 1e-12) break;
    const sx = (err * gx) / g2;
    const sy = (err * gy) / g2;
    if (Math.hypot(sx, sy) > maxStep) {
      x = p.x;
      y = p.y;
      break;
    }
    x -= sx;
    y -= sy;
  }

  // Newton is exact on a smooth offset but stalls at a cusp — a bay narrower
  // than twice the clearance, where the offset curve self-intersects and the
  // distance gradient is not defined. Measured on Kenya's coast: 0.7% of track
  // samples, off by up to 2.7 DU, which would break the "exactly calloutMargin"
  // invariant. Fall back to a bracketed bisection along the outward normal,
  // which converges whatever the gradient is doing.
  const err0 = field.distanceAt(x, y) - target;
  if (Math.abs(err0) < REFINE_TOLERANCE_DU) return { x, y };
  const { gx, gy } = gradientAt(x, y);
  const glen = Math.hypot(gx, gy);
  if (glen < 1e-12) return { x, y };
  // The signed distance falls as you move out, so -grad points outward.
  const ux = -gx / glen;
  const uy = -gy / glen;
  // Walk in whichever direction closes the error, until it changes sign.
  const dir = err0 > 0 ? 1 : -1;
  const step = field.pitch;
  let lo = 0;
  let hi = 0;
  let found = false;
  for (let i = 1; i <= 8; i++) {
    const s = dir * i * step;
    const err = field.distanceAt(x + ux * s, y + uy * s) - target;
    if ((err > 0) !== (err0 > 0)) {
      lo = dir * (i - 1) * step;
      hi = s;
      found = true;
      break;
    }
  }
  if (!found) return { x, y };
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const err = field.distanceAt(x + ux * mid, y + uy * mid) - target;
    if ((err > 0) === (err0 > 0)) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  return { x: x + ux * s, y: y + uy * s };
}

export function fieldTrack(
  field: DistanceField,
  clearance: number,
): LabelTrack {
  // The field is positive inside, so a point `clearance` outside sits at
  // -clearance.
  const level = -clearance;
  const loops = chainLoops(marchingSquares(field, level))
    .map((loop) => loop.map((p) => refineOntoLevel(field, p, level)))
    .filter((loop) => loop.length > 3);

  const h = field.pitch * 0.5;
  const normalAt = (p: Point) => {
    // The signed distance grows inward, so the outward normal is -grad.
    const gx =
      (field.distanceAt(p.x + h, p.y) - field.distanceAt(p.x - h, p.y)) /
      (2 * h);
    const gy =
      (field.distanceAt(p.x, p.y + h) - field.distanceAt(p.x, p.y - h)) /
      (2 * h);
    const len = Math.hypot(gx, gy);
    if (len < 1e-12) return { nx: 0, ny: 0 };
    return { nx: -gx / len, ny: -gy / len };
  };

  return trackFromComponents(
    loops.map((loop) => polylineComponent(loop, normalAt)),
    (x, y) => -field.distanceAt(x, y),
  );
}
