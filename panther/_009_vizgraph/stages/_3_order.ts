// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { LayoutWarning } from "../types_geometry.ts";
import type { GroupIndex } from "../transform/derive.ts";

const MAX_ORDER_SWEEPS = 8;
const MAX_TRANSPOSE_PASSES = 4;
const MAX_FINISH_ROUNDS = 32;

// Stage 3: crossing reduction — iterative down/up barycenter sweeps plus
// adjacent-pair transposition, keeping the best ordering seen. Seeding comes
// from stage 2's initial order (prior-layout position → given seq → input
// order). The ordering contract + policy catalog live in
// DOC_VIZGRAPH_ORDERING.md — behavioral ordering changes land as cataloged
// policies (PLAN_VIZGRAPH architecture toll).
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

// The stage-3 ordering finish (DOC_VIZGRAPH_ORDERING.md): after the sweeps
// and the contiguity companion, alternate dummy-band alignment and the
// contiguity-safe transpose until neither changes. The quiet exit CERTIFIES
// the joint fixpoint, which is what keeps relayout byte-identical: on an
// adopted prior ordering both passes verify as no-ops, so the stored
// ordering reproduces itself. Rounds that transpose strictly reduce
// crossings (bounded); the cap is a backstop against a pure-neutral
// alignment cycle, never observed on the corpus — hitting it forfeits the
// fixpoint certificate, so it is surfaced as a warning.
export function finishOrdering(
  proper: ProperGraph,
  groupIndex: GroupIndex,
  warnings: LayoutWarning[],
): void {
  for (let round = 0; round < MAX_FINISH_ROUNDS; round++) {
    const bandsChanged = alignDummyBands(proper);
    const transposed = transposeFinish(proper, groupIndex);
    if (!bandsChanged && !transposed) {
      return;
    }
  }
  warnings.push({
    code: "ordering-finish-cap",
    message:
      "The ordering finish did not reach a fixpoint; relayout of this exact model may not be byte-stable",
  });
}

// The dummy-band alignment policy (DOC_VIZGRAPH_ORDERING.md): each maximal
// run of consecutive dummies re-sorts by chain-neighbor barycenter (mean of
// the chain neighbors' current orders), ties keeping the incoming order.
// The sweeps order dummy bands only as far as the crossing signal reaches —
// on a crossing-count plateau a band can keep its seed order and scissor
// its own chains; aligning to the neighbors straightens the chains. A band's
// re-sort is kept only when it does not increase crossings (the guard that
// makes the ordering finish converge instead of undoing transpose wins).
// Never moves a real node, so it cannot disturb group contiguity.
export function alignDummyBands(proper: ProperGraph): boolean {
  const layers = proper.layers;
  let changed = false;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    let start = 0;
    while (start < layer.length) {
      if (!layer[start].isDummy) {
        start++;
        continue;
      }
      let end = start;
      while (end < layer.length && layer[end].isDummy) {
        end++;
      }
      if (end - start > 1) {
        const original = layer.slice(start, end);
        const keys = new Map<PNode, number>();
        for (const pnode of original) {
          const neighbors = [...pnode.leftNeighbors, ...pnode.rightNeighbors];
          keys.set(
            pnode,
            neighbors.length === 0 ? pnode.order : neighbors.reduce(
              (acc, n) => acc + n.order,
              0,
            ) / neighbors.length,
          );
        }
        const band = [...original].sort((a, b) =>
          keys.get(a)! - keys.get(b)! || a.order - b.order
        );
        if (band.some((pnode, k) => pnode !== original[k])) {
          const before = crossingsAround(layers, i);
          placeBand(layer, start, band);
          if (crossingsAround(layers, i) > before) {
            placeBand(layer, start, original);
          } else {
            changed = true;
          }
        }
      }
      start = end;
    }
  }
  return changed;
}

function placeBand(layer: PNode[], start: number, band: PNode[]): void {
  for (let k = 0; k < band.length; k++) {
    layer[start + k] = band[k];
    band[k].order = start + k;
  }
}

// The contiguity-safe transpose finisher (DOC_VIZGRAPH_ORDERING.md): greedy
// adjacent-pair transposition over the finished ordering, accepting only
// swaps that strictly reduce crossings and that cannot break group-member
// contiguity (a dummy may swap with anything; two real nodes only when they
// share the same group path). The sweeps' own transpose runs BEFORE the
// contiguity companion, so orderings it could never see — dummies inside
// group spans, band-aligned chains — are re-optimized here. Loops to its
// fixpoint: every accepted swap strictly lowers the total, so it terminates.
export function transposeFinish(
  proper: ProperGraph,
  groupIndex: GroupIndex,
): boolean {
  const layers = proper.layers;
  const pathOf = (pnode: PNode): string =>
    (groupIndex.chainByNodeId.get(pnode.id) ?? []).join("|");
  const safe = (a: PNode, b: PNode): boolean =>
    a.isDummy || b.isDummy || pathOf(a) === pathOf(b);
  let changed = false;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      for (let k = 0; k < layer.length - 1; k++) {
        if (!safe(layer[k], layer[k + 1])) {
          continue;
        }
        const before = crossingsAround(layers, i);
        swap(layer, k, k + 1);
        if (crossingsAround(layers, i) < before) {
          improved = true;
          changed = true;
        } else {
          swap(layer, k, k + 1);
        }
      }
    }
  }
  return changed;
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
