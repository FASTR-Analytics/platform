// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The one geometric primitive both halves of the label system read from: a
// signed distance field over a cell's silhouette, positive inside.
//
// It answers four questions with one build (plan I1):
//   - where inside a region a label should sit  -> interiorMax()
//   - how much room is there                    -> the value at that point
//   - how clear of the shape is a placed box    -> distanceAt() under the box
//   - where does the label track run            -> the -clearance level set
//
// Pie needs none of this (a disc is analytic); this is the map mechanism.

export type Point = { x: number; y: number };

export type DistanceField = {
  // Grid origin in figure coordinates, and the size of one cell.
  originX: number;
  originY: number;
  pitch: number;
  cols: number;
  rows: number;
  // Signed distance in figure units: positive inside the silhouette, negative
  // outside, bilinearly interpolated between samples.
  distanceAt: (x: number, y: number) => number;
  // The raw lattice value at a sample, clamped at the edges. Raster only — no
  // exact refinement — because contour extraction reads every sample and would
  // pay for accuracy it then refines away anyway.
  sample: (col: number, row: number) => number;
  // Figure coordinates of a lattice sample.
  samplePoint: (col: number, row: number) => Point;
  // The interior point furthest from the boundary — the pole of inaccessibility
  // (plan I2). Undefined when nothing was rasterised as inside.
  interiorMax: () => { point: Point; distance: number } | undefined;
};

// A closed ring of figure-space points. Holes are permitted: fill is even-odd,
// so an inner ring punches through.
export type Ring = Point[];

const INF = 1e20;

// Felzenszwalb & Huttenlocher's exact separable distance transform, in squared
// units, run per row then per column. Linear in samples.
function edt1d(f: Float64Array, n: number, out: Float64Array): void {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = q - v[k];
    out[q] = d * d + f[v[k]];
  }
}

function edt2d(
  grid: Float64Array,
  cols: number,
  rows: number,
): Float64Array {
  const out = new Float64Array(cols * rows);
  const rowIn = new Float64Array(cols);
  const rowOut = new Float64Array(cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) rowIn[c] = grid[r * cols + c];
    edt1d(rowIn, cols, rowOut);
    for (let c = 0; c < cols; c++) out[r * cols + c] = rowOut[c];
  }
  const colIn = new Float64Array(rows);
  const colOut = new Float64Array(rows);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) colIn[r] = out[r * cols + c];
    edt1d(colIn, rows, colOut);
    for (let r = 0; r < rows; r++) out[r * cols + c] = colOut[r];
  }
  return out;
}

// Even-odd scanline fill. Sample points are cell CENTRES, which keeps the
// rasterisation symmetric about the shape and avoids a half-pitch bias in the
// distances that come out of it.
function rasterise(
  rings: Ring[],
  originX: number,
  originY: number,
  pitch: number,
  cols: number,
  rows: number,
): Uint8Array {
  const inside = new Uint8Array(cols * rows);
  const xs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const y = originY + (r + 0.5) * pitch;
    xs.length = 0;
    for (const ring of rings) {
      const n = ring.length;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        // Half-open in y so a vertex shared by two edges is counted once.
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
    }
    if (xs.length === 0) continue;
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.ceil((xs[i] - originX) / pitch - 0.5);
      const to = Math.floor((xs[i + 1] - originX) / pitch - 0.5);
      for (let c = Math.max(0, from); c <= Math.min(cols - 1, to); c++) {
        inside[r * cols + c] = 1;
      }
    }
  }
  return inside;
}

export type BuildFieldOptions = {
  // Grid cell size in figure units. Plan-ruled default is 1 DU.
  pitch: number;
  // How far beyond the silhouette the field must remain valid — at least the
  // largest clearance any caller will query, or the track cannot be extracted.
  margin: number;
  // How far from the boundary a query is answered EXACTLY against the real
  // segments rather than off the raster. Defaults to the grid margin, which is
  // right for a caller whose margin is its query range.
  //
  // A caller that sizes its margin for a whole RANGE of content scales must set
  // this separately: the exact query costs ~8us against the raster's ~0.05us,
  // so tying the two together made a 47-label map cell spend 20 seconds in
  // 2.5 million exact queries that a 1 DU raster answer would have served.
  exactBand?: number;
};

