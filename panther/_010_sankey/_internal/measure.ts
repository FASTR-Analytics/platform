// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateSankeyPrimitives,
  generateSurroundsPrimitives,
  getColor,
  measureSurrounds,
  type PositionedSankeyLink,
  type PositionedSankeyNode,
  type Primitive,
  type RenderContext,
  RectCoordsDims,
} from "../deps.ts";
import type { MeasuredSankey, SankeyInputs } from "../types.ts";
import { inferColumns } from "./infer_columns.ts";
import { calculatePositions } from "./calculate_positions.ts";
import { getMergedSankeyStyle } from "./style.ts";

export function measureSankey(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: SankeyInputs,
  responsiveScale?: number,
): MeasuredSankey {
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

  const nodesWithColumns = inferColumns(item.sankeyData);

  const nodeColorResolver = (nodeId: string): string => {
    const node = item.sankeyData.nodes.find((n) => n.id === nodeId);
    return getColor(node?.color ?? sankeyStyle.defaultNodeColor);
  };

  const linkColorResolver = (fromId: string, toId: string): string => {
    const link = item.sankeyData.links.find(
      (l) => l.from === fromId && l.to === toId,
    );
    if (link?.color) {
      return getColor(link.color);
    }
    return getColor(sankeyStyle.defaultLinkColor);
  };

  const { positionedNodes, positionedLinks } = calculatePositions(
    nodesWithColumns,
    item.sankeyData.links,
    measuredSurrounds.contentRcd,
    sankeyStyle,
    nodeColorResolver,
    linkColorResolver,
  );

  const surroundsStyle = customFigureStyle.getMergedSurroundsStyle();
  const textInfo = {
    font: surroundsStyle.text.caption.font,
    fontSize: surroundsStyle.text.caption.fontSize * 0.8,
    color: surroundsStyle.text.caption.color,
    lineHeight: surroundsStyle.text.caption.lineHeight,
    lineBreakGap: surroundsStyle.text.caption.lineBreakGap,
    letterSpacing: surroundsStyle.text.caption.letterSpacing,
  };

  const sharedNodes: PositionedSankeyNode[] = positionedNodes;
  const sharedLinks: PositionedSankeyLink[] = positionedLinks;

  const sankeyPrimitives = generateSankeyPrimitives(
    rc,
    sharedNodes,
    sharedLinks,
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
