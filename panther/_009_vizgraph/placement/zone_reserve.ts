// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  GroupRun,
  PNode,
  ProperGraph,
} from "../_internal/pipeline_types.ts";
import type { ResolvedZone } from "../_internal/regions.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PassContext, PlacementPass } from "./types.ts";
import { requiredGap } from "./types.ts";
import { compareCoherent, zoneInsets, zoneIntervals } from "./zones.ts";

// zone-reserve (DOC_VIZGRAPH_PLACEMENT.md): make every zone's interval
// EXCLUSIVE — in each layer the zone spans, every real non-member sits
// wholly above or wholly below the zone's reserved interval, at the
// clearance requiredGap would give it against the zone's box. Scheduled
// only for models with zone groups, immediately before void-bound.
//
// The zone binds REAL members only (pass-through dummies stay transparent —
// the 2026-08-28 policy: an edge may thread the box). Which side a
// non-member takes is the stage-3 ordering's: above the member run or
// below it. In a spanned layer where the zone has no member (a memberless
// middle layer) the zone is a PHANTOM whose slot is chosen here — the
// least-displacement split of the layer's reals, constrained to sit inside
// every ancestor's run (or AT an ancestor's own phantom split — a nested
// interval puts every outsider on the same side of both) and on the
// coherent side of every other coherent unit present (the same order step
// 3.2 pinned), so the constraint system below has no positive cycle.
//
// The repair is the least fixpoint of a difference-constraint system
// pushed DOWN only (every move increases a y): zone top ≥ each above-real's
// padded bottom + nodeGap; each run's first ≥ zone top + its inset; zone
// bottom ≥ each run's padded last; each below-real ≥ zone bottom + nodeGap
// + its pad; and the in-layer separation chain. Relaxation to convergence —
// the solution is unique, so the pass is deterministic and idempotent, and
// in-layer order and requiredGap hold by construction (rules 2–3). Nodes
// the zone does not touch keep their y; a member run pushed down for a
// non-member above it bends its segments — the price of the late repair
// (the alternative, widening requiredGap for every pass, would put zone
// arithmetic on every inner loop of models that never asked).
export function zoneReserve(): PlacementPass {
  return {
    name: "zone-reserve",
    run(proper, ctx) {
      if (proper.zones.length === 0) {
        return;
      }
      relax(proper, buildZoneFrames(proper, ctx), ctx.spacing);
    },
  };
}

const EPS = 1e-9;
// A safety cap only: with a coherent ordering the system has no positive
// cycle and converges in a handful of rounds.
const MAX_RELAX_ROUNDS = 256;

type ZoneLayer = {
  run: GroupRun | undefined;
  insetTop: number;
  insetBottom: number;
  above: PNode[];
  below: PNode[];
};

type ZoneFrame = {
  zone: ResolvedZone;
  layers: ZoneLayer[];
};

function buildZoneFrames(proper: ProperGraph, ctx: PassContext): ZoneFrame[] {
  const intervalById = new Map(
    zoneIntervals(proper).map((iv) => [iv.zone.region.id, iv]),
  );
  // Phantom splits already chosen per layer (zone id → split index among
  // the layer's reals), so later phantoms respect earlier ones.
  const phantomSplits = new Map<number, Map<string, number>>();
  const frames: ZoneFrame[] = [];
  // Parents before children: a child phantom takes its ancestor's split.
  const outermostFirst = [...proper.zones].sort(
    (a, b) =>
      (proper.groupChainById.get(a.region.id)?.length ?? 0) -
        (proper.groupChainById.get(b.region.id)?.length ?? 0) ||
      a.region.id.localeCompare(b.region.id),
  );
  for (const zone of outermostFirst) {
    const runs = proper.groupRuns.get(zone.region.id);
    const interval = intervalById.get(zone.region.id);
    if (runs === undefined || interval === undefined) {
      continue;
    }
    const members = new Set(zone.region.memberIds);
    const layers: ZoneLayer[] = [];
    for (let l = zone.fromLayerIndex; l <= zone.toLayerIndex; l++) {
      const reals = proper.layers[l].filter((p) => !p.isDummy);
      const run = runs.byLayer.get(l);
      if (run !== undefined) {
        const insets = zoneInsets(zone, run, l, runs.firstLayerIndex);
        layers.push({
          run,
          insetTop: insets.top,
          insetBottom: insets.bottom,
          above: reals.slice(0, reals.indexOf(run.first)).filter((p) =>
            !members.has(p.id)
          ),
          below: reals.slice(reals.indexOf(run.last) + 1).filter((p) =>
            !members.has(p.id)
          ),
        });
        continue;
      }
      const splits = phantomSplits.get(l) ?? new Map<string, number>();
      phantomSplits.set(l, splits);
      const k = chooseSplit(
        proper,
        zone,
        l,
        reals,
        interval,
        splits,
        ctx.spacing,
      );
      splits.set(zone.region.id, k);
      layers.push({
        run: undefined,
        insetTop: 0,
        insetBottom: 0,
        above: reals.slice(0, k),
        below: reals.slice(k),
      });
    }
    frames.push({ zone, layers });
  }
  return frames;
}

