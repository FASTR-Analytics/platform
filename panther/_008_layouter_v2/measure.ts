// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding, RectCoordsDims, sum } from "./deps.ts";
import { DEFAULT_COLUMN_COUNT, getColWidths } from "./col_widths.ts";
import type {
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
): number {
  if (node.height !== undefined) {
    return node.height;
  }

  const pad = new Padding(node.style?.padding ?? 0);
  const innerW = width - pad.totalPx();

  if (node.type === "item") {
    const { idealH } = itemMeasurer(ctx, node, innerW);
    return idealH + pad.totalPy();
  }

  if (node.type === "row") {
    const childHeights = node.children.map((child) =>
      getIdealHeight(ctx, child, innerW, gapX, gapY, itemMeasurer)
    );
    const totalGaps = (node.children.length - 1) * gapY;
    return sum(childHeights) + totalGaps + pad.totalPy();
  }

  // col
  const colWidthResult = getColWidths(
    node.children,
    innerW,
    DEFAULT_COLUMN_COUNT,
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
    )
  );
  return Math.max(...childHeights, 0) + pad.totalPy();
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
  path?: string,
): MeasuredRowsLayoutNode<U> {
  const nodePath = path ? `${path}.row(${node.id})` : `row(${node.id})`;
  const pad = new Padding(node.style?.padding ?? 0);
  const innerBounds = bounds.getPadded(pad);

  // Get ideal heights for all children using unified function
  const childIdealHeights = node.children.map((child) =>
    getIdealHeight(ctx, child, innerBounds.w(), gapX, gapY, itemMeasurer)
  );

  const totalIdealHeight = sum(childIdealHeights);
  const totalGapHeight = (node.children.length - 1) * gapY;
  const totalRequiredHeight = totalIdealHeight + totalGapHeight;
  const availableHeight = innerBounds.h();

  let scaleFactor = 1;
  let extraHeightPerStretchItem = 0;

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
  } else {
    const stretchChildren = node.children.filter(
      (child) => getHeightMode(child) === "fill-to-row-height",
    );
    if (stretchChildren.length > 0) {
      const remainingHeight = availableHeight - totalRequiredHeight;
      extraHeightPerStretchItem = remainingHeight / stretchChildren.length;
    }
  }

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
      childH = scaleFactor < 1
        ? childIdealH * scaleFactor
        : childIdealH + extraHeightPerStretchItem;
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
      nodePath,
    );

    measuredChildren.push(measuredChild);
    currentY += childH + gapY * scaleFactor;
  }

  const finalHeight = node.height ??
    (totalRequiredHeight * scaleFactor + pad.totalPy());
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
  path?: string,
): MeasuredColsLayoutNode<U> {
  const nodePath = path ? `${path}.col(${node.id})` : `col(${node.id})`;
  const pad = new Padding(node.style?.padding ?? 0);
  const innerBounds = bounds.getPadded(pad);

  const colWidthResult = getColWidths(
    node.children,
    innerBounds.w(),
    DEFAULT_COLUMN_COUNT,
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
      nodePath,
    );

    const span = (child as { span?: number }).span;
    measuredChildren.push(
      span !== undefined ? { ...measuredChild, span } : measuredChild,
    );
    currentX += childWidth + gapX;
  }

  const finalHeight = node.height ?? (rowHeight + pad.totalPy());
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
  const pad = new Padding(node.style?.padding ?? 0);
  const innerBounds = bounds.getPadded(pad);

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
    finalH = idealH + pad.totalPy();
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
