// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The label-budget solver: the largest content scale s at which content plus
// its outside labels fit the cell. `fits` is injected — each figure derives it
// from its own outside placer's extents — so the solver stays pure and
// canvas-free.
//
// W(s)/H(s) are NOT assumed monotone in s: label terms have slope cos(θ) or 0,
// and pie's flank edge cx ± √(s² − dy²) is concave, so the feasible set can be
// a union of intervals. The solver scans downward from sMax before bisecting;
// any feasible band wider than the scan step is never stepped over. Sized so
// the step stays comfortably below the content legibility floor (~21 DU pie
// radius) for realistic cells.
export const SOLVE_SCAN_STEPS = 64;

// Bracket width at which bisection stops. Matches the codebase's convergence
// precedent (computeChartIdealHeightByMeasure, chart_size_helpers.ts).
export const SOLVE_TOLERANCE_DU = 0.5;

// Union bbox of (content at s) ∪ (label boxes the placer produces at s),
// measured outward from the content centre.
export type DirectionalExtents = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ContentScaleResult =
  | { kind: "ok"; s: number }
  // Nothing in [sFloor, sMax] fits; the caller decides (starvation → cramped).
  | { kind: "infeasible" };

export function solveContentScale(
  fits: (s: number) => boolean,
  sFloor: number,
  sMax: number,
): ContentScaleResult {
  // Degenerate domain: the label-free scale is at or below the floor. Content
  // may never outgrow its label-free size, so sMax is the only candidate.
  if (sMax <= sFloor) {
    return fits(sMax) ? { kind: "ok", s: sMax } : { kind: "infeasible" };
  }
  if (fits(sMax)) {
    return { kind: "ok", s: sMax };
  }

  // Scan downward for the largest fitting sample, sFloor included as the last
  // one. The floor is NOT assumed to fit: under nearest-point placement
  // shrinking `s` shortens the track while the label footprints stay fixed in
  // DU, so the feasible set can be a band that excludes the floor entirely — a
  // cell can be placeable at radius 190 and unplaceable at 21. Bailing on
  // `!fits(sFloor)` (as this did) reported such a cell infeasible without ever
  // looking at the band, which sent every one of them to the fallback placer.
  const step = (sMax - sFloor) / SOLVE_SCAN_STEPS;
  let found: number | undefined;
  let hi = sMax;
  for (let i = 1; i <= SOLVE_SCAN_STEPS; i++) {
    const s = i === SOLVE_SCAN_STEPS ? sFloor : sMax - i * step;
    if (fits(s)) {
      found = s;
      hi = sMax - (i - 1) * step;
      break;
    }
  }
  // Nothing in [sFloor, sMax] fits: the caller decides (starvation → cramped).
  if (found === undefined) {
    return { kind: "infeasible" };
  }
  let lo = found;

  // Bisect the bracket [lo fits, hi does not] onto the boundary. lo keeps the
  // fits invariant, so the returned s always fits.
  while (hi - lo > SOLVE_TOLERANCE_DU) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { kind: "ok", s: lo };
}