// The raster alone is out by roughly the pitch (measured: 0.93 DU at a 1 DU
// pitch), which is 8% of a 12 DU clearance and would show as labels sitting
// unevenly off the shape. Rather than pay 4x the grid to halve that, every
// query within the band that placement actually reads — anywhere from just
// inside the silhouette out past the clearance — is answered EXACTLY against
// the real segments. The raster is left to serve the two queries that are
// happy with it: the sign, and the deep-interior maximum.
const EXACT_BAND_PAD_CELLS = 2;

type SegmentIndex = {
  // Segment endpoints, flattened: [ax, ay, bx, by, ...].
  seg: Float64Array;
  // Uniform bucket grid over the same extent, holding segment indices.
  buckets: Int32Array[];
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  cell: number;
};

function buildSegmentIndex(
  rings: Ring[],
  originX: number,
  originY: number,
  cell: number,
  cols: number,
  rows: number,
): SegmentIndex {
  const pts: number[] = [];
  for (const ring of rings) {
    const n = ring.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      pts.push(a.x, a.y, b.x, b.y);
    }
  }
  const seg = new Float64Array(pts);
  const lists: number[][] = Array.from({ length: cols * rows }, () => []);
  const count = seg.length / 4;
  for (let s = 0; s < count; s++) {
    const ax = seg[s * 4];
    const ay = seg[s * 4 + 1];
    const bx = seg[s * 4 + 2];
    const by = seg[s * 4 + 3];
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - originX) / cell));
    const c1 = Math.min(
      cols - 1,
      Math.floor((Math.max(ax, bx) - originX) / cell),
    );
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - originY) / cell));
    const r1 = Math.min(
      rows - 1,
      Math.floor((Math.max(ay, by) - originY) / cell),
    );
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) lists[r * cols + c].push(s);
    }
  }
  return {
    seg,
    buckets: lists.map((l) => Int32Array.from(l)),
    cols,
    rows,
    originX,
    originY,
    cell,
  };
}

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Exact distance to the nearest segment, searching buckets outward until the
// ring already searched cannot contain anything closer.
function exactDistance(index: SegmentIndex, x: number, y: number): number {
  const { cell, cols, rows, originX, originY, seg, buckets } = index;
  const cx = Math.floor((x - originX) / cell);
  const cy = Math.floor((y - originY) / cell);
  let best = Infinity;
  for (let ring = 0; ring < Math.max(cols, rows); ring++) {
    // Everything in this ring is at least (ring - 1) cells away.
    if (best < (ring - 1) * cell) break;
    let touched = false;
    for (let r = cy - ring; r <= cy + ring; r++) {
      if (r < 0 || r >= rows) continue;
      for (let c = cx - ring; c <= cx + ring; c++) {
        if (c < 0 || c >= cols) continue;
        // Only the perimeter of the ring is new.
        const onPerimeter = r === cy - ring || r === cy + ring ||
          c === cx - ring || c === cx + ring;
        if (!onPerimeter) continue;
        touched = true;
        for (const s of buckets[r * cols + c]) {
          const d = pointSegmentDistance(
            x,
            y,
            seg[s * 4],
            seg[s * 4 + 1],
            seg[s * 4 + 2],
            seg[s * 4 + 3],
          );
          if (d < best) best = d;
        }
      }
    }
    if (!touched && ring > 0 && best < Infinity) break;
  }
  return best;
}

