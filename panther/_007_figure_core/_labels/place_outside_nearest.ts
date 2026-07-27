// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The nearest-point outside placer (plan N2/N3/N4): the pure peer of the flank
// placer in generate_label_primitives.ts. Given label boxes, their anchors and
// a track, it returns where each box goes — nothing here knows about pies,
// maps, primitives or canvases.
//
// Each label goes to the point on the track nearest its own anchor (N2), is
// anchored by the point where the ray exits its box rather than by its nearest
// corner (N3), and moves along the track only when a neighbour forces it (N4).

import type { LabelTrack, TrackComponent } from "./track.ts";
import type { Point } from "./distance_field.ts";
import {
  relaxOnTrack,
  trackDisplacement,
  type TrackItem,
} from "./track_relaxation.ts";

export type NearestLabelInput = {
  // Where the label's own element is — a pie slice's mid-radius point, a map
  // region's interior anchor. The nearest track point to THIS is where the
  // label wants to be.
  anchor: Point;
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
};

export type NearestPlacedBox = {
  // Pass straight to the primitive alongside `align`.
  position: Point;
  align: { h: "left" | "center" | "right"; v: "middle" };
  // The padded box's point nearest the silhouette. This is the CLEARANCE
  // measure — how close the label came to the shape — and what N5 tests to
  // decide whether a leader is earned. It is NOT where a leader should end:
  // see `center`.
  touch: Point;
  // Centre of the padded box. A leader aims here and the renderer clamps it to
  // where it first meets the box, so the join is where the straight run from
  // the anchor actually reaches the label.
  center: Point;
  // Arc length this label sits off the point on the track nearest its anchor.
  // Zero unless something forced it, which is the property the whole design
  // turns on.
  displacement: number;
  // The part of `displacement` the SHAPE forced rather than a neighbour: how
  // far along the track the label had to slide before its box could be placed
  // at all. Zero on any convex silhouette, and zero for a pie always. Reported
  // separately so "labels only move when a neighbour forces them" stays a
  // checkable claim rather than being quietly diluted by coastline geometry.
  //
  // Measured from the slot the label was SEEKING, which is its own nearest
  // point until an untangle swap hands it a neighbour's (see
  // `untangleLeaders`). That keeps this the shape's share alone; the swap's
  // share stays where it belongs, in `displacement`.
  shapeDisplacement: number;
};

export type NearestPlacementOptions = {
  // Label-to-label spacing along the track (labelCollision.gap).
  gap: number;
  // Silhouette-to-label clearance at the anchor point (calloutMargin).
  clearance: number;
  // How close any part of a padded box may come to the silhouette where its
  // corner leads (labelClearanceFloor; plan-ruled default 4).
  clearanceFloor: number;
  // Direction at which text alignment flips from centred to edge-aligned
  // (labelAlignmentSwitchAngle; plan-ruled default 45).
  alignmentSwitchAngleDeg: number;
  // May two labels exchange track slots to uncross their leaders (plan step
  // 10)? MAP ONLY, and it is not a style option: on a pie the angular order is
  // not a seed to be improved, it IS the meaning — a slice's label has to sit
  // beside its own slice, and swapping two of them would move a label away
  // from the thing it names to buy a crossing that does not exist. Pie
  // measures zero crossings on every case because the placement is right, and
  // passing `false` is what keeps that a property rather than a habit.
  untangleLeaders: boolean;
};

export type NearestPlacementResult =
  | { kind: "ok"; boxes: NearestPlacedBox[] }
  // The track cannot hold these labels; the caller falls back to flank (N10).
  | { kind: "infeasible" };

type Box = { cx: number; cy: number; hw: number; hh: number };

const RELAX_PASSES = 2;

