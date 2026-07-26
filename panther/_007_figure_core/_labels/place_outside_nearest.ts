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
  // The padded box's point nearest the silhouette — where a leader ends (N5).
  touch: Point;
  // Arc length this label was pushed off its natural point. Zero unless a
  // neighbour forced it, which is the property the whole design turns on.
  displacement: number;
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
};

export type NearestPlacementResult =
  | { kind: "ok"; boxes: NearestPlacedBox[] }
  // The track cannot hold these labels; the caller falls back to flank (N10).
  | { kind: "infeasible" };

type Box = { cx: number; cy: number; hw: number; hh: number };

const CLEARANCE_TOLERANCE_DU = 0.01;
const RELAX_PASSES = 2;

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

// Smallest clearance between the silhouette and any part of the box. The box is
// convex and lies outside the shape, so the minimum is on its perimeter.
function boxClearance(
  track: LabelTrack,
  box: Box,
  samplesPerSide: number,
): number {
  let worst = Infinity;
  for (let i = 0; i < samplesPerSide; i++) {
    const f = i / (samplesPerSide - 1);
    const x = box.cx - box.hw + 2 * box.hw * f;
    const y = box.cy - box.hh + 2 * box.hh * f;
    worst = Math.min(
      worst,
      track.clearanceAt(x, box.cy - box.hh),
      track.clearanceAt(x, box.cy + box.hh),
      track.clearanceAt(box.cx - box.hw, y),
      track.clearanceAt(box.cx + box.hw, y),
    );
  }
  return worst;
}

const CLEARANCE_SAMPLES_PER_SIDE = 7;

// Place the padded box on the ray leaving the track point, as close in as the
// two N3 constraints allow.
function placeBoxAt(
  track: LabelTrack,
  p: { x: number; y: number; nx: number; ny: number },
  hw: number,
  hh: number,
  opts: NearestPlacementOptions,
): Box {
  const dRay = rayExitHalfChord(p.nx, p.ny, hw, hh);
  const at = (d: number): Box => ({
    cx: p.x + p.nx * d,
    cy: p.y + p.ny * d,
    hw,
    hh,
  });

  const box = at(dRay);
  if (
    boxClearance(track, box, CLEARANCE_SAMPLES_PER_SIDE) >= opts.clearanceFloor
  ) {
    return box;
  }

  // The corner leads and has cut inside the floor: push out along the ray only
  // as far as the floor demands. Bracketed by the support-function distance,
  // which always clears.
  let lo = dRay;
  let hi = dRay + hw + hh + opts.clearance;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (
      boxClearance(track, at(mid), CLEARANCE_SAMPLES_PER_SIDE) >=
        opts.clearanceFloor
    ) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (hi - lo < CLEARANCE_TOLERANCE_DU) break;
  }
  return at(hi);
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

function boxesOverlap(a: Box, b: Box): boolean {
  return Math.abs(a.cx - b.cx) < a.hw + b.hw - 1e-9 &&
    Math.abs(a.cy - b.cy) < a.hh + b.hh - 1e-9;
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

// The point of the box nearest the silhouette — where a leader stops (N5).
function touchPoint(track: LabelTrack, box: Box): Point {
  let best = { x: box.cx, y: box.cy };
  let bestClearance = Infinity;
  const n = CLEARANCE_SAMPLES_PER_SIDE;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const x = box.cx - box.hw + 2 * box.hw * f;
    const y = box.cy - box.hh + 2 * box.hh * f;
    const candidates: Point[] = [
      { x, y: box.cy - box.hh },
      { x, y: box.cy + box.hh },
      { x: box.cx - box.hw, y },
      { x: box.cx + box.hw, y },
    ];
    for (const c of candidates) {
      const d = track.clearanceAt(c.x, c.y);
      if (d < bestClearance) {
        bestClearance = d;
        best = c;
      }
    }
  }
  return best;
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

  for (const [componentIndex, members] of byComponent) {
    const component = track.components[componentIndex];

    // Footprints depend on where a box ends up, and where it ends up depends on
    // the footprints. Two passes settles it: measure at the natural placement,
    // relax, measure again where they landed, relax once more. Bounded and
    // deterministic — no convergence loop.
    for (let pass = 0; pass < RELAX_PASSES; pass++) {
      const items: TrackItem[] = members.map((i) => {
        const { w, h } = paddedSize(inputs[i]);
        const box = placeBoxAt(
          track,
          component.pointAt(placedT[i]),
          w / 2,
          h / 2,
          opts,
        );
        boxes[i] = box;
        return {
          t: placedT[i],
          footprint: shadowFootprint(component, placedT[i], box),
        };
      });

      const relaxed = relaxOnTrack(items, component.length, opts.gap);
      if (relaxed.kind === "infeasible") return { kind: "infeasible" };
      for (let k = 0; k < members.length; k++) {
        placedT[members[k]] = relaxed.positions[k];
      }
    }

    // Final placement at the settled positions.
    for (const i of members) {
      const { w, h } = paddedSize(inputs[i]);
      boxes[i] = placeBoxAt(
        track,
        component.pointAt(placedT[i]),
        w / 2,
        h / 2,
        opts,
      );
    }
  }

  // Belt and braces. Disjoint shadows imply disjoint boxes only where the
  // track's outward rays do not cross, which holds for a disc but not for every
  // coastline. Rather than ever emit two labels on top of each other, say so
  // and let the caller fall back to the flank placer.
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
      touch: touchPoint(track, box),
      displacement: trackDisplacement(
        natural[i]!.t,
        placedT[i],
        track.components[natural[i]!.component].length,
      ),
    };
  });

  return { kind: "ok", boxes: out };
}
