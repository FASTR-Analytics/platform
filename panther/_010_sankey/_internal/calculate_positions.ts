// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../deps.ts";
import type {
  MergedSankeyStyle,
  PositionedLink,
  PositionedNode,
  SankeyLink,
} from "../types.ts";
import {
  getMaxColumn,
  getNodesByColumn,
  type NodeWithColumn,
} from "./infer_columns.ts";

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
  if (style.layoutMode === "tiered") {
    return calculateTieredPositions(
      nodes,
      links,
      bounds,
      style,
      nodeColorResolver,
      linkColorResolver,
    );
  }
  return calculateFlowPositions(
    nodes,
    links,
    bounds,
    style,
    nodeColorResolver,
    linkColorResolver,
  );
}

// =============================================================================
// FLOW LAYOUT (original behavior)
// =============================================================================

function calculateFlowPositions(
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
    ? (availableWidth - style.nodeWidth * (maxColumn + 1)) /
      Math.max(maxColumn, 1)
    : style.columnGap;

  const positionedNodes: PositionedNode[] = [];
  const nodePositionMap = new Map<string, PositionedNode>();

  for (let col = 0; col <= maxColumn; col++) {
    const colNodes = nodesByColumn.get(col) ?? [];

    const totalGaps = Math.max(0, colNodes.length - 1) * style.nodeGap;
    const scaleFactor = maxTotalValue > 0
      ? (availableHeight - totalGaps) / maxTotalValue
      : 1;

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

  const positionedLinks = calculateFlowLinkPositions(
    links,
    nodePositionMap,
    linkColorResolver,
  );

  return { positionedNodes, positionedLinks };
}

// =============================================================================
// TIERED LAYOUT (new behavior)
// =============================================================================

function calculateTieredPositions(
  nodes: NodeWithColumn[],
  links: SankeyLink[],
  bounds: RectCoordsDims,
  style: MergedSankeyStyle,
  nodeColorResolver: (nodeId: string) => string,
  linkColorResolver: (fromId: string, toId: string) => string,
): LayoutResult {
  const maxColumn = getMaxColumn(nodes);
  const nodeValueMap = calculateNodeValues(nodes, links);

  const availableHeight = bounds.h();
  const availableWidth = bounds.w();

  const columnGap = style.columnGap === "auto"
    ? (availableWidth - style.nodeWidth * (maxColumn + 1)) /
      Math.max(maxColumn, 1)
    : style.columnGap;

  // Step 1: Determine row assignments for each node
  const nodeRows = new Map<
    string,
    { row: number; spanRows?: [number, number] }
  >();
  let maxRow = 0;

  for (const node of nodes) {
    if (node.spanRows !== undefined) {
      nodeRows.set(node.id, { row: node.spanRows[0], spanRows: node.spanRows });
      maxRow = Math.max(maxRow, node.spanRows[1]);
    } else if (node.row !== undefined) {
      nodeRows.set(node.id, { row: node.row });
      maxRow = Math.max(maxRow, node.row);
    } else {
      // Default: assign row 0 if not specified
      nodeRows.set(node.id, { row: 0 });
    }
  }

  // Step 2: Calculate total flow value per row (sum of non-spanning node values)
  const rowTotalValues = new Map<number, number>();
  for (let r = 0; r <= maxRow; r++) {
    rowTotalValues.set(r, 0);
  }

  for (const node of nodes) {
    const rowInfo = nodeRows.get(node.id)!;
    const value = nodeValueMap.get(node.id) ?? 0;

    if (rowInfo.spanRows === undefined) {
      const currentTotal = rowTotalValues.get(rowInfo.row) ?? 0;
      rowTotalValues.set(rowInfo.row, currentTotal + value);
    }
  }

  // Step 3: Calculate global scale factor based on total flow
  // Total flow = sum of all row totals (this ensures all nodes fit)
  let totalFlowValue = 0;
  for (const [, value] of rowTotalValues) {
    totalFlowValue += value;
  }

  const totalGaps = Math.max(0, maxRow) * style.nodeGap;
  const scaleFactor = totalFlowValue > 0
    ? (availableHeight - totalGaps) / totalFlowValue
    : 1;

  // Step 4: Calculate row Y positions based on actual row heights
  const rowPositions = new Map<number, { y: number; height: number }>();
  let currentY = bounds.y();

  for (let r = 0; r <= maxRow; r++) {
    const rowTotal = rowTotalValues.get(r) ?? 0;
    const rowHeight = rowTotal * scaleFactor;
    rowPositions.set(r, { y: currentY, height: rowHeight });
    currentY += rowHeight + style.nodeGap;
  }

  // Step 5: Position nodes - heights based on flow values, not row proportions
  const positionedNodes: PositionedNode[] = [];
  const nodePositionMap = new Map<string, PositionedNode>();

  // Track Y offset within each row for stacking multiple nodes
  const rowYOffsets = new Map<number, number>();
  for (let r = 0; r <= maxRow; r++) {
    rowYOffsets.set(r, 0);
  }

  for (const node of nodes) {
    const rowInfo = nodeRows.get(node.id)!;
    const value = nodeValueMap.get(node.id) ?? 0;
    const x = bounds.x() + node.column * (style.nodeWidth + columnGap);

    let y: number;
    let height: number;
    let rowStart: number | undefined;
    let rowEnd: number | undefined;

    // Node height is ALWAYS based on flow value (fundamental Sankey rule)
    height = value * scaleFactor;

    if (rowInfo.spanRows !== undefined) {
      // Spanning node: position at start of first row
      const startRow = rowInfo.spanRows[0];
      const startPos = rowPositions.get(startRow)!;
      y = startPos.y;
      rowStart = startRow;
      rowEnd = rowInfo.spanRows[1];
    } else {
      // Regular node: stack within its row
      const rowPos = rowPositions.get(rowInfo.row)!;
      const rowOffset = rowYOffsets.get(rowInfo.row) ?? 0;
      y = rowPos.y + rowOffset;
      rowYOffsets.set(rowInfo.row, rowOffset + height);
    }

    const positioned: PositionedNode = {
      id: node.id,
      label: node.label,
      color: nodeColorResolver(node.id),
      column: node.column,
      x,
      y,
      width: style.nodeWidth,
      height,
      totalValue: value,
      row: rowInfo.row,
      rowStart,
      rowEnd,
    };

    positionedNodes.push(positioned);
    nodePositionMap.set(node.id, positioned);
  }

  // Step 4: Calculate link positions
  const positionedLinks = calculateTieredLinkPositions(
    links,
    nodePositionMap,
    rowPositions,
    linkColorResolver,
  );

  return { positionedNodes, positionedLinks };
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

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
    const total = colNodes.reduce(
      (sum, n) => sum + (nodeValueMap.get(n.id) ?? 0),
      0,
    );
    max = Math.max(max, total);
  }
  return max;
}

