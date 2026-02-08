// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { RectCoordsDims } from "../deps.ts";
import type { LayoutGap, MeasuredLayoutNode } from "../types.ts";

export function extractGaps<U>(
  node: MeasuredLayoutNode<U>,
  gapX: number,
  gapY: number,
  overlap: number,
  dividerPositions: number[],
  globalSnapPositions: number[],
): LayoutGap[] {
  const gaps: LayoutGap[] = [];

  extractGapsRecursive(
    node,
    gapX,
    gapY,
    overlap,
    dividerPositions,
    globalSnapPositions,
    gaps,
    0,
    0,
  );
  return gaps;
}

function extractGapsRecursive<U>(
  node: MeasuredLayoutNode<U>,
  gapX: number,
  gapY: number,
  overlap: number,
  dividerPositions: number[],
  globalSnapPositions: number[],
  gaps: LayoutGap[],
  rowIndex: number,
  _colIndex: number,
): void {
  if (node.type === "rows") {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      // Recurse into child
      extractGapsRecursive(
        child,
        gapX,
        gapY,
        overlap,
        dividerPositions,
        globalSnapPositions,
        gaps,
        i,
        0,
      );

      // Add row gap after each child except the last
      if (i < children.length - 1) {
        const nextChild = children[i + 1];
        const gapTop = child.rpd.y() + child.rpd.h() - overlap;
        const gapBottom = nextChild.rpd.y() + overlap;
        const gapHeight = gapBottom - gapTop;

        gaps.push({
          type: "row-gap",
          afterRowIndex: i,
          rcd: new RectCoordsDims({
            x: child.rpd.x(),
            y: gapTop,
            w: child.rpd.w(),
            h: gapHeight,
          }),
        });
      }
    }
  } else if (node.type === "cols") {
    const children = node.children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      // Recurse into child
      extractGapsRecursive(
        child,
        gapX,
        gapY,
        overlap,
        dividerPositions,
        globalSnapPositions,
        gaps,
        rowIndex,
        i,
      );

      // Add column gap and divider after each child except the last
      if (i < children.length - 1) {
        const nextChild = children[i + 1];

        const gapLeft = child.rpd.x() + child.rpd.w() - overlap;
        const gapRight = nextChild.rpd.x() + overlap;
        const gapWidth = gapRight - gapLeft;

        // Column gap (hit zone for adding columns)
        gaps.push({
          type: "col-gap",
          rowIndex,
          afterColIndex: i,
          rcd: new RectCoordsDims({
            x: gapLeft,
            y: child.rpd.y(),
            w: gapWidth,
            h: child.rpd.h(),
          }),
        });

        // Column divider (for drag-to-resize)
        // dividerPositions[i] is the divider between column i and column i+1
        // child.absoluteEndColumn is exclusive, so divider is at index (absoluteEndColumn - 1)
        const dividerX = dividerPositions[child.absoluteEndColumn - 1];
        gaps.push({
          type: "col-divider",
          colsNodeId: node.id,
          rowIndex,
          afterColIndex: i,
          line: {
            x: dividerX,
            y1: node.rpd.y(),
            y2: node.rpd.y() + node.rpd.h(),
          },
          snapPositions: globalSnapPositions,
          leftStartColumn: child.absoluteStartColumn,
          leftSpan: child.span,
          rightSpan: nextChild.span,
        });
      }
    }
  }
  // Items don't have gaps
}
