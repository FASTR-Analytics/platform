// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode } from "../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PlacementPass } from "./types.ts";

// straighten (DOC_VIZGRAPH_PLACEMENT.md): remove residual micro-jogs left by
// the earlier passes — the yFiles `straightenEdges` analogue. Scope is
// deliberately narrow: only PASS-THROUGH nodes (exactly one neighbor per
// side — chain interiors, dummies) and LEAVES (one neighbor total) are
// candidates; multi-degree nodes belong to the barycenter passes. A snap is
// applied only when it (a) strictly reduces the node's local bend count and
// (b) fits entirely in the node's free slack — straighten never pushes
// other nodes, so order/gap invariants hold trivially. Greedy rounds until
// a fixed point; strict improvement makes that monotone (no oscillation).
export type StraightenParams = {
  maxRounds: number;
  bendEps: number;
};

export const DEFAULT_STRAIGHTEN_PARAMS: StraightenParams = {
  maxRounds: 3,
  bendEps: 0.5,
};

export function straighten(params?: Partial<StraightenParams>): PlacementPass {
  const p = { ...DEFAULT_STRAIGHTEN_PARAMS, ...params };
  return {
    name: "straighten",
    run(proper, ctx) {
      for (let round = 0; round < p.maxRounds; round++) {
        let moved = false;
        for (const layer of proper.layers) {
          for (const pnode of layer) {
            if (trySnap(layer, pnode, ctx.spacing, p.bendEps)) {
              moved = true;
            }
          }
        }
        if (!moved) {
          break;
        }
      }
    },
  };
}

function centerY(pnode: PNode): number {
  return pnode.y + pnode.h / 2;
}

function localBends(pnode: PNode, atCenter: number, bendEps: number): number {
  let bends = 0;
  for (const n of [...pnode.leftNeighbors, ...pnode.rightNeighbors]) {
    if (Math.abs(centerY(n) - atCenter) >= bendEps) {
      bends++;
    }
  }
  return bends;
}

function trySnap(
  layer: PNode[],
  pnode: PNode,
  spacing: ResolvedSpacing,
  bendEps: number,
): boolean {
  const left = pnode.leftNeighbors;
  const right = pnode.rightNeighbors;
  let candidates: number[];
  if (left.length === 1 && right.length === 1) {
    // Chain interior: prefer the side needing the smaller move; a full
    // straight-through (both sides equal) is one candidate.
    const a = centerY(left[0]);
    const b = centerY(right[0]);
    const cur = centerY(pnode);
    candidates = Math.abs(a - cur) <= Math.abs(b - cur) ? [a, b] : [b, a];
  } else if (left.length + right.length === 1) {
    candidates = [centerY(left[0] ?? right[0])];
  } else {
    return false;
  }

  const current = localBends(pnode, centerY(pnode), bendEps);
  for (const target of candidates) {
    if (localBends(pnode, target, bendEps) >= current) {
      continue;
    }
    const desiredTop = target - pnode.h / 2;
    const k = pnode.order;
    const lower = k > 0
      ? layer[k - 1].y + layer[k - 1].h + spacing.nodeGap
      : -Infinity;
    const upper = k < layer.length - 1
      ? layer[k + 1].y - spacing.nodeGap - pnode.h
      : Infinity;
    if (desiredTop < lower || desiredTop > upper) {
      continue; // partial moves create new half-jogs — all or nothing
    }
    pnode.y = desiredTop;
    return true;
  }
  return false;
}
