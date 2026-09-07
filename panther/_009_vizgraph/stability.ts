// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Geometry, OrderEntry } from "./types_geometry.ts";
import type { PNode, ProperGraph } from "./_internal/pipeline_types.ts";

// Sticky relayout (DOC_VIZGRAPH_ARCHITECTURE.md geometry contract guarantee
// 3). Stickiness lives entirely in stage-3 ordering; placement never reads
// the prior (it is a pure function of ordering + sizes, which is what makes
// relayout idempotent). Two mechanisms:
// - HARD: when the prior's order record exactly covers this model's pnodes
//   (adoptPriorOrder), the ordering is adopted verbatim and the sweeps are
//   skipped — an unchanged model reproduces the prior byte-for-byte.
// - SOFT: otherwise, prior center-y seeds the stage-2 initial order
//   (buildPriorIndex) and the sweeps may override it.
export type PriorIndex = {
  centerYByNodeId: Map<string, number>;
};

export function buildPriorIndex(
  prior: Geometry | undefined,
): PriorIndex | undefined {
  if (prior === undefined) {
    return undefined;
  }
  const centerYByNodeId = new Map<string, number>();
  for (const [id, node] of Object.entries(prior.nodes)) {
    centerYByNodeId.set(id, node.y + node.h / 2);
  }
  return { centerYByNodeId };
}

// Node/edge id spaces are independent, so order matching keys are namespaced.
function pnodeKey(pnode: PNode, edgeByDummy: Map<PNode, string>): string {
  return pnode.isDummy ? `e:${edgeByDummy.get(pnode)}` : `n:${pnode.id}`;
}

function entryKey(entry: OrderEntry): string {
  return typeof entry === "string" ? `n:${entry}` : `e:${entry.edge}`;
}

function buildEdgeByDummy(proper: ProperGraph): Map<PNode, string> {
  const edgeByDummy = new Map<PNode, string>();
  for (const [edgeId, chain] of proper.chainByEdgeId) {
    for (const dummy of chain) {
      edgeByDummy.set(dummy, edgeId);
    }
  }
  return edgeByDummy;
}

// The order record emitted on every Geometry: layer sequences as caller-id
// tokens (a dummy is identified by its edge id — one dummy per edge per
// layer, so the token is unique within its layer).
export function buildOrderRecord(proper: ProperGraph): OrderEntry[][] {
  const edgeByDummy = buildEdgeByDummy(proper);
  return proper.layers.map((layer) =>
    layer.map((pnode) =>
      pnode.isDummy ? { edge: edgeByDummy.get(pnode)! } : pnode.id
    )
  );
}

// Hard stickiness: when the prior's order record is exactly a per-layer
// permutation of this model's pnodes (same layer count, same token sets),
// reorder every layer to the prior sequence and report true — the caller
// skips the sweeps. Any mismatch (node/edge/layer/fold change, duplicate
// ids) reports false with the graph untouched, and the soft seed applies.
export function adoptPriorOrder(
  proper: ProperGraph,
  priorOrder: OrderEntry[][] | undefined,
): boolean {
  if (priorOrder === undefined || priorOrder.length !== proper.layers.length) {
    return false;
  }
  const edgeByDummy = buildEdgeByDummy(proper);
  const adopted: PNode[][] = [];
  for (let i = 0; i < proper.layers.length; i++) {
    const layer = proper.layers[i];
    const sequence = priorOrder[i];
    if (sequence.length !== layer.length) {
      return false;
    }
    const byKey = new Map<string, PNode>();
    for (const pnode of layer) {
      const key = pnodeKey(pnode, edgeByDummy);
      if (byKey.has(key)) {
        return false;
      }
      byKey.set(key, pnode);
    }
    const arranged: PNode[] = [];
    for (const entry of sequence) {
      const key = entryKey(entry);
      const pnode = byKey.get(key);
      if (pnode === undefined) {
        return false;
      }
      byKey.delete(key);
      arranged.push(pnode);
    }
    adopted.push(arranged);
  }
  for (let i = 0; i < adopted.length; i++) {
    proper.layers[i] = adopted[i];
    proper.layers[i].forEach((pnode, k) => {
      pnode.order = k;
    });
  }
  return true;
}
