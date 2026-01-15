// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, RectCoordsDims, Z_INDEX, type Primitive, type RenderContext, type TextInfoUnkeyed } from "../deps.ts";
import type { MergedSankeyStyle, PositionedNode } from "../types.ts";

export function buildNodePrimitives(
  rc: RenderContext,
  nodes: PositionedNode[],
  style: MergedSankeyStyle,
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

    let labelData: { mText: any; position: Coordinates; alignment: "left" | "right" } | undefined;

    if (node.label) {
      const mText = rc.mText(node.label, textInfo, 200);
      const isLastColumn = node.column === maxColumn;
      const labelOnRight = !isLastColumn;
      const labelX = labelOnRight
        ? node.x + node.width + style.labelGap
        : node.x - style.labelGap;
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
