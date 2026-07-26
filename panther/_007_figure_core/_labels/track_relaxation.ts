// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Order-preserving, minimum-displacement relaxation along a closed track
// (plan N4). Every label starts at its own nearest point and moves only because
// a neighbour physically forces it — so proximity is never traded away as a
// matter of policy, only as a matter of geometry.
//
// The problem: choose placed positions p_i on a circle of circumference L,
// preserving the cyclic order of the natural positions t_i, keeping each
// adjacent pair at least (a_i + a_j)/2 + gap apart, and minimising the total
// squared displacement. After the standard change of variables this is isotonic
// regression, which pool-adjacent-violators solves exactly in O(n) — no
// iteration count, no tuning constant, no "good enough" threshold.

export type TrackItem = {
  // Natural position: the arc length of the point on the track nearest this
  // label's anchor (plan N2).
  t: number;
  // Arc length this label occupies on the track once placed.
  footprint: number;
};

export type RelaxResult =
  | { kind: "ok"; positions: number[] }
  // The items cannot fit the track at all: the caller falls back (plan N10).
  | { kind: "infeasible" };

// Exact feasibility, not a heuristic: the n cyclic separations sum to exactly
// this, so it fits if and only if the total is within the circumference.
export function requiredTrackLength(items: TrackItem[], gap: number): number {
  let total = 0;
  for (const item of items) total += item.footprint;
  return total + items.length * gap;
}

// Pool-adjacent-violators: the least-squares non-decreasing fit to y.
function isotonic(y: number[]): number[] {
  const value: number[] = [];
  const weight: number[] = [];
  for (const yi of y) {
    let v = yi;
    let w = 1;
    while (value.length > 0 && value[value.length - 1] > v) {
      const pv = value.pop() as number;
      const pw = weight.pop() as number;
      v = (v * w + pv * pw) / (w + pw);
      w += pw;
    }
    value.push(v);
    weight.push(w);
  }
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    for (let j = 0; j < weight[i]; j++) out.push(value[i]);
  }
  return out;
}

// Minimum separation between two neighbours: half of each footprint, plus the
// label-to-label gap.
function separation(a: TrackItem, b: TrackItem, gap: number): number {
  return (a.footprint + b.footprint) / 2 + gap;
}

export function relaxOnTrack(
  items: TrackItem[],
  length: number,
  gap: number,
): RelaxResult {
  const n = items.length;
  if (n === 0) return { kind: "ok", positions: [] };
  if (!(length > 0)) return { kind: "infeasible" };
  if (requiredTrackLength(items, gap) > length) return { kind: "infeasible" };
  if (n === 1) return { kind: "ok", positions: [items[0].t] };

  const wrap = (t: number) => ((t % length) + length) % length;

  // Sort by natural position; ties keep input order so the result is
  // deterministic for identical anchors.
  const order = items
    .map((item, i) => ({ i, t: wrap(item.t) }))
    .sort((a, b) => a.t - b.t || a.i - b.i);

  // Cut the circle at the largest natural gap: that is where the wrap
  // constraint has the most slack, so it is the least likely to bind, and it
  // makes the choice deterministic rather than dependent on where t = 0 falls.
  let cutAfter = n - 1;
  let widest = -Infinity;
  for (let k = 0; k < n; k++) {
    const next = (k + 1) % n;
    const g = k === n - 1
      ? order[0].t + length - order[n - 1].t
      : order[next].t - order[k].t;
    if (g > widest) {
      widest = g;
      cutAfter = k;
    }
  }

  // Re-index so the sequence starts just after the cut, and unwrap it onto the
  // line: from here the problem is linear, plus one span constraint.
  const seq = Array.from(
    { length: n },
    (_, j) => order[(cutAfter + 1 + j) % n],
  );
  const start = seq[0].t;
  const u = seq.map((entry, j) => {
    const raw = entry.t - start;
    return j === 0 ? 0 : raw < 0 ? raw + length : raw;
  });

  // Cumulative minimum offsets: subtracting them turns "at least d_i apart"
  // into "non-decreasing", which is what isotonic regression solves.
  const c = new Array<number>(n).fill(0);
  for (let j = 1; j < n; j++) {
    c[j] = c[j - 1] +
      separation(items[seq[j - 1].i], items[seq[j].i], gap);
  }

  // The cyclic constraint becomes an upper bound on the span in q-space.
  const wrapSeparation = separation(items[seq[n - 1].i], items[seq[0].i], gap);
  const spanBudget = length - wrapSeparation - c[n - 1];

  const y = u.map((ui, j) => ui - c[j]);
  let q = isotonic(y);

  if (q[n - 1] - q[0] > spanBudget) {
    // The span constraint binds. Pull the ends together with a Lagrange
    // multiplier — the span is monotone in it, so bisection lands on the exact
    // constrained optimum rather than an arbitrary clamp.
    let lo = 0;
    let hi = Math.max(1, q[n - 1] - q[0]);
    for (let iter = 0; iter < 60; iter++) {
      const mid = (lo + hi) / 2;
      const shifted = y.slice();
      shifted[0] += mid;
      shifted[n - 1] -= mid;
      const trial = isotonic(shifted);
      if (trial[n - 1] - trial[0] > spanBudget) lo = mid;
      else hi = mid;
    }
    const shifted = y.slice();
    shifted[0] += hi;
    shifted[n - 1] -= hi;
    q = isotonic(shifted);
  }

  const positions = new Array<number>(n);
  for (let j = 0; j < n; j++) {
    positions[seq[j].i] = wrap(start + q[j] + c[j]);
  }
  return { kind: "ok", positions };
}

// Signed displacement from a label's natural position to where it was placed,
// taking the shorter way round. Reported as a metric (plan: `displacement`),
// and the quantity the relaxation minimises the square of.
export function trackDisplacement(
  natural: number,
  placed: number,
  length: number,
): number {
  let d = (placed - natural) % length;
  if (d > length / 2) d -= length;
  if (d < -length / 2) d += length;
  return d;
}
