// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode } from "../_internal/pipeline_types.ts";
import type { PlacementPass } from "./types.ts";
import { budgeNode, computePriorities } from "./attach.ts";

// symmetric-finish (DOC_VIZGRAPH_PLACEMENT.md): one final budge pass where
// each node's desired position is the barycenter of BOTH sides' neighbors —
// removes the last-writer bias the alternating attach sweeps leave behind.
// Desired positions are computed from a PRE-pass snapshot (Jacobi), never
// from mid-pass state: Gauss–Seidel targets (updated left, stale right)
// propagate fractional averages down chains and turn clean plateau steps
// into per-hop micro-wiggle (deep-chain bends 16 → 54 when this was
// implemented naively).
export function symmetricFinish(): PlacementPass {
  return {
    name: "symmetric-finish",
    run(proper, ctx) {
      const priorities = computePriorities(proper);
      const snapshotCenterY = new Map<PNode, number>();
      for (const layer of proper.layers) {
        for (const pnode of layer) {
          snapshotCenterY.set(pnode, pnode.y + pnode.h / 2);
        }
      }
      for (const layer of proper.layers) {
        const byPriority = [...layer].sort(
          (a, b) =>
            priorities.get(b)! - priorities.get(a)! ||
            a.order - b.order,
        );
        const placed = new Set<PNode>();
        for (const pnode of byPriority) {
          const anchors = [...pnode.leftNeighbors, ...pnode.rightNeighbors];
          if (anchors.length > 0) {
            const desiredCenter = anchors.reduce(
              (acc, n) => acc + snapshotCenterY.get(n)!,
              0,
            ) / anchors.length;
            budgeNode(
              layer,
              pnode,
              desiredCenter - pnode.h / 2,
              placed,
              ctx.spacing,
            );
          }
          placed.add(pnode);
        }
      }
    },
  };
}