// The relaxation separates labels along ARC LENGTH, and a footprint is how much
// arc a box takes. That is exact on a straight or circular track: rays that
// diverge spread neighbouring boxes apart, rays that converge crowd them, and
// the measured shadow tracks both. On a real coastline it is not, for two
// reasons that show up together. The shadow is the CONTIGUOUS run of rays that
// meet the box, so an inlet narrower than the walk's own step ends the run
// early and reports a 219 DU label as occupying 30 DU of track (measured: DRC
// on East Africa). And a label the shape refuses at its relaxed position slides
// to seat itself, which the relaxation never sees.
//
// So arc length is treated as what it is — a proxy — and the answer is checked
// against the boxes that will actually be drawn. Any pair still overlapping
// contributes the arc it was short by (`repairArc`) to both its labels'
// footprints, and the whole relaxation re-runs from the seated positions. This
// terminates either way: it converges on a layout with room, or the added arc
// carries the exact feasibility test past the track length and the cell falls
// back to flank (N10) — the honest answer for a track that cannot hold its
// labels.
//
// A layout with no overlaps — every pie, and any map whose track is smooth
// enough — leaves at the first check having done exactly the work it did before.
const REPAIR_ROUNDS = 8;
// Below this the two boxes are effectively concentric and the local exchange
// rate between arc and DU is unreadable; fall back to the cap.
const REPAIR_MIN_SEPARATION_DU = 1;
// A pair that needs more arc than this per DU is on a stretch of track so folded
// that separating them would drag a label right off its own region. Capping the
// ask is what makes the round budget bite instead of one pathological pair
// eating the whole track.
const REPAIR_MAX_ARC_PER_DU = 4;
// Enough to clear the overlap outright rather than land exactly on it.
const REPAIR_SLACK_DU = 1;
// Passes the untangle sweep may run (plan step 10). A pass costs a whole
// re-placement, so both of these are cost bounds first: the sweep keeps the best
// layout it has seen, so stopping early only ever forgoes a further gain.
const UNTANGLE_SWEEPS = 4;
// Passes without a new best tolerated before it gives up.
const UNTANGLE_PATIENCE = 1;
// Exchange rounds inside one pass's forecast. That search converges long before
// this on anything real — every exchange strictly shortens two segments, so it
// cannot cycle — and the bound is a backstop, not a schedule.
const UNTANGLE_FORECAST_ROUNDS = 64;

function paddedSize(input: NearestLabelInput) {
  return {
    w: input.width + input.padLeft + input.padRight,
    h: input.height + input.padTop + input.padBottom,
  };
}

// The distance from a track point to the box centre at which the ray along the
// normal first meets the box boundary exactly at the track point (plan N3).
// At a cardinal direction this is half the box's width or height, so the label
// touches by the middle of an edge — which is what puts a label flat above a
// pie instead of floating out on a corner.
function rayExitHalfChord(
  nx: number,
  ny: number,
  hw: number,
  hh: number,
): number {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const tx = ax > 1e-12 ? hw / ax : Infinity;
  const ty = ay > 1e-12 ? hh / ay : Infinity;
  return Math.min(tx, ty);
}

// How closely the box's nearest point is pinned down. Well under the 4 DU
// clearance floor it is tested against.
const CLEARANCE_TOLERANCE_DU = 0.01;
const EDGE_SEARCH_TOLERANCE_DU = 0.05;

