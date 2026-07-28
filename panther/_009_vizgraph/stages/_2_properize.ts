// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { GraphIndex } from "../_internal/graph_index.ts";
import type { PriorIndex } from "../stability.ts";
import type { RankResult } from "./_1_rank.ts";

// Stage 2: make the graph proper. Long edges become chains of zero-size dummy
// nodes (one per crossed layer, internal ids only); same-layer edges are
// extracted here — they skip ordering/coords as edges and re-enter at routing
// (their endpoints still participate as nodes).
export function properizeStage(
  index: GraphIndex,
  rank: RankResult,
  prior: PriorIndex | undefined,
): ProperGraph {
  const layerCount = rank.layerValueByIndex.length;
  const layers: PNode[][] = Array.from({ length: layerCount }, () => []);
  const pnodeByRealId = new Map<string, PNode>();

  // The order-seed policy (DOC_VIZGRAPH_ORDERING.md): prior layout position
  // wins over model seq (sticky relayout); nodes new since the prior seed
  // after the survivors, by seq/input order — the stage-3 sweeps then settle
  // them by barycenter.
  const realNodes = [...index.nodeById.values()];
  realNodes.sort((a, b) => {
    const pa = prior?.centerYByNodeId.get(a.id);
    const pb = prior?.centerYByNodeId.get(b.id);
    if (pa !== undefined && pb !== undefined) {
      return pa - pb;
    }
    if (pa !== undefined) {
      return -1;
    }
    if (pb !== undefined) {
      return 1;
    }
    return (a.seq ?? 0) - (b.seq ?? 0);
  });
  for (const node of realNodes) {
    const layerIndex = rank.layerIndexByNodeId.get(node.id)!;
    const pnode: PNode = {
      id: node.id,
      isDummy: false,
      isBackwardDummy: false,
      // Unsized nodes are placeholders until stage [3½] measures them.
      w: node.size?.w ?? 0,
      h: node.size?.h ?? 0,
      layerIndex,
      order: 0,
      x: 0,
      y: 0,
      padTop: 0,
      padBottom: 0,
      leftNeighbors: [],
      rightNeighbors: [],
    };
    layers[layerIndex].push(pnode);
    pnodeByRealId.set(node.id, pnode);
  }

  const chainByEdgeId = new Map<string, PNode[]>();
  const sameLayerEdges: ProperGraph["sameLayerEdges"] = [];
  const crossLayerEdges: ProperGraph["crossLayerEdges"] = [];

  for (const edge of index.validEdges) {
    const from = pnodeByRealId.get(edge.from)!;
    const to = pnodeByRealId.get(edge.to)!;
    if (from.layerIndex === to.layerIndex) {
      sameLayerEdges.push(edge);
      continue;
    }
    crossLayerEdges.push(edge);
    const step = from.layerIndex < to.layerIndex ? 1 : -1;
    const chain: PNode[] = [];
    for (
      let layerIndex = from.layerIndex + step;
      layerIndex !== to.layerIndex;
      layerIndex += step
    ) {
      const dummy: PNode = {
        id: `__dummy:${edge.id}:${layerIndex}`,
        isDummy: true,
        isBackwardDummy: step === -1,
        w: 0,
        h: 0,
        layerIndex,
        order: 0,
        x: 0,
        y: 0,
        padTop: 0,
        padBottom: 0,
        leftNeighbors: [],
        rightNeighbors: [],
      };
      layers[layerIndex].push(dummy);
      chain.push(dummy);
    }
    chainByEdgeId.set(edge.id, chain);
    const pathNodes = [from, ...chain, to];
    for (let i = 0; i < pathNodes.length - 1; i++) {
      linkSegment(pathNodes[i], pathNodes[i + 1]);
    }
  }

  for (const layer of layers) {
    layer.forEach((pnode, i) => {
      pnode.order = i;
    });
  }

  return {
    layers,
    pnodeByRealId,
    chainByEdgeId,
    sameLayerEdges,
    crossLayerEdges,
    innermostGroupByNodeId: new Map(),
  };
}

function linkSegment(a: PNode, b: PNode): void {
  if (a.layerIndex < b.layerIndex) {
    a.rightNeighbors.push(b);
    b.leftNeighbors.push(a);
  } else {
    a.leftNeighbors.push(b);
    b.rightNeighbors.push(a);
  }
}
