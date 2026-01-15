// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PathSegment,
  Primitive,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { Coordinates, RectCoordsDims, Z_INDEX } from "../deps.ts";
import type {
  PositionedSankeyLink,
  PositionedSankeyNode,
  SankeyPrimitiveOptions,
} from "./types.ts";

export function generateSankeyPrimitives(
  rc: RenderContext,
  nodes: PositionedSankeyNode[],
  links: PositionedSankeyLink[],
  options: SankeyPrimitiveOptions,
  textInfo: TextInfoUnkeyed,
): Primitive[] {
  const primitives: Primitive[] = [];

  primitives.push(...generateNodePrimitives(rc, nodes, options, textInfo));
  primitives.push(...generateLinkPrimitives(links, options));

  return primitives;
}

function generateNodePrimitives(
  rc: RenderContext,
  nodes: PositionedSankeyNode[],
  options: SankeyPrimitiveOptions,
  textInfo: TextInfoUnkeyed,
): Primitive[] {
  const primitives: Primitive[] = [];
  const maxColumn = nodes.reduce((max, n) => Math.max(max, n.column), 0);

  for (const node of nodes) {
    const rcd = new RectCoordsDims({
      x: node.x,
      y: node.y,
      w: node.width,
      h: node.height,
    });

    let labelData:
      | { mText: any; position: Coordinates; alignment: "left" | "right" }
      | undefined;

    if (node.label) {
      const mText = rc.mText(node.label, textInfo, 200);
      const isLastColumn = node.column === maxColumn;
      const labelOnRight = !isLastColumn;
      const labelX = labelOnRight
        ? node.x + node.width + options.labelGap
        : node.x - options.labelGap;
      const labelY = node.y + node.height / 2;

      labelData = {
        mText,
        position: new Coordinates([labelX, labelY]),
        alignment: labelOnRight ? "left" : "right",
      };
    }

    primitives.push({
      type: "sankey-node",
      key: `sankey-node-${node.id}`,
      bounds: rcd,
      zIndex: Z_INDEX.SANKEY_NODE,
      meta: {
        nodeId: node.id,
        column: node.column,
      },
      rcd,
      fillColor: node.color,
      label: labelData,
    });
  }

  return primitives;
}

function generateLinkPrimitives(
  links: PositionedSankeyLink[],
  options: SankeyPrimitiveOptions,
): Primitive[] {
  const primitives: Primitive[] = [];

  for (const link of links) {
    const sourceX = link.fromX;
    const targetX = link.toX;

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
          opacity: options.linkOpacity,
        },
      },
    });
  }

  return primitives;
}
