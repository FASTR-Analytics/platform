// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode } from "../_internal/pipeline_types.ts";
import type { PlacementPass } from "./types.ts";
import { requiredGap } from "./types.ts";

// adopt-isolates (DOC_VIZGRAPH_PLACEMENT.md): placement-invisible nodes —
// zero cross-layer segments, because ALL their edges are same-layer edges
// that properize extracted before stages 3–4 — have no barycenter pull and
// strand wherever seed-stack dropped them. Adopt each toward the mean
// center of its same-layer partners — or, for a FULLY edge-less node, its
// same-layer group-mates (the hrh education_systems strand: seed dropped it
// at the column bottom, everything else compacted up, and a 450 DU void
// opened inside its group box) — clamped to the slack between its
// order-neighbors (never pushes, so order/gap invariants hold trivially).
// Edge-less AND ungrouped keeps the seed position (nothing to adopt
// toward). Runs LAST, after compaction: the clamp neighbors (often
// dummies) only settle once blocks have compacted.
export type AdoptIsolatesParams = {
  maxRounds: number;
  minMove: number;
};

export const DEFAULT_ADOPT_ISOLATES_PARAMS: AdoptIsolatesParams = {
  maxRounds: 2,
  minMove: 0.5,
};

export function adoptIsolates(
  params?: Partial<AdoptIsolatesParams>,
): PlacementPass {
  const p = { ...DEFAULT_ADOPT_ISOLATES_PARAMS, ...params };
  return {
    name: "adopt-isolates",
    run(proper, ctx) {
      const partners = new Map<string, string[]>();
      for (const e of proper.sameLayerEdges) {
        partners.set(e.from, [...(partners.get(e.from) ?? []), e.to]);
        partners.set(e.to, [...(partners.get(e.to) ?? []), e.from]);
      }
      // A couple of rounds so chained isolates can follow each other; fixed
      // (layer, order) iteration — deterministic.
      for (let round = 0; round < p.maxRounds; round++) {
        let moved = false;
        for (const layer of proper.layers) {
          for (const pnode of layer) {
            if (
              pnode.isDummy ||
              pnode.leftNeighbors.length + pnode.rightNeighbors.length > 0
            ) {
              continue;
            }
            let targets = (partners.get(pnode.id) ?? [])
              .map((id) => proper.pnodeByRealId.get(id))
              .filter((t): t is PNode => t !== undefined);
            if (targets.length === 0) {
              const gid = proper.innermostGroupByNodeId.get(pnode.id);
              targets = gid === undefined ? [] : layer.filter(
                (m) =>
                  !m.isDummy && m !== pnode &&
                  proper.innermostGroupByNodeId.get(m.id) === gid,
              );
            }
            if (targets.length === 0) {
              continue; // edge-less and ungrouped: keep the seed position
            }
            const target = targets.reduce(
              (acc, t) => acc + t.y + t.h / 2,
              0,
            ) / targets.length;
            const k = pnode.order;
            const lo = k > 0
              ? layer[k - 1].y + layer[k - 1].h +
                requiredGap(layer[k - 1], pnode, ctx.spacing)
              : -Infinity;
            const hi = k < layer.length - 1
              ? layer[k + 1].y - requiredGap(pnode, layer[k + 1], ctx.spacing) -
                pnode.h
              : Infinity;
            if (lo > hi) {
              continue;
            }
            const desiredTop = Math.min(
              Math.max(target - pnode.h / 2, lo),
              hi,
            );
            if (Math.abs(desiredTop - pnode.y) < p.minMove) {
              continue;
            }
            pnode.y = desiredTop;
            moved = true;
          }
        }
        if (!moved) {
          break;
        }
      }
    },
  };
}