export function buildDistanceField(
  rings: Ring[],
  opts: BuildFieldOptions,
): DistanceField {
  const { pitch, margin } = opts;
  if (!(pitch > 0)) throw new Error("distance field pitch must be positive");

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) {
    throw new Error("distance field needs at least one ring point");
  }

  // Pad by the margin plus a cell, so the level set is never clipped by the
  // grid edge and interpolation always has a neighbour to read.
  const pad = margin + 2 * pitch;
  const originX = minX - pad;
  const originY = minY - pad;
  const cols = Math.max(2, Math.ceil((maxX - minX + 2 * pad) / pitch));
  const rows = Math.max(2, Math.ceil((maxY - minY + 2 * pad) / pitch));

  const inside = rasterise(rings, originX, originY, pitch, cols, rows);

  // Two transforms: distance to the nearest inside cell (valid outside) and to
  // the nearest outside cell (valid inside). Combining them gives the sign.
  const seedOutside = new Float64Array(cols * rows);
  const seedInside = new Float64Array(cols * rows);
  for (let i = 0; i < inside.length; i++) {
    seedOutside[i] = inside[i] ? 0 : INF;
    seedInside[i] = inside[i] ? INF : 0;
  }
  const distToInside = edt2d(seedOutside, cols, rows);
  const distToOutside = edt2d(seedInside, cols, rows);

  const signed = new Float64Array(cols * rows);
  for (let i = 0; i < signed.length; i++) {
    signed[i] = inside[i]
      ? Math.sqrt(distToOutside[i]) * pitch
      : -Math.sqrt(distToInside[i]) * pitch;
  }

  const sampleAt = (c: number, r: number): number => {
    const cc = c < 0 ? 0 : c > cols - 1 ? cols - 1 : c;
    const rr = r < 0 ? 0 : r > rows - 1 ? rows - 1 : r;
    return signed[rr * cols + cc];
  };

  // A coarser bucket grid than the field: segment lists want to be short, not
  // numerous, and the exact query only ever runs within a few cells.
  const index = buildSegmentIndex(
    rings,
    originX,
    originY,
    pitch * 4,
    Math.max(1, Math.ceil((cols * pitch) / (pitch * 4))),
    Math.max(1, Math.ceil((rows * pitch) / (pitch * 4))),
  );
  const exactBand = (opts.exactBand ?? margin) + EXACT_BAND_PAD_CELLS * pitch;

  let cachedMax: { point: Point; distance: number } | undefined;
  let maxComputed = false;

  return {
    originX,
    originY,
    pitch,
    cols,
    rows,
    distanceAt: (x: number, y: number) => {
      const gx = (x - originX) / pitch - 0.5;
      const gy = (y - originY) / pitch - 0.5;
      const c0 = Math.floor(gx);
      const r0 = Math.floor(gy);
      const tx = gx - c0;
      const ty = gy - r0;
      const d00 = sampleAt(c0, r0);
      const d10 = sampleAt(c0 + 1, r0);
      const d01 = sampleAt(c0, r0 + 1);
      const d11 = sampleAt(c0 + 1, r0 + 1);
      const raster = (d00 * (1 - tx) + d10 * tx) * (1 - ty) +
        (d01 * (1 - tx) + d11 * tx) * ty;
      // Far from the boundary the raster is fine and the exact query would be
      // wasted work. Near it, take the sign from the raster (robust) and the
      // magnitude from the real segments (exact).
      if (Math.abs(raster) > exactBand) return raster;
      const exact = exactDistance(index, x, y);
      if (!Number.isFinite(exact)) return raster;
      return raster < 0 ? -exact : exact;
    },
    sample: sampleAt,
    samplePoint: (c: number, r: number) => ({
      x: originX + (c + 0.5) * pitch,
      y: originY + (r + 0.5) * pitch,
    }),
    interiorMax: () => {
      if (maxComputed) return cachedMax;
      maxComputed = true;
      let best = 0;
      let bestIndex = -1;
      for (let i = 0; i < signed.length; i++) {
        if (signed[i] > best) {
          best = signed[i];
          bestIndex = i;
        }
      }
      if (bestIndex < 0) return (cachedMax = undefined);
      const c = bestIndex % cols;
      const r = (bestIndex - c) / cols;
      cachedMax = {
        point: {
          x: originX + (c + 0.5) * pitch,
          y: originY + (r + 0.5) * pitch,
        },
        distance: best,
      };
      return cachedMax;
    },
  };
}
