// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateSankeyPrimitives,
  generateSurroundsPrimitives,
  measureSurrounds,
  type PositionedSankeyLink,
  type PositionedSankeyNode,
  type Primitive,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  renderFigurePrimitives,
} from "./deps.ts";
import type {
  ExplicitSankeyLink,
  ExplicitSankeyNode,
  MeasuredSankeyExplicit,
  SankeyExplicitInputs,
} from "./types.ts";
import { getMergedSankeyStyle } from "./style.ts";

type BoundingBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
};

function getInputBoundingBox(
  nodes: ExplicitSankeyNode[],
  links: ExplicitSankeyLink[],
): BoundingBox {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  }
  for (const link of links) {
    minY = Math.min(minY, link.fromY, link.toY);
    maxY = Math.max(maxY, link.fromY + link.height, link.toY + link.height);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function measure(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: SankeyExplicitInputs,
  responsiveScale?: number,
): MeasuredSankeyExplicit {
  const customFigureStyle = new CustomFigureStyle(item.style, responsiveScale);

  const measuredSurrounds = measureSurrounds(
    rc,
    bounds,
    customFigureStyle,
    item.caption,
    item.subCaption,
    item.footnote,
    item.legendItemsOrLabels,
  );

  const sankeyStyle = getMergedSankeyStyle(customFigureStyle);

  const surroundsStyle = customFigureStyle.getMergedSurroundsStyle();
  const textInfo = {
    font: surroundsStyle.text.caption.font,
    fontSize: surroundsStyle.text.caption.fontSize * 0.8,
    color: surroundsStyle.text.caption.color,
    lineHeight: surroundsStyle.text.caption.lineHeight,
    lineBreakGap: surroundsStyle.text.caption.lineBreakGap,
    letterSpacing: surroundsStyle.text.caption.letterSpacing,
  };

  const bbox = getInputBoundingBox(item.nodes, item.links);
  const contentRcd = measuredSurrounds.contentRcd;

  // Stretch X positions to fill width, but keep node widths fixed
  const scaleX = contentRcd.w() / bbox.width;

  const transformX = (x: number) => contentRcd.x() + (x - bbox.minX) * scaleX;
  const transformY = (y: number) => contentRcd.y() + (y - bbox.minY);

  // Position nodes: X positions scaled, widths fixed
  const positionedNodes: PositionedSankeyNode[] = item.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    color: node.color,
    column: node.column,
    x: transformX(node.x),
    y: transformY(node.y),
    width: node.width, // Keep original width
    height: node.height,
    totalValue: node.height, // Use height as proxy for value
  }));

  // Build node map for link X calculation
  const nodeMap = new Map<string, PositionedSankeyNode>();
  for (const node of positionedNodes) {
    nodeMap.set(node.id, node);
  }

  // Position links: X calculated from nodes, Y transformed
  const positionedLinks: PositionedSankeyLink[] = item.links.map((link) => {
    const fromNode = nodeMap.get(link.from);
    const toNode = nodeMap.get(link.to);

    return {
      from: link.from,
      to: link.to,
      value: link.height,
      color: link.color,
      fromX: fromNode ? fromNode.x + fromNode.width : 0,
      fromY: transformY(link.fromY),
      toX: toNode ? toNode.x : 0,
      toY: transformY(link.toY),
      height: link.height,
    };
  });

  const sankeyPrimitives = generateSankeyPrimitives(
    rc,
    positionedNodes,
    positionedLinks,
    {
      labelGap: sankeyStyle.labelGap,
      linkOpacity: sankeyStyle.linkOpacity,
    },
    textInfo,
  );

  const surroundsPrimitives = generateSurroundsPrimitives(measuredSurrounds);

  const primitives: Primitive[] = [
    ...sankeyPrimitives,
    ...surroundsPrimitives,
  ];

  return {
    item,
    bounds,
    measuredSurrounds,
    extraHeightDueToSurrounds: measuredSurrounds.extraHeightDueToSurrounds,
    customFigureStyle,
    primitives,
  };
}

function render(rc: RenderContext, measured: MeasuredSankeyExplicit): void {
  renderFigurePrimitives(rc, measured.primitives);
}

function measureAndRender(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: SankeyExplicitInputs,
  responsiveScale?: number,
): void {
  const measured = measure(rc, bounds, item, responsiveScale);
  render(rc, measured);
}

function getIdealHeight(
  rc: RenderContext,
  width: number,
  item: SankeyExplicitInputs,
  responsiveScale?: number,
): number {
  const customFigureStyle = new CustomFigureStyle(item.style, responsiveScale);

  const tempBounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 1000 });
  const measuredSurrounds = measureSurrounds(
    rc,
    tempBounds,
    customFigureStyle,
    item.caption,
    item.subCaption,
    item.footnote,
    item.legendItemsOrLabels,
  );

  const bbox = getInputBoundingBox(item.nodes, item.links);

  return bbox.height + measuredSurrounds.extraHeightDueToSurrounds;
}

function isType(item: unknown): item is SankeyExplicitInputs {
  return Array.isArray((item as SankeyExplicitInputs).nodes) &&
    Array.isArray((item as SankeyExplicitInputs).links);
}

export const SankeyExplicitRenderer: Renderer<
  SankeyExplicitInputs,
  MeasuredSankeyExplicit
> = {
  isType,
  measure,
  render,
  measureAndRender,
  getIdealHeight,
};