// The phantom split of a memberless spanned layer: k reals above, the rest
// below. Bounds first — inside every ancestor's run; above or below every
// other coherent unit's run and every earlier phantom, per the coherent
// ranks — then the least-displacement k within the bounds (first minimum).
function chooseSplit(
  proper: ProperGraph,
  zone: ResolvedZone,
  layerIndex: number,
  reals: PNode[],
  interval: { top: number; bottom: number },
  phantoms: Map<string, number>,
  spacing: ResolvedSpacing,
): number {
  const id = zone.region.id;
  const ancestors = new Set(proper.groupChainById.get(id) ?? []);
  let lo = 0;
  let hi = reals.length;
  for (const [groupId, runs] of proper.groupRuns) {
    if (groupId === id || !proper.coherentRank.has(groupId)) {
      continue;
    }
    const run = runs.byLayer.get(layerIndex);
    if (run === undefined) {
      continue;
    }
    const firstIdx = reals.indexOf(run.first);
    const lastIdx = reals.indexOf(run.last);
    if (ancestors.has(groupId)) {
      lo = Math.max(lo, firstIdx);
      hi = Math.min(hi, lastIdx + 1);
      continue;
    }
    const cmp = compareCoherent(proper, id, groupId);
    if (cmp === 0) {
      continue;
    }
    if (cmp < 0) {
      hi = Math.min(hi, firstIdx);
    } else {
      lo = Math.max(lo, lastIdx + 1);
    }
  }
  for (const [otherId, k] of phantoms) {
    if (ancestors.has(otherId)) {
      lo = Math.max(lo, k);
      hi = Math.min(hi, k);
      continue;
    }
    const cmp = compareCoherent(proper, id, otherId);
    if (cmp < 0) {
      hi = Math.min(hi, k);
    } else if (cmp > 0) {
      lo = Math.max(lo, k);
    }
  }
  if (lo > hi) {
    lo = hi;
  }
  let best = lo;
  let bestCost = Infinity;
  for (let k = lo; k <= hi; k++) {
    let cost = 0;
    for (let i = 0; i < k; i++) {
      const r = reals[i];
      cost += Math.max(
        0,
        r.y + r.h + r.padBottom + spacing.nodeGap - interval.top,
      );
    }
    for (let i = k; i < reals.length; i++) {
      const r = reals[i];
      cost += Math.max(
        0,
        interval.bottom + spacing.nodeGap + r.padTop - r.y,
      );
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  return best;
}

function relax(
  proper: ProperGraph,
  frames: ZoneFrame[],
  spacing: ResolvedSpacing,
): void {
  const zoneTop = frames.map(() => -Infinity);
  const zoneBottom = frames.map(() => -Infinity);
  const raise = (pnode: PNode, y: number): boolean => {
    if (y > pnode.y + EPS) {
      pnode.y = y;
      return true;
    }
    return false;
  };
  for (let round = 0; round < MAX_RELAX_ROUNDS; round++) {
    let changed = false;
    frames.forEach((frame, i) => {
      for (const layer of frame.layers) {
        for (const r of layer.above) {
          zoneTop[i] = Math.max(
            zoneTop[i],
            r.y + r.h + r.padBottom + spacing.nodeGap,
          );
        }
      }
      for (const layer of frame.layers) {
        if (layer.run === undefined) {
          continue;
        }
        if (raise(layer.run.first, zoneTop[i] + layer.insetTop)) {
          changed = true;
        }
        zoneBottom[i] = Math.max(
          zoneBottom[i],
          layer.run.last.y + layer.run.last.h + layer.insetBottom,
        );
      }
      for (const layer of frame.layers) {
        for (const r of layer.below) {
          if (raise(r, zoneBottom[i] + spacing.nodeGap + r.padTop)) {
            changed = true;
          }
        }
      }
    });
    for (const layer of proper.layers) {
      for (let k = 1; k < layer.length; k++) {
        const above = layer[k - 1];
        if (
          raise(
            layer[k],
            above.y + above.h + requiredGap(above, layer[k], spacing),
          )
        ) {
          changed = true;
        }
      }
    }
    if (!changed) {
      return;
    }
  }
}
