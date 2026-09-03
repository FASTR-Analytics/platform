// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { PassContext, PlacementPass } from "./types.ts";
import { requiredGap } from "./types.ts";

// void-bound (DOC_VIZGRAPH_PLACEMENT.md): the whitespace invariant — no
// horizontal band of the drawing that is free of ink may exceed maxVoid.
// Every other pass moves things TOWARD a signal, so anything with no
// attachment to the rest of the drawing (an edge-less ungrouped node, a
// whole disconnected component) is exempt from all of them and its distance
// is unbounded BY CONSTRUCTION — "nothing to adopt toward" justifies an
// arbitrary position among reasonable ones, never an arbitrarily distant
// one. This pass is the safety net that makes the 10,000-DU void
// structurally impossible; adopt-isolates is what makes a stray node read
// as PLACED rather than merely bounded. The two are NOT redundant, however
// idle this pass looks on real fixtures: a tuck relocates whitespace and
// cannot remove it (a node has two gaps; tucking closes one, the other
// stays), so only a pass that moves the REST of the drawing can deliver the
// bound. Measured — with adoption alone, 104 of 1200 adversarial layouts
// still violate it, worst void 2145 DU (DOC_VIZGRAPH_PLACEMENT.md, "Why
// adopt-isolates is NOT enough").
//
// Occupancy is every PNode's y-span — dummies (h = 0) included, because an
// edge lane is ink: a long edge crossing the middle of the drawing keeps
// the band it runs through alive, and a band this pass closes therefore has
// nothing drawn in it in ANY column. Loose whitespace the composition wants
// is untouched: a sparse layer beside a tall one is not a band (the tall
// layer occupies those y's).
//
// Order/gap and straightness invariants hold BY CONSTRUCTION. Every node
// lies wholly above or wholly below a node-free band, so closing one is a
// rigid translation of the below-part: in-block geometry is unchanged, and
// the only segments whose shape changes are those spanning the band — which
// cannot be straight, the band being wider than any straightness tolerance.
// The shift is clamped by the tightest straddling in-layer pair's slack, so
// separation is never compressed below requiredGap (a band narrower than
// the separation its straddling pair needs simply stays).
export type VoidBoundParams = {
  // The widest ink-free band the drawing may contain, in multiples of
  // nodeGap. Deliberately generous — this bounds the pathological, it does
  // not compact (the whole corpus's widest band is under 4 gaps, so the
  // house look is untouched at the default).
  maxVoidGaps: number;
};

export const DEFAULT_VOID_BOUND_PARAMS: VoidBoundParams = {
  maxVoidGaps: 4,
};

const EPS = 1e-6;

export function voidBound(params?: Partial<VoidBoundParams>): PlacementPass {
  const p = { ...DEFAULT_VOID_BOUND_PARAMS, ...params };
  return {
    name: "void-bound",
    run(proper, ctx) {
      const maxVoid = p.maxVoidGaps * ctx.spacing.nodeGap;
      const all = proper.layers.flat();
      if (all.length === 0) {
        return;
      }
      // Bands and shifts are computed from ONE snapshot: closing a band
      // translates both sides of every band below it equally, so their
      // straddling gaps are unaffected and the passes are independent.
      const y0 = new Map<PNode, number>(all.map((n) => [n, n.y]));
      for (const band of findBands(all, maxVoid)) {
        const shift = feasibleShift(proper, ctx, y0, band, maxVoid);
        if (shift <= EPS) {
          continue;
        }
        for (const n of all) {
          if (y0.get(n)! >= band.bottom - EPS) {
            n.y -= shift;
          }
        }
      }
    },
  };
}

type Band = { top: number; bottom: number };

// Maximal gaps in the union of node y-spans, top-down, wider than maxVoid.
function findBands(all: PNode[], maxVoid: number): Band[] {
  const spans = all
    .map((n) => [n.y, n.y + n.h] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const bands: Band[] = [];
  let cur = spans[0][1];
  for (const [lo, hi] of spans) {
    if (lo - cur > maxVoid) {
      bands.push({ top: cur, bottom: lo });
    }
    cur = Math.max(cur, hi);
  }
  return bands;
}

// How far the below-part may rise: down to maxVoid, but never past the
// separation the tightest straddling in-layer pair needs.
function feasibleShift(
  proper: ProperGraph,
  ctx: PassContext,
  y0: Map<PNode, number>,
  band: Band,
  maxVoid: number,
): number {
  let shift = band.bottom - band.top - maxVoid;
  for (const layer of proper.layers) {
    for (let k = 1; k < layer.length; k++) {
      const above = layer[k - 1];
      const below = layer[k];
      const aBottom = y0.get(above)! + above.h;
      if (aBottom > band.top + EPS || y0.get(below)! < band.bottom - EPS) {
        continue;
      }
      shift = Math.min(
        shift,
        y0.get(below)! - aBottom - requiredGap(above, below, ctx.spacing),
      );
    }
  }
  return shift;
}