// The box's closest approach to the silhouette, and where on its perimeter it
// happens. The box is convex and lies outside the shape, so the minimum is on
// the perimeter.
//
// Sampling the perimeter at a fixed count per side is not good enough and the
// failure is silent: on a small track the true nearest point of a long edge
// falls BETWEEN samples, and the box is declared clear when a corner is not
// (measured: a 220 DU label on a 20 DU pie breached the 4 DU floor by 4.6 DU
// and ended up 0.6 DU INSIDE the shape). `clearanceAt` is a distance function
// and therefore 1-Lipschitz, so the minimum over a sub-segment is at least
// `min(ends) - length/2`. That bound turns blind sampling into a branch and
// bound that is exact to a tolerance and cheaper besides.
//
// `stopBelow` is the threshold the caller is testing against: sub-segments
// proven to stay above it are pruned, and the search abandons as soon as the
// answer is known to be under it. The result is then only guaranteed on the
// correct side of that threshold, which is all a floor test asks. Leave it
// unset to get the true nearest point.
function boxClearance(
  track: LabelTrack,
  box: Box,
  stopBelow = -Infinity,
): { clearance: number; point: Point } {
  const corners: Point[] = [
    { x: box.cx - box.hw, y: box.cy - box.hh },
    { x: box.cx + box.hw, y: box.cy - box.hh },
    { x: box.cx + box.hw, y: box.cy + box.hh },
    { x: box.cx - box.hw, y: box.cy + box.hh },
  ];
  const values = corners.map((c) => track.clearanceAt(c.x, c.y));

  let clearance = Infinity;
  let point = corners[0];
  const consider = (p: Point, d: number) => {
    if (d < clearance) {
      clearance = d;
      point = p;
    }
  };
  for (let i = 0; i < 4; i++) consider(corners[i], values[i]);

  type Span = { a: Point; da: number; b: Point; db: number };
  const stack: Span[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    stack.push({ a: corners[i], da: values[i], b: corners[j], db: values[j] });
  }

  while (stack.length > 0) {
    if (clearance < stopBelow) break;
    const span = stack.pop() as Span;
    const length = Math.hypot(span.b.x - span.a.x, span.b.y - span.a.y);
    const lowestPossible = Math.min(span.da, span.db) - length / 2;
    if (
      lowestPossible >=
        Math.max(clearance - EDGE_SEARCH_TOLERANCE_DU, stopBelow)
    ) {
      continue;
    }
    const mid: Point = {
      x: (span.a.x + span.b.x) / 2,
      y: (span.a.y + span.b.y) / 2,
    };
    const dMid = track.clearanceAt(mid.x, mid.y);
    consider(mid, dMid);
    stack.push({ a: span.a, da: span.da, b: mid, db: dMid });
    stack.push({ a: mid, da: dMid, b: span.b, db: span.db });
  }
  return { clearance, point };
}

// Place the padded box on the ray leaving the track point, as close in as the
// two N3 constraints allow. Undefined when no distance along the ray clears the
// floor WITHIN the cap below — which happens whenever another part of the
// silhouette lies outward of this track point, a second island being the
// ordinary case. Emitting the box anyway would draw the label on top of that
// other island; the remedy is to slide along the track instead (see seatBox).
function placeBoxAt(
  track: LabelTrack,
  p: { x: number; y: number; nx: number; ny: number },
  hw: number,
  hh: number,
  opts: NearestPlacementOptions,
): Box | undefined {
  const dRay = rayExitHalfChord(p.nx, p.ny, hw, hh);
  const at = (d: number): Box => ({
    cx: p.x + p.nx * d,
    cy: p.y + p.ny * d,
    hw,
    hh,
  });
  const clears = (box: Box): boolean =>
    boxClearance(track, box, opts.clearanceFloor).clearance >=
      opts.clearanceFloor;

  const box = at(dRay);
  if (clears(box)) return box;

  // The corner leads and has cut inside the floor: push out along the ray only
  // as far as the floor demands.
  //
  // The bracket is the support-function distance. On a CONVEX silhouette that
  // is a guaranteed-clearing upper bound, so the bisection below always has an
  // answer. On a concave or multi-component one it is not a bound at all —
  // there may be land further out, and clearance along the ray is not even
  // monotone (measured on East Africa: Malawi's ray reads −2.7, −15.2, −5.9,
  // +28.6 DU as it goes out). It is kept anyway, now as a deliberate CAP on how
  // far out a label may be shoved: closeness is the governing clause of the
  // requirement, and a label 122 DU out to sea is not beside Malawi. When the
  // cap is not met the caller gives way along arc length instead.
  let lo = dRay;
  let hi = dRay + hw + hh + opts.clearance;
  if (!clears(at(hi))) return undefined;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (clears(at(mid))) hi = mid;
    else lo = mid;
    if (hi - lo < CLEARANCE_TOLERANCE_DU) break;
  }
  return at(hi);
}

