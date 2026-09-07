// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode } from "../../_internal/pipeline_types.ts";

// Crossing arithmetic shared by the ordering steps (3.1 sweeps, 3.3 finish).
// Owns no sequence, so it carries no step number.

export function swap(layer: PNode[], a: number, b: number): void {
  const tmp = layer[a];
  layer[a] = layer[b];
  layer[b] = tmp;
  layer[a].order = a;
  layer[b].order = b;
}

export function crossingsAround(layers: PNode[][], i: number): number {
  let count = 0;
  if (i > 0) {
    count += crossingsBetween(layers[i - 1]);
  }
  count += crossingsBetween(layers[i]);
  return count;
}

export function totalCrossings(layers: PNode[][]): number {
  let count = 0;
  for (let i = 0; i < layers.length - 1; i++) {
    count += crossingsBetween(layers[i]);
  }
  return count;
}

// Crossings between a layer and the next, counting inversions among the
// (left order, right order) segment pairs. O(m²) — fine at target scale
// (DOC_VIZGRAPH_ARCHITECTURE.md right-sizing).
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
