// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { sum } from "./deps.ts";
import type { LayoutNode } from "./types.ts";

export type ColWidthInfo = {
  w: number;
  span: number;
};

export function getColWidths<U>(
  children: LayoutNode<U>[],
  width: number,
  columnCount: number,
  gapX: number,
): ColWidthInfo[] {
  if (children.length === 0) {
    return [];
  }

  if (children.length === 1 && children[0].span === undefined) {
    return [{ w: width, span: columnCount }];
  }

  const singleColWidth = (width - (columnCount - 1) * gapX) / columnCount;

  // Normalize spans: clamp to valid range
  const spans = children.map((child) => {
    if (child.span === undefined) return undefined;
    if (isNaN(child.span) || child.span < 1) return 1;
    if (child.span > columnCount) return columnCount;
    return child.span;
  });

  const specifiedSpans = spans.filter((s): s is number => s !== undefined);
  const unspecifiedCount = spans.filter((s) => s === undefined).length;
  const totalSpecifiedSpan = sum(specifiedSpans);

  // All children have explicit spans
  if (unspecifiedCount === 0) {
    if (totalSpecifiedSpan !== columnCount) {
      // Proportionally scale spans to fit
      const scaleFactor = columnCount / totalSpecifiedSpan;
      const scaledSpans = spans.map((s) => Math.round((s || 1) * scaleFactor));

      // Fix rounding errors by adjusting last span
      const scaledTotal = sum(scaledSpans);
      if (scaledTotal !== columnCount) {
        scaledSpans[scaledSpans.length - 1] += columnCount - scaledTotal;
      }

      return scaledSpans.map((span) =>
        getBlockWidth(span, singleColWidth, gapX)
      );
    }
    return spans.map((s) => getBlockWidth(s!, singleColWidth, gapX));
  }

  // Some children have unspecified spans - distribute remaining space
  const remainingSpan = columnCount - totalSpecifiedSpan;
  const baseSpanPerUnspecified = Math.floor(remainingSpan / unspecifiedCount);

  // Not enough space - share proportionally
  if (remainingSpan <= 0 || baseSpanPerUnspecified === 0) {
    const totalEffectiveSpans = totalSpecifiedSpan + unspecifiedCount;
    const scaleFactor = columnCount / totalEffectiveSpans;

    const widths = spans.map((span) => {
      const effectiveSpan = span ?? 1;
      const scaledSpan = Math.max(0.1, effectiveSpan * scaleFactor);
      const w = singleColWidth * scaledSpan + gapX * (scaledSpan - 1);
      return { w: Math.max(1, w), span: scaledSpan };
    });

    // Fix total width rounding
    const totalWidth = sum(widths.map((w) => w.w)) +
      (children.length - 1) * gapX;
    if (Math.abs(totalWidth - width) > 0.01) {
      const adjustment = (width - totalWidth) / children.length;
      return widths.map((w) => ({ ...w, w: w.w + adjustment }));
    }
    return widths;
  }

  // Distribute remaining span among unspecified children
  const extraColumns = remainingSpan % unspecifiedCount;
  let unspecifiedIndex = 0;

  return spans.map((span) => {
    if (span !== undefined) {
      return getBlockWidth(span, singleColWidth, gapX);
    }
    const extraCol = unspecifiedIndex < extraColumns ? 1 : 0;
    const assignedSpan = baseSpanPerUnspecified + extraCol;
    unspecifiedIndex++;
    return getBlockWidth(assignedSpan, singleColWidth, gapX);
  });
}

function getBlockWidth(
  nCols: number,
  singleColWidth: number,
  gapX: number,
): ColWidthInfo {
  return {
    w: singleColWidth * nCols + gapX * (nCols - 1),
    span: nCols,
  };
}

/**
 * Calculate the width for a given span when redistributing a combined width.
 * Used for snap positions when dragging column dividers.
 *
 * Derives from: width = span * singleColWidth + (span - 1) * gapX
 * where singleColWidth = (combinedWidth - (nColumns - 2) * gapX) / nColumns
 */
export function getWidthForSpan(
  span: number,
  combinedWidth: number,
  gapX: number,
  nColumns: number,
): number {
  return (span * combinedWidth + gapX * (2 * span - nColumns)) / nColumns;
}
