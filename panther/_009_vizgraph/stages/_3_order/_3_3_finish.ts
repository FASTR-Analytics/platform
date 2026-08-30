// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  PNode,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { LayoutWarning } from "../../types_geometry.ts";
import type { GroupIndex } from "../../transform/derive.ts";
import { crossingsAround, swap } from "./crossings.ts";

const MAX_FINISH_ROUNDS = 32;

// Step 3.3 — the ordering finish (DOC_VIZGRAPH_ORDERING.md): after the
// sweeps and the contiguity companion, alternate dummy-band alignment and
// the contiguity-safe transpose until neither changes. The quiet exit
// CERTIFIES the joint fixpoint, which is what keeps relayout byte-identical:
// on an adopted prior ordering both passes verify as no-ops, so the stored
// ordering reproduces itself. Rounds that transpose strictly reduce
// crossings (bounded); the cap is a backstop against a pure-neutral
// alignment cycle, never observed on the corpus — hitting it forfeits the
// fixpoint certificate, so it is surfaced as a warning.
export const finishStep: PipelineStep = {
  id: "3.3",
  name: "finish",
  run: (state) =>
    finishOrdering(state.proper!, state.groupIndex, state.warnings),
};

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