// Scanning granularity when the nearest point has no seat. A step no larger
// than the box's own smaller half-dimension cannot stride over a window the box
// would have fitted in.
const SEEK_MIN_STEP_DU = 2;
const SEEK_REFINE_STEPS = 6;
// How far the shape may push a label along the track, as a multiple of the
// label's own padded perimeter half-length. Both a quality bound and a cost
// bound, and it is the same argument for each: a label dragged several times
// its own size around a coastline is no longer beside the thing it names, so
// there is nothing to buy by looking further — and looking further is what a
// 47-label adm1 map spends its whole time on, since every one of its labels is
// stuck and every one would otherwise scan half the coastline.
const SEEK_REACH_FOOTPRINTS = 3;

type Seat = { t: number; box: Box };

// One component's settled placement, indexed by label. Produced whole from a
// vector of slots so the untangle sweep can try an alternative and keep the
// better of the two.
type ComponentLayout = {
  placedT: number[];
  seatedT: number[];
  boxes: Box[];
};

// The nearest point on the track at which THIS label's box can actually be
// placed (plan N2, as widened at the step-4 gate).
//
// "The nearest point on the track" is a total rule only on a convex silhouette,
// where every track point has open space outward. On a real coastline it is
// not: the nearest point to an interior region can face more land, and the box
// has nowhere to go. Measured on East Africa, 5 of 19 labels had no seat at
// their nearest point — and because relaxation only moves a label when a
// NEIGHBOUR forces it, a single refusal used to fail the entire cell to flank.
//
// So the shape gets to force a displacement too, along the same axis a
// neighbour would: arc length. The objective is unchanged — be as close to the
// anchor as possible — and the amount given away is reported as
// `shapeDisplacement` rather than folded silently into the total.
function seatBox(
  track: LabelTrack,
  component: TrackComponent,
  t0: number,
  hw: number,
  hh: number,
  opts: NearestPlacementOptions,
): Seat | undefined {
  const at = (t: number) =>
    placeBoxAt(track, component.pointAt(t), hw, hh, opts);

  const direct = at(t0);
  if (direct) return { t: t0, box: direct };

  const step = Math.max(SEEK_MIN_STEP_DU, Math.min(hw, hh));
  const limit = Math.min(
    component.length / 2,
    SEEK_REACH_FOOTPRINTS * 2 * (hw + hh),
  );
  for (let d = step; d <= limit; d += step) {
    // Both directions at each distance, so the first hit is the nearest one.
    // The tie goes to the positive direction, which only has to be decided the
    // same way every time.
    for (const sign of [1, -1]) {
      const box = at(t0 + sign * d);
      if (!box) continue;
      // The seat was found at a sampled point; the boundary is somewhere in the
      // step before it. Walk back toward t0 — every step of that is arc length
      // handed back to proximity.
      let good: Seat = { t: t0 + sign * d, box };
      let goodD = d;
      let badD = d - step;
      for (let k = 0; k < SEEK_REFINE_STEPS; k++) {
        const midD = (goodD + badD) / 2;
        const candidate = at(t0 + sign * midD);
        if (candidate) {
          good = { t: t0 + sign * midD, box: candidate };
          goodD = midD;
        } else {
          badD = midD;
        }
      }
      return good;
    }
  }
  return undefined;
}

// Does the outward ray from this track point meet the box?
function rayHitsBox(
  p: { x: number; y: number; nx: number; ny: number },
  box: Box,
): boolean {
  // Slab test along the ray, restricted to t >= 0.
  let tMin = 0;
  let tMax = Infinity;
  const test = (origin: number, dir: number, lo: number, hi: number) => {
    if (Math.abs(dir) < 1e-12) return origin >= lo && origin <= hi;
    const t1 = (lo - origin) / dir;
    const t2 = (hi - origin) / dir;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return true;
  };
  if (!test(p.x, p.nx, box.cx - box.hw, box.cx + box.hw)) return false;
  if (!test(p.y, p.ny, box.cy - box.hh, box.cy + box.hh)) return false;
  return tMax >= tMin;
}

