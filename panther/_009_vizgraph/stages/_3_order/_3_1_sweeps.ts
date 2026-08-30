// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  PNode,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import { crossingsAround, swap, totalCrossings } from "./crossings.ts";

const MAX_ORDER_SWEEPS = 8;
const MAX_TRANSPOSE_PASSES = 4;

// Step 3.1: crossing reduction — iterative down/up barycenter sweeps plus
// adjacent-pair transposition, keeping the best ordering seen. Seeding comes
// from stage 2's initial order (prior-layout position → given seq → input
// order). The ordering contract + policy catalog live in
// DOC_VIZGRAPH_ORDERING.md — behavioral ordering changes land as cataloged
// policies (PLAN_VIZGRAPH architecture toll).
export const sweepsStep: PipelineStep = {
  id: "3.1",
  name: "sweeps",
  run: (state) => orderSweeps(state.proper!),
};

export function orderSweeps(proper: ProperGraph): void {
  const layers = proper.layers;
  if (layers.length === 0) {
    return;
  }

  let best = snapshot(layers);
  let bestCrossings = totalCrossings(layers);

  for (let sweep = 0; sweep < MAX_ORDER_SWEEPS; sweep++) {
    for (let i = 1; i < layers.length; i++) {
      barycenterSort(layers[i], "left");
    }
    for (let i = layers.length - 2; i >= 0; i--) {
      barycenterSort(layers[i], "right");
    }
    transpose(layers);
    const crossings = totalCrossings(layers);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      best = snapshot(layers);
      if (crossings === 0) {
        break;
      }
    } else {
      break;
    }
  }

  restore(layers, best);
}

// The isolate-hold policy (DOC_VIZGRAPH_ORDERING.md). Nodes with no segments
// at all (fully edge-less, or same-layer-edges-only after properize's
// extraction) carry no crossing signal; sorting them by
// their absolute order against neighbor-derived fractional barycenters lets
// them WANDER relative to their siblings whenever the rest of the layer
// re-sorts (the hrh education_systems bug: mid-group unfolded, last-in-group
// folded). Hold them at their layer index instead and sort only the rest.
function barycenterSort(layer: PNode[], side: "left" | "right"): void {
  const heldAt = new Map<number, PNode>();
  const active: PNode[] = [];
  layer.forEach((pnode, i) => {
    if (pnode.leftNeighbors.length + pnode.rightNeighbors.length === 0) {
      heldAt.set(i, pnode);
    } else {
      active.push(pnode);
    }
  });
  const barycenters = new Map<PNode, number>();
  for (const pnode of active) {
    const neighbors = side === "left"
      ? pnode.leftNeighbors
      : pnode.rightNeighbors;
    if (neighbors.length === 0) {
      barycenters.set(pnode, pnode.order);
    } else {
      const sum = neighbors.reduce((acc, n) => acc + n.order, 0);
      barycenters.set(pnode, sum / neighbors.length);
    }
  }
  active.sort((a, b) => barycenters.get(a)! - barycenters.get(b)!);
  let next = 0;
  for (let i = 0; i < layer.length; i++) {
    layer[i] = heldAt.get(i) ?? active[next++];
  }
  layer.forEach((pnode, i) => {
    pnode.order = i;
  });
}

function transpose(layers: PNode[][]): void {
  for (let pass = 0; pass < MAX_TRANSPOSE_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      for (let k = 0; k < layer.length - 1; k++) {
        const before = crossingsAround(layers, i);
        swap(layer, k, k + 1);
        const after = crossingsAround(layers, i);
        if (after < before) {
          improved = true;
        } else {
          swap(layer, k, k + 1);
        }
      }
    }
    if (!improved) {
      return;
    }
  }
}

function snapshot(layers: PNode[][]): PNode[][] {
  return layers.map((layer) => [...layer]);
}

function restore(layers: PNode[][], saved: PNode[][]): void {
  for (let i = 0; i < layers.length; i++) {
    layers[i] = saved[i];
    layers[i].forEach((pnode, k) => {
      pnode.order = k;
    });
  }
}
