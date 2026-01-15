// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding, PANTHER_DEBUG, RectCoordsDims, sum } from "./deps.ts";
import { getColWidths } from "./col_widths.ts";
import type {
  ContainerStyleOptions,
  HeightMode,
  IdealHeightResult,
  ItemHeightMeasurer,
  LayoutNode,
  LayoutWarning,
  MeasuredColsLayoutNode,
  MeasuredItemLayoutNode,
  MeasuredLayoutNode,
  MeasuredRowsLayoutNode,
  MeasureLayoutResult,
} from "./types.ts";

export function measureLayout<T, U>(
  ctx: T,
  layout: LayoutNode<U>,
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  nColumns: number,
): MeasureLayoutResult<U> {
  const warnings: LayoutWarning[] = [];
  if (PANTHER_DEBUG) {
    console.log(`\n=== measureLayout DEBUG ===`);
    console.log(`bounds: ${bounds.w().toFixed(1)} x ${bounds.h().toFixed(1)}`);
    console.log(`gapX: ${gapX}, gapY: ${gapY}, nColumns: ${nColumns}`);
    console.log(`--- getIdealHeight pass ---`);
    getIdealHeight(ctx, layout, bounds.w(), gapX, gapY, itemMeasurer, nColumns);
    console.log(`--- end getIdealHeight ---\n`);
  }
  const measured = measureNode(
    ctx,
    layout,
    bounds,
    gapX,
    gapY,
    itemMeasurer,
    warnings,
    bounds.h(),
    nColumns,
  );
  return { measured, warnings };
}

// =============================================================================
// Single recursive function for ideal height calculation
// =============================================================================

function getIdealHeight<T, U>(
  ctx: T,
  node: LayoutNode<U>,
  width: number,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  nColumns: number,
): IdealHeightResult {
  const pad = new Padding(node.style?.padding ?? 0);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2; // left + right, or top + bottom
  const innerW = width - pad.totalPx() - borderTotal;
  const paddingAndBorder = pad.totalPy() + borderTotal;

  let measuredHeight: number;
  let minHeight: number;

  if (node.type === "item") {
    const result = itemMeasurer(ctx, node, innerW);
    measuredHeight = result.idealH + paddingAndBorder;
    // If noShrink, the entire height is the minimum; otherwise 0 (fully shrinkable)
    minHeight = result.noShrink ? measuredHeight : 0;
    if (PANTHER_DEBUG) {
      console.log(
        `  ITEM: idealH=${result.idealH.toFixed(1)}, measuredH=${
          measuredHeight.toFixed(1)
        }, minH=${minHeight.toFixed(1)}, nodeHeight=${node.height}`,
      );
    }
  } else if (node.type === "row") {
    const childResults = node.children.map((child) =>
      getIdealHeight(ctx, child, innerW, gapX, gapY, itemMeasurer, nColumns)
    );
    const childHeights = childResults.map((r) => r.height);
    const childMinHeights = childResults.map((r) => r.minHeight);
    const totalGaps = (node.children.length - 1) * gapY;
    measuredHeight = sum(childHeights) + totalGaps + paddingAndBorder;
    // For rows (stacked): sum of child minHeights
    minHeight = sum(childMinHeights) + totalGaps + paddingAndBorder;
    if (PANTHER_DEBUG) {
      console.log(
        `  ROW: heights=[${
          childHeights.map((h) => h.toFixed(1)).join(", ")
        }], minHeights=[${
          childMinHeights.map((h) => h.toFixed(1)).join(", ")
        }], measuredH=${measuredHeight.toFixed(1)}, minH=${
          minHeight.toFixed(1)
        }`,
      );
    }
  } else {
    // col
    const colWidthResult = getColWidths(node.children, innerW, nColumns, gapX);
    const childResults = node.children.map((child, i) =>
      getIdealHeight(
        ctx,
        child,
        colWidthResult.widths[i].w,
        gapX,
        gapY,
        itemMeasurer,
        nColumns,
      )
    );
    const childHeights = childResults.map((r) => r.height);
    const childMinHeights = childResults.map((r) => r.minHeight);
    measuredHeight = Math.max(...childHeights, 0) + paddingAndBorder;
    // For cols (side by side): max of child minHeights
    minHeight = Math.max(...childMinHeights, 0) + paddingAndBorder;
    if (PANTHER_DEBUG) {
      console.log(
        `  COL: heights=[${
          childHeights.map((h) => h.toFixed(1)).join(", ")
        }], minHeights=[${
          childMinHeights.map((h) => h.toFixed(1)).join(", ")
        }], measuredH=${measuredHeight.toFixed(1)}, minH=${
          minHeight.toFixed(1)
        }`,
      );
    }
  }

  // node.height is minimum height - use the larger of measured or specified
  const finalHeight = node.height !== undefined
    ? Math.max(measuredHeight, node.height)
    : measuredHeight;

  // Also respect explicit node.height as a floor for minHeight
  const finalMinHeight = node.height !== undefined
    ? Math.max(minHeight, node.height)
    : minHeight;

  return { height: finalHeight, minHeight: finalMinHeight };
}

