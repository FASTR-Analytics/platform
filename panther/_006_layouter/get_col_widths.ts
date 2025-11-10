// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { sum } from "./deps.ts";
import type { ItemOrContainerForLayout, LayoutWarning } from "./types.ts";

type ColWidthInfo = {
  w: number;
  span: number;
  adjusted?: boolean;
};

export type ColWidthResult = {
  widths: ColWidthInfo[];
  warnings: LayoutWarning[];
};

export function getColWidths<U>(
  cols: (ItemOrContainerForLayout<U> & {
    span?: number;
  })[],
  width: number,
  _NUMBER_OF_COLUMNS: number,
  gapX: number,
  pathPrefix?: string,
): ColWidthResult {
  const warnings: LayoutWarning[] = [];
  if (cols.length === 0) {
    return { widths: [], warnings };
  }

  // Special case: single column with no span should auto-fill without warnings
  if (cols.length === 1 && cols[0].span === undefined) {
    return {
      widths: [{
        w: width,
        span: _NUMBER_OF_COLUMNS,
        adjusted: false,
      }],
      warnings: [],
    };
  }

  const singleColWidth = (width - (_NUMBER_OF_COLUMNS - 1) * gapX) /
    _NUMBER_OF_COLUMNS;

  // Validate and adjust spans
  const adjustedCols = cols.map((col, index) => {
    let span = col.span;
    let adjusted = false;

    if (span !== undefined) {
      if (isNaN(span) || span < 1) {
        const path = pathPrefix
          ? `${pathPrefix}.cols[${index}]`
          : `cols[${index}]`;
        warnings.push({
          type: "INVALID_SPAN",
          message: `Column has invalid span ${span}, using 1`,
          path,
        });
        span = 1;
        adjusted = true;
      } else if (span > _NUMBER_OF_COLUMNS) {
        const path = pathPrefix
          ? `${pathPrefix}.cols[${index}]`
          : `cols[${index}]`;
        warnings.push({
          type: "SPAN_OVERFLOW",
          message:
            `Column span ${span} exceeds grid columns ${_NUMBER_OF_COLUMNS}, capping at ${_NUMBER_OF_COLUMNS}`,
          path,
        });
        span = _NUMBER_OF_COLUMNS;
        adjusted = true;
      }
    }

    return { ...col, span, adjusted };
  });

  // Calculate spans
  const specifiedCols = adjustedCols.filter((c) => c.span !== undefined);
  const unspecifiedCols = adjustedCols.filter((c) => c.span === undefined);
  const totalSpecifiedSpan = sum(specifiedCols.map((c) => c.span!));

  // Handle different scenarios
  let finalWidths: ColWidthInfo[];

  if (unspecifiedCols.length === 0) {
    // All columns have specified spans
    if (totalSpecifiedSpan !== _NUMBER_OF_COLUMNS) {
      warnings.push({
        type: "SPAN_MISMATCH",
        message:
          `Total span ${totalSpecifiedSpan} doesn't match grid columns ${_NUMBER_OF_COLUMNS}, proportionally adjusting`,
        path: pathPrefix,
      });

      // Proportionally adjust all spans
      const scaleFactor = _NUMBER_OF_COLUMNS / totalSpecifiedSpan;
      finalWidths = adjustedCols.map((col) => {
        const adjustedSpan = Math.round((col.span || 1) * scaleFactor);
        return getBlockWidth(adjustedSpan || 1, singleColWidth, gapX, true);
      });

      // Fix rounding errors by adjusting the last column
      const totalWidth = sum(finalWidths.map((w) => w.w)) +
        (cols.length - 1) * gapX;
      if (Math.abs(totalWidth - width) > 0.01) {
        finalWidths[finalWidths.length - 1].w += width - totalWidth;
      }
    } else {
      // Perfect match
      finalWidths = adjustedCols.map((col) =>
        getBlockWidth(col.span!, singleColWidth, gapX, col.adjusted)
      );
    }
  } else {
    // Some columns don't have specified spans
    const remainingSpan = _NUMBER_OF_COLUMNS - totalSpecifiedSpan;

    if (remainingSpan <= 0) {
      // No space left for unspecified columns, need to share total space
      warnings.push({
        type: "NO_SPACE_FOR_FLEX",
        message:
          `Total specified spans (${totalSpecifiedSpan}) meet or exceed grid columns (${_NUMBER_OF_COLUMNS}), sharing space proportionally`,
        path: pathPrefix,
      });

      // Calculate total "effective" spans including flex columns
      // Each flex column counts as 1 span for fair distribution
      const totalEffectiveSpans = totalSpecifiedSpan + unspecifiedCols.length;
      const scaleFactor = _NUMBER_OF_COLUMNS / totalEffectiveSpans;

      finalWidths = adjustedCols.map((col) => {
        const effectiveSpan = col.span !== undefined ? col.span : 1;
        const scaledSpan = effectiveSpan * scaleFactor;
        const finalSpan = Math.max(0.1, scaledSpan); // Ensure minimum width

        // Convert back to actual width
        const w = singleColWidth * finalSpan + gapX * (finalSpan - 1);
        return {
          w: Math.max(1, w), // Ensure at least 1px
          span: finalSpan,
          adjusted: true,
        };
      });

      // Fix rounding errors by adjusting widths proportionally
      const totalWidth = sum(finalWidths.map((w) => w.w)) +
        (cols.length - 1) * gapX;
      if (Math.abs(totalWidth - width) > 0.01) {
        const widthDiff = width - totalWidth;
        const widthAdjustmentPerCol = widthDiff / cols.length;
        finalWidths = finalWidths.map((colWidth) => ({
          ...colWidth,
          w: colWidth.w + widthAdjustmentPerCol,
        }));
      }
    } else {
      // Distribute remaining space among unspecified columns
      const baseSpanPerUnspecified = Math.floor(
        remainingSpan / unspecifiedCols.length,
      );
      const extraColumns = remainingSpan % unspecifiedCols.length;

      let unspecifiedIndex = 0;
      finalWidths = adjustedCols.map((col) => {
        if (col.span !== undefined) {
          return getBlockWidth(col.span, singleColWidth, gapX, col.adjusted);
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
