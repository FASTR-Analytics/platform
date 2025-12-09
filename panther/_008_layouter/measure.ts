// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding, RectCoordsDims, sum } from "./deps.ts";
import { getColWidths } from "./col_widths.ts";
import type {
  ContainerStyleOptions,
  HeightMode,
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
): number {
  const pad = new Padding(node.style?.padding ?? 0);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2; // left + right, or top + bottom
  const innerW = width - pad.totalPx() - borderTotal;

  let measuredHeight: number;

  if (node.type === "item") {
    const { idealH } = itemMeasurer(ctx, node, innerW);
    measuredHeight = idealH + pad.totalPy() + borderTotal;
  } else if (node.type === "row") {
    const childHeights = node.children.map((child) =>
      getIdealHeight(ctx, child, innerW, gapX, gapY, itemMeasurer, nColumns)
    );
    const totalGaps = (node.children.length - 1) * gapY;
    measuredHeight = sum(childHeights) + totalGaps + pad.totalPy() +
      borderTotal;
  } else {
    // col
    const colWidthResult = getColWidths(
      node.children,
      innerW,
      nColumns,
      gapX,
    );
    const childHeights = node.children.map((child, i) =>
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
    measuredHeight = Math.max(...childHeights, 0) + pad.totalPy() + borderTotal;
  }

  // node.height is minimum height - use the larger of measured or specified
  return node.height !== undefined
    ? Math.max(measuredHeight, node.height)
    : measuredHeight;
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
  const childIdealHeights = node.children.map((child) =>
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

  const totalIdealHeight = sum(childIdealHeights);
  const totalGapHeight = (node.children.length - 1) * gapY;
  const totalRequiredHeight = totalIdealHeight + totalGapHeight;
  const availableHeight = innerBounds.h();

  let scaleFactor = 1;

  if (totalRequiredHeight > availableHeight) {
    scaleFactor = availableHeight / totalRequiredHeight;
    warnings.push({
      type: "HEIGHT_OVERFLOW",
      message:
        `Row heights (${totalRequiredHeight}px) exceed container (${availableHeight}px), scaling to ${
          (scaleFactor * 100).toFixed(1)
        }%`,
      path: nodePath,
    });
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
    const childIdealH = childIdealHeights[i];
    const heightMode = getHeightMode(child);

    let childH: number;
    if (heightMode === "fill-to-container") {
      childH = scaleFactor < 1
        ? availableHeight * scaleFactor
        : availableHeight;
    } else if (heightMode === "fill-to-row-height") {
      // Match the tallest non-stretch sibling
      childH = Math.max(childIdealH, maxNonStretchHeight) * scaleFactor;
    } else {
      childH = childIdealH * scaleFactor;
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
    currentY += childH + gapY * scaleFactor;
  }

  const finalHeight = node.height ??
    (totalRequiredHeight * scaleFactor + pad.totalPy() + borderTotal);
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
  const childIdealHeights = node.children.map((child, i) =>
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

  const maxChildIdealH = Math.max(...childIdealHeights, 0);
  const rowHeight = Math.min(maxChildIdealH, innerBounds.h());

  const measuredChildren: (MeasuredLayoutNode<U> & { span?: number })[] = [];
  let currentX = innerBounds.x();

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childWidth = colWidthResult.widths[i].w;
    const childIdealH = childIdealHeights[i];
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
