// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";

const MAX_ORDER_SWEEPS = 8;
const MAX_TRANSPOSE_PASSES = 4;

// Stage 3: crossing reduction — iterative down/up barycenter sweeps plus
// adjacent-pair transposition, keeping the best ordering seen. Seeding comes
// from stage 2's initial order (prior-layout position → given seq → input
// order).
export function orderStage(proper: ProperGraph): void {
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

function barycenterSort(layer: PNode[], side: "left" | "right"): void {
  const barycenters = new Map<PNode, number>();
  for (const pnode of layer) {
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
  layer.sort((a, b) => barycenters.get(a)! - barycenters.get(b)!);
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

function swap(layer: PNode[], a: number, b: number): void {
  const tmp = layer[a];
  layer[a] = layer[b];
  layer[b] = tmp;
  layer[a].order = a;
  layer[b].order = b;
}

function crossingsAround(layers: PNode[][], i: number): number {
  let count = 0;
  if (i > 0) {
    count += crossingsBetween(layers[i - 1]);
  }
  count += crossingsBetween(layers[i]);
  return count;
}

function totalCrossings(layers: PNode[][]): number {
  let count = 0;
  for (let i = 0; i < layers.length - 1; i++) {
    count += crossingsBetween(layers[i]);
  }
  return count;
}

// Crossings between a layer and the next, counting inversions among the
// (left order, right order) segment pairs. O(m²) — fine at target scale
// (PLAN_VIZGRAPH.md §1 right-sizing).
function crossingsBetween(leftLayer: PNode[]): number {
  const segments: [number, number][] = [];
  for (const pnode of leftLayer) {
    for (const neighbor of pnode.rightNeighbors) {
      segments.push([pnode.order, neighbor.order]);
    }
  }
  let count = 0;
  for (let a = 0; a < segments.length; a++) {
    for (let b = a + 1; b < segments.length; b++) {
      const [au, av] = segments[a];
      const [bu, bv] = segments[b];
      if ((au < bu && av > bv) || (au > bu && av < bv)) {
        count++;
      }
    }
  }
  return count;
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