// =============================================================================
// Layout pass - allocates actual space based on ideal heights and heightMode
// =============================================================================

function measureNode<T, U>(
  ctx: T,
  node: LayoutNode<U>,
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  warnings: LayoutWarning[],
  containerHeight: number,
  nColumns: number,
  path?: string,
): MeasuredLayoutNode<U> {
  if (node.type === "row") {
    return measureRowNode(
      ctx,
      node,
      bounds,
      gapX,
      gapY,
      itemMeasurer,
      warnings,
      containerHeight,
      nColumns,
      path,
    );
  }
  if (node.type === "col") {
    return measureColNode(
      ctx,
      node,
      bounds,
      gapX,
      gapY,
      itemMeasurer,
      warnings,
      containerHeight,
      nColumns,
      path,
    );
  }
  return measureItemNode(ctx, node, bounds, itemMeasurer, containerHeight);
}

function measureRowNode<T, U>(
  ctx: T,
  node: LayoutNode<U> & { type: "row" },
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  warnings: LayoutWarning[],
  _containerHeight: number,
  nColumns: number,
  path?: string,
): MeasuredRowsLayoutNode<U> {
  const nodePath = path ? `${path}.row(${node.id})` : `row(${node.id})`;
  const innerBounds = getInnerBounds(bounds, node.style);
  const pad = new Padding(node.style?.padding ?? 0);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;

  // Get ideal heights for all children using unified function
  const childResults = node.children.map((child) =>
    getIdealHeight(
      ctx,
      child,
      innerBounds.w(),
      gapX,
      gapY,
      itemMeasurer,
      nColumns,
    )
  );

  const childIdealHeights = childResults.map((r) => r.height);
  const totalIdealHeight = sum(childIdealHeights);
  const totalGapHeight = (node.children.length - 1) * gapY;
  const totalRequiredHeight = totalIdealHeight + totalGapHeight;
  const availableHeight = innerBounds.h();

  // Calculate scale factor using minHeight (the non-shrinkable portion of each child)
  const childMinHeights = childResults.map((r) => r.minHeight);
  const totalMinHeight = sum(childMinHeights);
  const shrinkableHeight = totalIdealHeight - totalMinHeight; // Amount that CAN shrink

  let scaleFactor = 1;
  let shrinkScaleFactor = 1;

  if (totalRequiredHeight > availableHeight) {
    if (shrinkableHeight > 0) {
      // Available space after reserving for non-shrinkable portions
      const availableForShrink = availableHeight - totalMinHeight -
        totalGapHeight;
      shrinkScaleFactor = Math.max(0, availableForShrink / shrinkableHeight);
    }

    // Only warn if overflow can't be fully absorbed by shrinkable items
    if (totalMinHeight + totalGapHeight > availableHeight) {
      scaleFactor = availableHeight / totalRequiredHeight;
      warnings.push({
        type: "HEIGHT_OVERFLOW",
        message:
          `Row heights (${totalRequiredHeight}px) exceed container (${availableHeight}px), scaling shrinkable portion to ${
            (shrinkScaleFactor * 100).toFixed(1)
          }%`,
        path: nodePath,
      });
    }
  }

  // For fill-to-row-height: find tallest non-stretch child
  const maxNonStretchHeight = Math.max(
    ...node.children
      .map((child, i) =>
        getHeightMode(child) === "fill-to-row-height" ? 0 : childIdealHeights[i]
      ),
    0,
  );

  const measuredChildren: MeasuredLayoutNode<U>[] = [];
  let currentY = innerBounds.y();

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childResult = childResults[i];
    const childIdealH = childResult.height;
    const childMinH = childResult.minHeight;
    const childShrinkable = childIdealH - childMinH;
    const heightMode = getHeightMode(child);

    let childH: number;
    if (heightMode === "fill-to-container") {
      childH = shrinkScaleFactor < 1
        ? availableHeight * shrinkScaleFactor
        : availableHeight;
    } else if (heightMode === "fill-to-row-height") {
      // Match the tallest non-stretch sibling
      const targetH = Math.max(childIdealH, maxNonStretchHeight);
      const targetShrinkable = targetH - childMinH;
      childH = childMinH + targetShrinkable * shrinkScaleFactor;
    } else {
      // Default: use-measured-height
      // Keep minHeight, scale only the shrinkable portion
      childH = childMinH + childShrinkable * shrinkScaleFactor;
    }

    const childBounds = new RectCoordsDims({
      x: innerBounds.x(),
      y: currentY,
      w: innerBounds.w(),
      h: childH,
    });

    const measuredChild = measureNode(
      ctx,
      child,
      childBounds,
      gapX,
      gapY,
      itemMeasurer,
      warnings,
      childH,
      nColumns,
      nodePath,
    );

    measuredChildren.push(measuredChild);
    // Gaps are scaled based on overall scale factor
    currentY += childH + gapY * scaleFactor;
  }

  const actualTotalHeight = currentY - innerBounds.y() - gapY * scaleFactor;
  const finalHeight = node.height ??
    (actualTotalHeight + pad.totalPy() + borderTotal);
  const rpd = bounds.getAdjusted({ h: Math.min(finalHeight, bounds.h()) });

  return {
    ...node,
    rpd,
    children: measuredChildren,
  };
}

