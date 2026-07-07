// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EdgeIn, GraphModel, NodeIn } from "../types_model.ts";

export type GraphIndex = {
  nodeById: Map<string, NodeIn>;
  outEdges: Map<string, EdgeIn[]>;
  inEdges: Map<string, EdgeIn[]>;
  validEdges: EdgeIn[];
  danglingEdges: EdgeIn[];
};

export function buildGraphIndex(model: GraphModel): GraphIndex {
  const nodeById = new Map<string, NodeIn>();
  for (const node of model.nodes) {
    if (!nodeById.has(node.id)) {
      nodeById.set(node.id, node);
    }
  }
  const outEdges = new Map<string, EdgeIn[]>();
  const inEdges = new Map<string, EdgeIn[]>();
  for (const node of model.nodes) {
    outEdges.set(node.id, []);
    inEdges.set(node.id, []);
  }
  const validEdges: EdgeIn[] = [];
  const danglingEdges: EdgeIn[] = [];
  for (const edge of model.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      danglingEdges.push(edge);
      continue;
    }
    validEdges.push(edge);
    outEdges.get(edge.from)!.push(edge);
    inEdges.get(edge.to)!.push(edge);
  }
  return { nodeById, outEdges, inEdges, validEdges, danglingEdges };
}

// Returns one cycle as a node-id path (first id repeated at the end), or
// undefined if the edge graph is acyclic.
export function findCycle(index: GraphIndex): string[] | undefined {
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];

  function visit(nodeId: string): string[] | undefined {
    visited.add(nodeId);
    onStack.add(nodeId);
    stack.push(nodeId);
    for (const edge of index.outEdges.get(nodeId) ?? []) {
      if (onStack.has(edge.to)) {
        const start = stack.indexOf(edge.to);
        return [...stack.slice(start), edge.to];
      }
      if (!visited.has(edge.to)) {
        const found = visit(edge.to);
        if (found !== undefined) {
          return found;
        }
      }
    }
    onStack.delete(nodeId);
    stack.pop();
    return undefined;
  }

  for (const nodeId of index.nodeById.keys()) {
    if (!visited.has(nodeId)) {
      const found = visit(nodeId);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

export type ResolvedLayers = {
  layerByNodeId: Map<string, number>;
  hadCycle: boolean;
  missingLayerNodeIds: string[];
};

// Longest-path layering over predecessors; back-edges (cycles) are skipped so
// the result is always defined. When useGivenLayers is true, author-supplied
// layers win and only nodes without one are derived.
export function resolveLayers(
  index: GraphIndex,
  useGivenLayers: boolean,
): ResolvedLayers {
  const layerByNodeId = new Map<string, number>();
  const missingLayerNodeIds: string[] = [];
  let hadCycle = false;
  const onStack = new Set<string>();

  function layerOf(nodeId: string): number {
    const existing = layerByNodeId.get(nodeId);
    if (existing !== undefined) {
      return existing;
    }
    const node = index.nodeById.get(nodeId)!;
    if (useGivenLayers && node.layer !== undefined) {
      layerByNodeId.set(nodeId, node.layer);
      return node.layer;
    }
    onStack.add(nodeId);
    let layer = 0;
    for (const edge of index.inEdges.get(nodeId) ?? []) {
      if (onStack.has(edge.from)) {
        hadCycle = true;
        continue;
      }
      layer = Math.max(layer, layerOf(edge.from) + 1);
    }
    onStack.delete(nodeId);
    layerByNodeId.set(nodeId, layer);
    if (useGivenLayers) {
      missingLayerNodeIds.push(nodeId);
    }
    return layer;
  }

  for (const nodeId of index.nodeById.keys()) {
    layerOf(nodeId);
  }
  return { layerByNodeId, hadCycle, missingLayerNodeIds };
}