// How much of the track this box shadows — the arc-length interval whose
// outward rays meet it (plan N4's footprint). Measured rather than projected:
// the tangential projection under-spaces wide labels on a curved track, which
// turns "no overlaps" from a property into a hope.
//
// It is the CONTIGUOUS run of hits, and it is exact on a smooth track. On a
// coastline it can under-report badly, which is what `repairArc` measures and
// corrects — taking the outermost hit instead was tried and over-reports just as
// badly in the other direction (a distant headland aims its rays at the box),
// which turned a 16-label Kenya that places cleanly into a whole-cell fallback.
function shadowFootprint(
  component: TrackComponent,
  t: number,
  box: Box,
): number {
  const estimate = 2 * (box.hw + box.hh);
  const step = Math.max(estimate / 16, 0.25);
  const limit = Math.min(estimate * 3, component.length / 2);

  const reach = (sign: number): number => {
    let last = 0;
    for (let d = step; d <= limit; d += step) {
      if (!rayHitsBox(component.pointAt(t + sign * d), box)) break;
      last = d;
    }
    return last + step; // one step of slack: the ray stopped somewhere inside it
  };

  return Math.min(reach(1) + reach(-1), component.length);
}

// Two boxes that came out overlapping: how much further apart along the track
// they need to be, measured on the boxes themselves rather than assumed from
// the footprints that failed to separate them.
//
// The relaxation works in arc length; overlap is a fact about Cartesian boxes.
// On a smooth track the two agree up to the curvature factor the shadow already
// carries. Where a track dives into an inlet and back they do not, and the
// honest way to learn the local exchange rate is to read it off the pair that
// is actually in trouble: `arcPerDu` is how much arc buys one DU of separation
// right there.
function repairArc(
  a: Box,
  b: Box,
  arcApart: number,
): number {
  // The cheaper axis to separate on. Clearing either one clears the overlap.
  const shortfall = Math.min(
    a.hw + b.hw - Math.abs(a.cx - b.cx),
    a.hh + b.hh - Math.abs(a.cy - b.cy),
  );
  if (!(shortfall > 0)) return 0;
  const apart = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const arcPerDu = apart > REPAIR_MIN_SEPARATION_DU && arcApart > 0
    ? Math.min(arcApart / apart, REPAIR_MAX_ARC_PER_DU)
    : REPAIR_MAX_ARC_PER_DU;
  return (shortfall + REPAIR_SLACK_DU) * arcPerDu;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return Math.abs(a.cx - b.cx) < a.hw + b.hw - 1e-9 &&
    Math.abs(a.cy - b.cy) < a.hh + b.hh - 1e-9;
}

// Do the two segments properly cross? Shared endpoints and collinear touching
// are not what "a line crossing looks bad" means, and counting them would set
// the untangle sweep chasing pairs no swap can separate.
function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(a1, a2, b1);
  const d2 = side(a1, a2, b2);
  const d3 = side(b1, b2, a1);
  const d4 = side(b1, b2, a2);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

function alignmentFor(
  nx: number,
  ny: number,
  switchAngleDeg: number,
): "left" | "center" | "right" {
  const deg = (Math.atan2(ny, nx) * 180) / Math.PI;
  const abs = Math.abs(deg);
  if (abs <= switchAngleDeg) return "left";
  if (abs >= 180 - switchAngleDeg) return "right";
  return "center";
}

