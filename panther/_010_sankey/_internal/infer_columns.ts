// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { SankeyData, SankeyNode } from "../types.ts";

export type NodeWithColumn = SankeyNode & {
  column: number;
};

export function inferColumns(data: SankeyData): NodeWithColumn[] {
  const nodeMap = new Map<string, SankeyNode>();
  for (const node of data.nodes) {
    nodeMap.set(node.id, node);
  }

  const incomingLinks = new Map<string, string[]>();
  const outgoingLinks = new Map<string, string[]>();

  for (const node of data.nodes) {
    incomingLinks.set(node.id, []);
    outgoingLinks.set(node.id, []);
  }

  for (const link of data.links) {
    const incoming = incomingLinks.get(link.to);
    if (incoming) {
      incoming.push(link.from);
    }
    const outgoing = outgoingLinks.get(link.from);
    if (outgoing) {
      outgoing.push(link.to);
    }
  }

  const result: NodeWithColumn[] = [];

  for (const node of data.nodes) {
    if (node.column !== undefined) {
      result.push({ ...node, column: node.column });
    } else {
      const column = computeColumn(node.id, incomingLinks, new Set());
      result.push({ ...node, column });
    }
  }

  return result;
}

function computeColumn(
  nodeId: string,
  incomingLinks: Map<string, string[]>,
  visited: Set<string>,
): number {
  if (visited.has(nodeId)) {
    return 0;
  }
  visited.add(nodeId);

  const incoming = incomingLinks.get(nodeId) ?? [];
  if (incoming.length === 0) {
    return 0;
  }

  let maxParentColumn = 0;
  for (const parentId of incoming) {
    const parentColumn = computeColumn(parentId, incomingLinks, visited);
    maxParentColumn = Math.max(maxParentColumn, parentColumn);
  }

  return maxParentColumn + 1;
}

export function getMaxColumn(nodes: NodeWithColumn[]): number {
  let max = 0;
  for (const node of nodes) {
    max = Math.max(max, node.column);
  }
  return max;
}

export function getNodesByColumn(
  nodes: NodeWithColumn[],
): Map<number, NodeWithColumn[]> {
  const result = new Map<number, NodeWithColumn[]>();
  for (const node of nodes) {
    const col = result.get(node.column);
    if (col) {
      col.push(node);
    } else {
      result.set(node.column, [node]);
    }
  }
  return result;
}
