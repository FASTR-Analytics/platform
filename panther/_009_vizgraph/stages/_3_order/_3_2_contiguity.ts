// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  PNode,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { GroupIndex } from "../../transform/derive.ts";

// Step 3.2 — the group-contiguity re-sort policy
// (DOC_VIZGRAPH_ORDERING.md): re-sort each layer so group members are
// CONTIGUOUS, hierarchically — compare two REAL nodes by the barycenter
// (mean current order) of their containing unit at each nesting depth,
// outermost first; ungrouped real nodes are their own unit. Dummies are
// TRANSPARENT: never members, never expelled — each keeps its sweep-chosen
// slot by re-anchoring to the real node that precedes it (dummies above the
// first real node stay at the layer head), so pass-through edges thread
// group spans instead of detouring around whole columns. Runs once after
// the crossing sweeps: groups may cost crossings among real nodes,
// contiguity wins (decorative-groups contract). Idempotent on an adopted
// prior ordering, and it re-sorts when only group membership changed.
export const contiguityStep: PipelineStep = {
  id: "3.2",
  name: "contiguity",
  run: (state) => enforceGroupContiguity(state.proper!, state.groupIndex),
};

export function enforceGroupContiguity(
  proper: ProperGraph,
  groupIndex: GroupIndex,
): void {
  if (groupIndex.groupById.size === 0) {
    return;
  }
  for (const layer of proper.layers) {
    if (layer.length < 2) {
      continue;
    }
    const reals = layer.filter((pnode) => !pnode.isDummy);
    if (reals.length < 2) {
      continue;
    }
    // Outermost-first group path per real node; [] for ungrouped.
    const paths = new Map<PNode, string[]>();
    let hasGrouped = false;
    for (const pnode of reals) {
      const chain = groupIndex.chainByNodeId.get(pnode.id);
      const path = chain === undefined ? [] : [...chain].reverse();
      if (path.length > 0) {
        hasGrouped = true;
      }
      paths.set(pnode, path);
    }
    if (!hasGrouped) {
      continue;
    }
    // Dummy anchors, recorded before the reals move.
    const headDummies: PNode[] = [];
    const trailingDummies = new Map<PNode, PNode[]>();
    let lastReal: PNode | undefined;
    for (const pnode of layer) {
      if (!pnode.isDummy) {
        lastReal = pnode;
      } else if (lastReal === undefined) {
        headDummies.push(pnode);
      } else {
        const list = trailingDummies.get(lastReal) ?? [];
        list.push(pnode);
        trailingDummies.set(lastReal, list);
      }
    }
    const bary = new Map<string, { sum: number; count: number }>();
    for (const pnode of reals) {
      const path = paths.get(pnode)!;
      for (let depth = 0; depth < path.length; depth++) {
        const key = `${depth}|${path[depth]}`;
        const entry = bary.get(key) ?? { sum: 0, count: 0 };
        entry.sum += pnode.order;
        entry.count++;
        bary.set(key, entry);
      }
    }
    const unitId = (pnode: PNode, depth: number): string => {
      const path = paths.get(pnode)!;
      return depth < path.length ? path[depth] : `\u0000${pnode.id}`;
    };
    const unitBary = (pnode: PNode, depth: number): number => {
      const path = paths.get(pnode)!;
      if (depth < path.length) {
        const entry = bary.get(`${depth}|${path[depth]}`)!;
        return entry.sum / entry.count;
      }
      return pnode.order;
    };
    reals.sort((a, b) => {
      for (let depth = 0;; depth++) {
        const ua = unitId(a, depth);
        const ub = unitId(b, depth);
        if (ua === ub) {
          if (ua.startsWith("\u0000")) {
            return a.order - b.order;
          }
          continue;
        }
        return unitBary(a, depth) - unitBary(b, depth) || ua.localeCompare(ub);
      }
    });
    let i = 0;
    for (const pnode of headDummies) {
      layer[i++] = pnode;
    }
    for (const real of reals) {
      layer[i++] = real;
      for (const dummy of trailingDummies.get(real) ?? []) {
        layer[i++] = dummy;
      }
    }
    layer.forEach((pnode, k) => {
      pnode.order = k;
    });
  }
}