function measureColNode<T, U>(
  ctx: T,
  node: LayoutNode<U> & { type: "col" },
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  warnings: LayoutWarning[],
  _containerHeight: number,
  nColumns: number,
  path?: string,
): MeasuredColsLayoutNode<U> {
  const nodePath = path ? `${path}.col(${node.id})` : `col(${node.id})`;
  const innerBounds = getInnerBounds(bounds, node.style);
  const pad = new Padding(node.style?.padding ?? 0);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;

  const colWidthResult = getColWidths(
    node.children,
    innerBounds.w(),
    nColumns,
    gapX,
    nodePath,
  );
  warnings.push(...colWidthResult.warnings);

  // Get ideal heights for all children using unified function
  const childResults = node.children.map((child, i) =>
    getIdealHeight(
      ctx,
      child,
      colWidthResult.widths[i].w,
      gapX,
      gapY,
      itemMeasurer,
      nColumns,
    )
  );

  const childIdealHeights = childResults.map((r) => r.height);
  const maxChildIdealH = Math.max(...childIdealHeights, 0);
  const rowHeight = Math.min(maxChildIdealH, innerBounds.h());

  const measuredChildren: (MeasuredLayoutNode<U> & { span?: number })[] = [];
  let currentX = innerBounds.x();

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childWidth = colWidthResult.widths[i].w;
    const childResult = childResults[i];
    const childIdealH = childResult.height;
    const heightMode = getHeightMode(child);

    let childH: number;
    if (heightMode === "fill-to-container") {
      childH = innerBounds.h();
    } else if (heightMode === "fill-to-row-height") {
      childH = rowHeight;
    } else {
      childH = Math.min(childIdealH, innerBounds.h());
    }

    const childBounds = new RectCoordsDims({
      x: currentX,
      y: innerBounds.y(),
      w: childWidth,
      h: childH,
    });

    const measuredChild = measureNode(
      ctx,
      child,
      childBounds,
      gapX,
      gapY,
      itemMeasurer,
      warnings,
      childH,
      nColumns,
      nodePath,
    );

    const span = (child as { span?: number }).span;
    measuredChildren.push(
      span !== undefined ? { ...measuredChild, span } : measuredChild,
    );
    currentX += childWidth + gapX;
  }

  const finalHeight = node.height ?? (rowHeight + pad.totalPy() + borderTotal);
  const rpd = bounds.getAdjusted({ h: Math.min(finalHeight, bounds.h()) });

  return {
    ...node,
    rpd,
    children: measuredChildren,
  };
}

function measureItemNode<T, U>(
  ctx: T,
  node: LayoutNode<U> & { type: "item" },
  bounds: RectCoordsDims,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  containerHeight: number,
): MeasuredItemLayoutNode<U> {
  const innerBounds = getInnerBounds(bounds, node.style);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;
  const pad = new Padding(node.style?.padding ?? 0);

  const { idealH } = itemMeasurer(ctx, node, innerBounds.w());
  const heightMode = getHeightMode(node);

  let finalH: number;
  if (node.height !== undefined) {
    finalH = node.height;
  } else if (heightMode === "fill-to-container") {
    finalH = containerHeight;
  } else if (heightMode === "fill-to-row-height") {
    finalH = bounds.h();
  } else {
    finalH = idealH + pad.totalPy() + borderTotal;
  }

  const rpd = bounds.getAdjusted({ h: Math.min(finalH, bounds.h()) });

  return {
    ...node,
    rpd,
  };
}

function getHeightMode(node: LayoutNode<unknown>): HeightMode {
  return node.heightMode ?? "use-measured-height";
}

/**
 * Calculates inner bounds by applying border and padding insets.
 * Box model: bounds -> border -> padding -> inner content area
 */
function getInnerBounds(
  bounds: RectCoordsDims,
  style?: ContainerStyleOptions,
): RectCoordsDims {
  const borderWidth = style?.borderWidth ?? 0;
  const borderPad = new Padding(borderWidth);
  const pad = new Padding(style?.padding ?? 0);
  const boundsAfterBorder = bounds.getPadded(borderPad);
  return boundsAfterBorder.getPadded(pad);
}
