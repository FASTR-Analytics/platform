// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type PathSegment, RectCoordsDims, Z_INDEX } from "../deps.ts";
import type { Primitive } from "../deps.ts";
import type { MergedSankeyStyle, PositionedLink, PositionedNode } from "../types.ts";

export function buildLinkPrimitives(
  links: PositionedLink[],
  nodePositionMap: Map<string, PositionedNode>,
  style: MergedSankeyStyle,
): Primitive[] {
  const primitives: Primitive[] = [];

  for (const link of links) {
    const fromNode = nodePositionMap.get(link.from);
    const toNode = nodePositionMap.get(link.to);

    if (!fromNode || !toNode) continue;

    const sourceX = fromNode.x + fromNode.width;
    const targetX = toNode.x;

    const sourceTopY = link.fromY;
    const sourceBottomY = link.fromY + link.height;
    const targetTopY = link.toY;
    const targetBottomY = link.toY + link.height;

    const controlPointOffset = (targetX - sourceX) / 2;

    const pathSegments: PathSegment[] = [
      { type: "moveTo", x: sourceX, y: sourceTopY },
      {
        type: "bezierCurveTo",
        cp1x: sourceX + controlPointOffset,
        cp1y: sourceTopY,
        cp2x: targetX - controlPointOffset,
        cp2y: targetTopY,
        x: targetX,
        y: targetTopY,
      },
      { type: "lineTo", x: targetX, y: targetBottomY },
      {
        type: "bezierCurveTo",
        cp1x: targetX - controlPointOffset,
        cp1y: targetBottomY,
        cp2x: sourceX + controlPointOffset,
        cp2y: sourceBottomY,
        x: sourceX,
        y: sourceBottomY,
      },
      { type: "lineTo", x: sourceX, y: sourceTopY },
    ];

    const minX = Math.min(sourceX, targetX);
    const maxX = Math.max(sourceX, targetX);
    const minY = Math.min(sourceTopY, sourceBottomY, targetTopY, targetBottomY);
    const maxY = Math.max(sourceTopY, sourceBottomY, targetTopY, targetBottomY);

    primitives.push({
      type: "sankey-link",
      key: `sankey-link-${link.from}-${link.to}`,
      bounds: new RectCoordsDims({
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      }),
      zIndex: Z_INDEX.SANKEY_LINK,
      meta: {
        fromNodeId: link.from,
        toNodeId: link.to,
        value: link.value,
      },
      pathSegments,
      pathStyle: {
        fill: {
          color: link.color,
          opacity: style.linkOpacity,
        },
      },
    });
  }

  return primitives;
}
