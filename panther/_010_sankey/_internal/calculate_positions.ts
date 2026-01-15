// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../deps.ts";
import type { MergedSankeyStyle, PositionedLink, PositionedNode, SankeyData, SankeyLink } from "../types.ts";
import { getMaxColumn, getNodesByColumn, type NodeWithColumn } from "./infer_columns.ts";

export type LayoutResult = {
  positionedNodes: PositionedNode[];
  positionedLinks: PositionedLink[];
};

export function calculatePositions(
  nodes: NodeWithColumn[],
  links: SankeyLink[],
  bounds: RectCoordsDims,
  style: MergedSankeyStyle,
  nodeColorResolver: (nodeId: string) => string,
  linkColorResolver: (fromId: string, toId: string) => string,
): LayoutResult {
  const maxColumn = getMaxColumn(nodes);
  const nodesByColumn = getNodesByColumn(nodes);

  const nodeValueMap = calculateNodeValues(nodes, links);

  const maxTotalValue = getMaxColumnTotalValue(nodesByColumn, nodeValueMap);

  const availableHeight = bounds.h();
  const availableWidth = bounds.w();

  const columnGap = style.columnGap === "auto"
    ? (availableWidth - style.nodeWidth * (maxColumn + 1)) / Math.max(maxColumn, 1)
    : style.columnGap;

  const positionedNodes: PositionedNode[] = [];
  const nodePositionMap = new Map<string, PositionedNode>();

  for (let col = 0; col <= maxColumn; col++) {
    const colNodes = nodesByColumn.get(col) ?? [];

    const totalValue = colNodes.reduce((sum, n) => sum + (nodeValueMap.get(n.id) ?? 0), 0);
    const totalGaps = Math.max(0, colNodes.length - 1) * style.nodeGap;
    const scaleFactor = maxTotalValue > 0 ? (availableHeight - totalGaps) / maxTotalValue : 1;

    let currentY = bounds.y();

    for (const node of colNodes) {
      const value = nodeValueMap.get(node.id) ?? 0;
      const height = value * scaleFactor;

      const x = bounds.x() + col * (style.nodeWidth + columnGap);

      const positioned: PositionedNode = {
        id: node.id,
        label: node.label,
        color: nodeColorResolver(node.id),
        column: col,
        x,
        y: currentY,
        width: style.nodeWidth,
        height,
        totalValue: value,
      };

      positionedNodes.push(positioned);
      nodePositionMap.set(node.id, positioned);

      currentY += height + style.nodeGap;
    }
  }

  const positionedLinks = calculateLinkPositions(
    links,
    nodePositionMap,
    linkColorResolver,
  );

  return { positionedNodes, positionedLinks };
}

function calculateNodeValues(
  nodes: NodeWithColumn[],
  links: SankeyLink[],
): Map<string, number> {
  const result = new Map<string, number>();

  const incomingSum = new Map<string, number>();
  const outgoingSum = new Map<string, number>();

  for (const node of nodes) {
    incomingSum.set(node.id, 0);
    outgoingSum.set(node.id, 0);
  }

  for (const link of links) {
    const out = outgoingSum.get(link.from) ?? 0;
    outgoingSum.set(link.from, out + link.value);

    const inc = incomingSum.get(link.to) ?? 0;
    incomingSum.set(link.to, inc + link.value);
  }

  for (const node of nodes) {
    const inc = incomingSum.get(node.id) ?? 0;
    const out = outgoingSum.get(node.id) ?? 0;
    result.set(node.id, Math.max(inc, out));
  }

  return result;
}

function getMaxColumnTotalValue(
  nodesByColumn: Map<number, NodeWithColumn[]>,
  nodeValueMap: Map<string, number>,
): number {
  let max = 0;
  for (const [, colNodes] of nodesByColumn) {
    const total = colNodes.reduce((sum, n) => sum + (nodeValueMap.get(n.id) ?? 0), 0);
    max = Math.max(max, total);
  }
  return max;
}

function calculateLinkPositions(
  links: SankeyLink[],
  nodePositionMap: Map<string, PositionedNode>,
  linkColorResolver: (fromId: string, toId: string) => string,
): PositionedLink[] {
  const nodeOutgoingOffset = new Map<string, number>();
  const nodeIncomingOffset = new Map<string, number>();

  for (const [nodeId] of nodePositionMap) {
    nodeOutgoingOffset.set(nodeId, 0);
    nodeIncomingOffset.set(nodeId, 0);
  }

  const result: PositionedLink[] = [];

  for (const link of links) {
    const fromNode = nodePositionMap.get(link.from);
    const toNode = nodePositionMap.get(link.to);

    if (!fromNode || !toNode) continue;

    const linkHeight = (link.value / fromNode.totalValue) * fromNode.height;

    const fromOffset = nodeOutgoingOffset.get(link.from) ?? 0;
    const toOffset = nodeIncomingOffset.get(link.to) ?? 0;

    const fromY = fromNode.y + fromOffset;
    const toY = toNode.y + toOffset;

    result.push({
      from: link.from,
      to: link.to,
      value: link.value,
      color: linkColorResolver(link.from, link.to),
      fromY,
      toY,
      height: linkHeight,
    });

    nodeOutgoingOffset.set(link.from, fromOffset + linkHeight);
    nodeIncomingOffset.set(link.to, toOffset + linkHeight);
  }

  return result;
}