// =============================================================================
// LINK POSITIONING - FLOW MODE
// =============================================================================

function calculateFlowLinkPositions(
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
      fromX: fromNode.x + fromNode.width,
      fromY,
      toX: toNode.x,
      toY,
      height: linkHeight,
    });

    nodeOutgoingOffset.set(link.from, fromOffset + linkHeight);
    nodeIncomingOffset.set(link.to, toOffset + linkHeight);
  }

  return result;
}

// =============================================================================
// LINK POSITIONING - TIERED MODE
// =============================================================================

function calculateTieredLinkPositions(
  links: SankeyLink[],
  nodePositionMap: Map<string, PositionedNode>,
  rowPositions: Map<number, { y: number; height: number }>,
  linkColorResolver: (fromId: string, toId: string) => string,
): PositionedLink[] {
  // Group links by destination row for ordering
  const linksByDestRow = new Map<number, SankeyLink[]>();
  for (const link of links) {
    const toNode = nodePositionMap.get(link.to);
    if (!toNode) continue;
    const destRow = toNode.row ?? 0;
    const existing = linksByDestRow.get(destRow) ?? [];
    existing.push(link);
    linksByDestRow.set(destRow, existing);
  }

  // Track offsets within each row band for source nodes
  // Key: `${nodeId}-${destRow}` -> offset within that row's band
  const sourceRowBandOffsets = new Map<string, number>();

  // Track incoming offsets for destination nodes
  const nodeIncomingOffset = new Map<string, number>();
  for (const [nodeId] of nodePositionMap) {
    nodeIncomingOffset.set(nodeId, 0);
  }

  const result: PositionedLink[] = [];

  // Process links row by row (top to bottom)
  const sortedRows = Array.from(linksByDestRow.keys()).sort((a, b) => a - b);

  for (const destRow of sortedRows) {
    const rowLinks = linksByDestRow.get(destRow) ?? [];

    for (const link of rowLinks) {
      const fromNode = nodePositionMap.get(link.from);
      const toNode = nodePositionMap.get(link.to);

      if (!fromNode || !toNode) continue;

      // Link height proportional to flow (same formula for all nodes since heights are flow-based)
      const linkHeight = fromNode.totalValue > 0
        ? (link.value / fromNode.totalValue) * fromNode.height
        : 0;

      // Source: stack outgoing links within the node
      const outKey = `${fromNode.id}-out`;
      const outOffset = sourceRowBandOffsets.get(outKey) ?? 0;
      const fromY = fromNode.y + outOffset;
      sourceRowBandOffsets.set(outKey, outOffset + linkHeight);

      // Destination: stack incoming links
      const toOffset = nodeIncomingOffset.get(link.to) ?? 0;
      const toY = toNode.y + toOffset;
      nodeIncomingOffset.set(link.to, toOffset + linkHeight);

      result.push({
        from: link.from,
        to: link.to,
        value: link.value,
        color: linkColorResolver(link.from, link.to),
        fromX: fromNode.x + fromNode.width,
        fromY,
        toX: toNode.x,
        toY,
        height: linkHeight,
      });
    }
  }

  return result;
}
