// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { sum } from "./deps.ts";
import type { LayoutNode, LayoutWarning } from "./types.ts";

export type ColWidthInfo = {
  w: number;
  span: number;
  adjusted?: boolean;
};

export type ColWidthResult = {
  widths: ColWidthInfo[];
  warnings: LayoutWarning[];
};

export function getColWidths<U>(
  children: (LayoutNode<U> & { span?: number })[],
  width: number,
  columnCount: number,
  gapX: number,
  pathPrefix?: string,
): ColWidthResult {
  const warnings: LayoutWarning[] = [];

  if (children.length === 0) {
    return { widths: [], warnings };
  }

  if (children.length === 1 && children[0].span === undefined) {
    return {
      widths: [{ w: width, span: columnCount, adjusted: false }],
      warnings: [],
    };
  }

  const singleColWidth = (width - (columnCount - 1) * gapX) / columnCount;

  const adjustedChildren = children.map((child, index) => {
    let span = child.span;
    let adjusted = false;

    if (span !== undefined) {
      if (isNaN(span) || span < 1) {
        const path = pathPrefix
          ? `${pathPrefix}.children[${index}]`
          : `children[${index}]`;
        warnings.push({
          type: "INVALID_SPAN",
          message: `Column has invalid span ${span}, using 1`,
          path,
        });
        span = 1;
        adjusted = true;
      } else if (span > columnCount) {
        const path = pathPrefix
          ? `${pathPrefix}.children[${index}]`
          : `children[${index}]`;
        warnings.push({
          type: "SPAN_OVERFLOW",
          message:
            `Column span ${span} exceeds grid columns ${columnCount}, capping at ${columnCount}`,
          path,
        });
        span = columnCount;
        adjusted = true;
      }
    }

    return { span, adjusted };
  });

  const specifiedChildren = adjustedChildren.filter((c) =>
    c.span !== undefined
  );
  const unspecifiedChildren = adjustedChildren.filter((c) =>
    c.span === undefined
  );
  const totalSpecifiedSpan = sum(specifiedChildren.map((c) => c.span!));

  let finalWidths: ColWidthInfo[];

  if (unspecifiedChildren.length === 0) {
    if (totalSpecifiedSpan !== columnCount) {
      warnings.push({
        type: "SPAN_MISMATCH",
        message:
          `Total span ${totalSpecifiedSpan} doesn't match grid columns ${columnCount}, proportionally adjusting`,
        path: pathPrefix,
      });

      const scaleFactor = columnCount / totalSpecifiedSpan;
      finalWidths = adjustedChildren.map((child) => {
        const adjustedSpan = Math.round((child.span || 1) * scaleFactor);
        return getBlockWidth(adjustedSpan || 1, singleColWidth, gapX, true);
      });

      const totalWidth = sum(finalWidths.map((w) => w.w)) +
        (children.length - 1) * gapX;
      if (Math.abs(totalWidth - width) > 0.01) {
        finalWidths[finalWidths.length - 1].w += width - totalWidth;
      }
    } else {
      finalWidths = adjustedChildren.map((child) =>
        getBlockWidth(child.span!, singleColWidth, gapX, child.adjusted)
      );
    }
  } else {
    const remainingSpan = columnCount - totalSpecifiedSpan;

    if (remainingSpan <= 0) {
      warnings.push({
        type: "NO_SPACE_FOR_FLEX",
        message:
          `Total specified spans (${totalSpecifiedSpan}) meet or exceed grid columns (${columnCount}), sharing space proportionally`,
        path: pathPrefix,
      });

      const totalEffectiveSpans = totalSpecifiedSpan +
        unspecifiedChildren.length;
      const scaleFactor = columnCount / totalEffectiveSpans;

      finalWidths = adjustedChildren.map((child) => {
        const effectiveSpan = child.span !== undefined ? child.span : 1;
        const scaledSpan = effectiveSpan * scaleFactor;
        const finalSpan = Math.max(0.1, scaledSpan);

        const w = singleColWidth * finalSpan + gapX * (finalSpan - 1);
        return {
          w: Math.max(1, w),
          span: finalSpan,
          adjusted: true,
        };
      });

      const totalWidth = sum(finalWidths.map((w) => w.w)) +
        (children.length - 1) * gapX;
      if (Math.abs(totalWidth - width) > 0.01) {
        const widthDiff = width - totalWidth;
        const widthAdjustmentPerCol = widthDiff / children.length;
        finalWidths = finalWidths.map((colWidth) => ({
          ...colWidth,
          w: colWidth.w + widthAdjustmentPerCol,
        }));
      }
    } else {
      const baseSpanPerUnspecified = Math.floor(
        remainingSpan / unspecifiedChildren.length,
      );
      const extraColumns = remainingSpan % unspecifiedChildren.length;

      let unspecifiedIndex = 0;
      finalWidths = adjustedChildren.map((child) => {
        if (child.span !== undefined) {
          return getBlockWidth(
            child.span,
            singleColWidth,
            gapX,
            child.adjusted,
          );
        } else {
          const extraCol = unspecifiedIndex < extraColumns ? 1 : 0;
          const span = baseSpanPerUnspecified + extraCol;
          unspecifiedIndex++;
          return getBlockWidth(span, singleColWidth, gapX, false);
        }
      });
    }
  }

  return { widths: finalWidths, warnings };
}

function getBlockWidth(
  nCols: number,
  singleColWidth: number,
  gapX: number,
  adjusted?: boolean,
): ColWidthInfo {
  return {
    w: singleColWidth * nCols + gapX * (nCols - 1),
    span: nCols,
    adjusted,
  };
}