export function placeNearestBoxes(
  inputs: NearestLabelInput[],
  track: LabelTrack,
  opts: NearestPlacementOptions,
): NearestPlacementResult {
  if (inputs.length === 0) return { kind: "ok", boxes: [] };
  if (track.components.length === 0) return { kind: "infeasible" };

  // N2: every label's natural position is the point on the track nearest its
  // own anchor. Which component that lands on is what keeps an island's labels
  // beside the island (N11).
  const natural = inputs.map((input) => {
    const hit = track.nearestTo(input.anchor);
    if (!hit) return undefined;
    return { component: hit.component, t: hit.t };
  });
  if (natural.some((n) => n === undefined)) return { kind: "infeasible" };

  const byComponent = new Map<number, number[]>();
  for (let i = 0; i < inputs.length; i++) {
    const key = natural[i]!.component;
    const list = byComponent.get(key);
    if (list) list.push(i);
    else byComponent.set(key, [i]);
  }

  const placedT = natural.map((n) => n!.t);
  const boxes = new Array<Box>(inputs.length);
  // Where each label WOULD sit with no neighbours: its nearest point, or the
  // nearest point that can seat it when the shape refuses that one.
  const seatedT = natural.map((n) => n!.t);
  // The slot each label is seeking. Its own nearest point, until the untangle
  // sweep hands it a neighbour's.
  const seedT = natural.map((n) => n!.t);

  for (const [componentIndex, members] of byComponent) {
    const component = track.components[componentIndex];
    const seat = (i: number, t: number): Seat | undefined => {
      const { w, h } = paddedSize(inputs[i]);
      return seatBox(track, component, t, w / 2, h / 2, opts);
    };

    // One whole placement, from a vector of slots to the boxes that would be
    // drawn. `ordering` is the sequence the labels are handed to the relaxation
    // in, which is its tie-break when two slots coincide — so it is half of what
    // an untangle swap has to exchange (see swapCrossingNeighbours).
    //
    // Undefined where this used to return "infeasible" outright: with the
    // untangle sweep above it, a seed vector that cannot be placed is a swap to
    // reject, not necessarily a cell to fail.
    const layoutFrom = (
      seeds: number[],
      ordering: number[],
    ): ComponentLayout | undefined => {
      const placed = new Array<number>(inputs.length);
      const seated = new Array<number>(inputs.length);
      const placedBoxes = new Array<Box>(inputs.length);

      // The shape has its say first, before any neighbour does: a label the
      // coastline pushes 40 DU along the track is 40 DU along the track from
      // where relaxation should then treat it as wanting to be.
      for (const i of ordering) {
        const s = seat(i, seeds[i]);
        if (!s) return undefined;
        seated[i] = s.t;
        placed[i] = s.t;
        placedBoxes[i] = s.box;
      }

      // Arc length is a proxy for room, and on a real coastline an imperfect
      // one (see REPAIR_ROUNDS). Each round re-runs the whole relaxation from
      // the seated positions with the extra arc measured so far added on, so a
      // round is a pure function of that vector rather than of wherever the
      // previous round happened to leave the labels.
      const extraArc = new Map<number, number>();
      for (let round = 0;; round++) {
        for (const i of ordering) placed[i] = seated[i];

        // Footprints depend on where a box ends up, and where it ends up
        // depends on the footprints. Two passes settles it: measure at the
        // natural placement, relax, measure again where they landed, relax once
        // more. Bounded and deterministic — no convergence loop.
        for (let pass = 0; pass < RELAX_PASSES; pass++) {
          const items: TrackItem[] = [];
          for (const i of ordering) {
            const s = seat(i, placed[i]);
            if (!s) return undefined;
            placed[i] = s.t;
            placedBoxes[i] = s.box;
            items.push({
              // Displacement is always measured from the SEATED position, never
              // from where the previous pass left the label: the objective N4
              // minimises is distance from the closest place this label can go,
              // and re-anchoring on the last pass would let it drift one pass
              // at a time.
              t: seated[i],
              footprint: shadowFootprint(component, placed[i], s.box) +
                (extraArc.get(i) ?? 0),
            });
          }

          const relaxed = relaxOnTrack(items, component.length, opts.gap);
          if (relaxed.kind === "infeasible") return undefined;
          for (let k = 0; k < ordering.length; k++) {
            placed[ordering[k]] = relaxed.positions[k];
          }
        }

        // Final placement at the settled positions. Seating can slide a label
        // that the shape refuses at its relaxed position, so this is also the
        // first moment the emitted geometry exists — which is why the overlap
        // test below comes after it and not after the relaxation.
        for (const i of ordering) {
          const s = seat(i, placed[i]);
          if (!s) return undefined;
          placed[i] = s.t;
          placedBoxes[i] = s.box;
        }

        let crowded = false;
        for (let a = 0; a < ordering.length; a++) {
          for (let b = a + 1; b < ordering.length; b++) {
            const i = ordering[a];
            const j = ordering[b];
            if (!boxesOverlap(placedBoxes[i], placedBoxes[j])) continue;
            crowded = true;
            const owed = repairArc(
              placedBoxes[i],
              placedBoxes[j],
              Math.abs(
                trackDisplacement(placed[i], placed[j], component.length),
              ),
            );
            extraArc.set(i, (extraArc.get(i) ?? 0) + owed);
            extraArc.set(j, (extraArc.get(j) ?? 0) + owed);
          }
        }
        if (!crowded) {
          return { placedT: placed, seatedT: seated, boxes: placedBoxes };
        }
        if (round >= REPAIR_ROUNDS) return undefined;
      }
    };

    // A leader runs from the label's anchor to its box; the renderer clamps the
    // far end to the box boundary, which can only remove a crossing, never add
    // one. So counting on the untrimmed run is the conservative reading, and it
    // is the one the whole sweep is judged on. Every map leader is drawn — the
    // anchor is deep inside the silhouette, so N5's earned-distance test always
    // passes — and the sweep is map-only, so there are no undrawn leaders here
    // to chase.
    const leadersCross = (
      layout: ComponentLayout,
      i: number,
      j: number,
    ): boolean => {
      const bi = layout.boxes[i];
      const bj = layout.boxes[j];
      return segmentsCross(
        inputs[i].anchor,
        { x: bi.cx, y: bi.cy },
        inputs[j].anchor,
        { x: bj.cx, y: bj.cy },
      );
    };

    const crossingCount = (layout: ComponentLayout): number => {
      let n = 0;
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          if (leadersCross(layout, members[a], members[b])) n++;
        }
      }
      return n;
    };

    // One pass of the untangle sweep: work out which label should own which of
    // the slots this layout produced, then hand that permutation back for a real
    // re-placement.
    //
    // The search runs on a FORECAST — the placed boxes are held still and only
    // their owners are permuted — because that costs pure arithmetic and can
    // therefore be taken all the way to a fixed point, where the outer loop pays
    // a full re-seat and relaxation for every step it takes. Exchanging the
    // owners of a crossing pair strictly shortens both segments (two crossing
    // segments always do), so the total length falls at every exchange, the
    // iteration cannot cycle, and a fixed point has no crossing pair left in the
    // model. What the model does NOT capture is that the labels are different
    // sizes, so the re-placement moves the boxes and the real crossing count is
    // its own question — which is why the outer loop measures rather than
    // assumes. Doing it the other way round, one exchange per re-placement, was
    // measured: on the 26-label Kenya `auto` cell it needed 14 full re-placements
    // to get from 26 crossings to 1, and cost 6.8s against 0.8s.
    //
    // Both halves of the hand-back are needed. The seed is what reorders labels
    // whose slots differ; their place in `ordering` is what reorders labels whose
    // slots are EQUAL, which on a map is the ordinary case — two regions sharing
    // one nearest track point tie, and the relaxation breaks the tie on the
    // sequence it was handed. Measured on Kenya adm1: the one crossing pair on
    // the 16-label map is exactly such a tie, so a seed-only swap came back
    // byte-identical.
    const untanglePass = (
      seeds: number[],
      ordering: number[],
      layout: ComponentLayout,
    ): { seeds: number[]; ordering: number[] } | undefined => {
      const byTrack = ordering.slice().sort((a, b) =>
        layout.placedT[a] - layout.placedT[b] || a - b
      );
      const n = byTrack.length;
      // Slot k is where byTrack[k]'s box sits; owner[k] is who holds it now.
      const slotAt = byTrack.map((m) => ({
        x: layout.boxes[m].cx,
        y: layout.boxes[m].cy,
      }));
      const owner = byTrack.slice();

      let exchanged = false;
      for (let round = 0; round < UNTANGLE_FORECAST_ROUNDS; round++) {
        let any = false;
        for (let a = 0; a < n; a++) {
          for (let b = a + 1; b < n; b++) {
            if (
              !segmentsCross(
                inputs[owner[a]].anchor,
                slotAt[a],
                inputs[owner[b]].anchor,
                slotAt[b],
              )
            ) {
              continue;
            }
            const t = owner[a];
            owner[a] = owner[b];
            owner[b] = t;
            any = true;
            exchanged = true;
          }
        }
        if (!any) break;
      }
      if (!exchanged) return undefined;

      const nextSeeds = seeds.slice();
      const nextOrdering = ordering.slice();
      const place = new Map<number, number>();
      ordering.forEach((m, k) => place.set(m, k));
      for (let k = 0; k < n; k++) {
        const held = byTrack[k];
        const taker = owner[k];
        nextSeeds[taker] = seeds[held];
        nextOrdering[place.get(held) as number] = taker;
      }
      return { seeds: nextSeeds, ordering: nextOrdering };
    };

    let seeds = seedT.slice();
    let ordering = members.slice();
    let layout = layoutFrom(seeds, ordering);
    if (!layout) return { kind: "infeasible" };

    // Order preservation makes leaders non-crossing on a PIE, where a slice's
    // anchor lies on the arc directly inward of its own label so track order and
    // visual order are one order. A map anchor sits at an arbitrary interior
    // point, so two labels can be in the correct track order with crossing
    // leaders. The sweep is the map's answer.
    //
    // A pass is not required to improve, because fixing one crossing can reveal
    // another — that is bubble sort, not a fault — and stopping at the first
    // non-improving pass measured as leaving a crossing on the page that a
    // second pass clears. What IS required is that the sweep never hands back a
    // worse layout than it started from, so it keeps the best seen and returns
    // that. Bounded, deterministic, and monotone in the only sense that matters.
    if (opts.untangleLeaders && members.length > 1) {
      let bestSeeds = seeds;
      let bestLayout = layout;
      let bestCrossings = crossingCount(layout);
      let barren = 0;
      for (
        let sweep = 0;
        bestCrossings > 0 && sweep < UNTANGLE_SWEEPS &&
        barren < UNTANGLE_PATIENCE;
        sweep++
      ) {
        const swapped = untanglePass(seeds, ordering, layout);
        if (!swapped) break;
        const next = layoutFrom(swapped.seeds, swapped.ordering);
        // A swap with no placement is a swap to reject, not a cell to fail.
        if (!next) break;
        seeds = swapped.seeds;
        ordering = swapped.ordering;
        layout = next;
        const crossings = crossingCount(next);
        if (crossings < bestCrossings) {
          bestCrossings = crossings;
          bestSeeds = seeds;
          bestLayout = next;
          barren = 0;
        } else {
          barren++;
        }
      }
      seeds = bestSeeds;
      layout = bestLayout;
    }

    for (const i of members) {
      seedT[i] = seeds[i];
      seatedT[i] = layout.seatedT[i];
      placedT[i] = layout.placedT[i];
      boxes[i] = layout.boxes[i];
    }
  }

  // Belt and braces, and the only thing standing between two COMPONENTS: the
  // repair above works along one component's arc length, which cannot separate
  // a mainland label from an island's. Rather than ever emit two labels on top
  // of each other, say so and let the caller fall back to the flank placer.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) return { kind: "infeasible" };
    }
  }

  const out = inputs.map((input, i): NearestPlacedBox => {
    const box = boxes[i];
    const p = track.components[natural[i]!.component].pointAt(placedT[i]);
    // The geometry runs on the padded box; the text sits inside it, offset by
    // any asymmetry in the padding.
    const textCx = box.cx - (input.padRight - input.padLeft) / 2;
    const textCy = box.cy - (input.padBottom - input.padTop) / 2;
    const h = alignmentFor(p.nx, p.ny, opts.alignmentSwitchAngleDeg);
    const x = h === "left"
      ? textCx - input.width / 2
      : h === "right"
      ? textCx + input.width / 2
      : textCx;
    return {
      position: { x, y: textCy },
      align: { h, v: "middle" },
      touch: boxClearance(track, box).point,
      center: { x: box.cx, y: box.cy },
      displacement: trackDisplacement(
        natural[i]!.t,
        placedT[i],
        track.components[natural[i]!.component].length,
      ),
      shapeDisplacement: trackDisplacement(
        seedT[i],
        seatedT[i],
        track.components[natural[i]!.component].length,
      ),
    };
  });

  return { kind: "ok", boxes: out };
}
