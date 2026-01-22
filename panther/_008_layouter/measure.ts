// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding, PANTHER_DEBUG, RectCoordsDims, sum } from "./deps.ts";
import { getColWidths } from "./col_widths.ts";
import type {
  ContainerStyleOptions,
  HeightConstraints,
  ItemHeightMeasurer,
  LayoutGap,
  LayoutNode,
  MeasuredColsLayoutNode,
  MeasuredItemLayoutNode,
  MeasuredLayoutNode,
  MeasuredRowsLayoutNode,
  MeasureLayoutResult,
} from "./types.ts";

export type MeasureLayoutOptions = {
  gapOverlap?: number;
};

export function measureLayout<T, U>(
  ctx: T,
  layout: LayoutNode<U>,
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  nColumns: number,
  options?: MeasureLayoutOptions,
): MeasureLayoutResult<U> {
  const overflowTracker = { overflow: false };
  if (PANTHER_DEBUG) {
    console.log(`\n=== measureLayout DEBUG ===`);
    console.log(`bounds: ${bounds.w().toFixed(1)} x ${bounds.h().toFixed(1)}`);
    console.log(`gapX: ${gapX}, gapY: ${gapY}, nColumns: ${nColumns}`);
    console.log(`--- getHeightConstraints pass ---`);
    getHeightConstraints(
      ctx,
      layout,
      bounds.w(),
      gapX,
      gapY,
      itemMeasurer,
      nColumns,
    );
    console.log(`--- end getHeightConstraints ---\n`);
  }
  const measured = measureNode(
    ctx,
    layout,
    bounds,
    gapX,
    gapY,
    itemMeasurer,
    overflowTracker,
    nColumns,
  );
  const gaps = extractGaps(measured, gapX, gapY, options?.gapOverlap ?? 10);
  return { measured, overflow: overflowTracker.overflow, gaps };
}

// =============================================================================
// Recursive function to calculate height constraints (minH, maxH) for each node
// =============================================================================

function getHeightConstraints<T, U>(
  ctx: T,
  node: LayoutNode<U>,
  width: number,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  nColumns: number,
): HeightConstraints {
  const pad = new Padding(node.style?.padding ?? 0);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;
  const innerW = width - pad.totalPx() - borderTotal;
  const paddingAndBorder = pad.totalPy() + borderTotal;

  let minH: number;
  let idealH: number;
  let maxH: number;

  if (node.type === "item") {
    const result = itemMeasurer(ctx, node, innerW);
    // Add padding to convert content heights to total heights
    minH = result.minH + paddingAndBorder;
    idealH = result.idealH + paddingAndBorder;
    maxH = result.maxH + paddingAndBorder;
    if (PANTHER_DEBUG) {
      console.log(
        `  ITEM: minH=${minH.toFixed(1)}, idealH=${idealH.toFixed(1)}, maxH=${
          maxH.toFixed(1)
        }`,
      );
    }
  } else if (node.type === "rows") {
    const childResults = node.children.map((child) =>
      getHeightConstraints(
        ctx,
        child,
        innerW,
        gapX,
        gapY,
        itemMeasurer,
        nColumns,
      )
    );
    const totalGaps = (node.children.length - 1) * gapY;
    // Rows: sum of children's constraints
    minH = sum(childResults.map((r) => r.minH)) + totalGaps + paddingAndBorder;
    idealH = sum(childResults.map((r) => r.idealH)) + totalGaps +
      paddingAndBorder;
    maxH = sum(childResults.map((r) => r.maxH)) + totalGaps + paddingAndBorder;
    if (PANTHER_DEBUG) {
      console.log(
        `  ROWS: minH=${minH.toFixed(1)}, idealH=${idealH.toFixed(1)}, maxH=${
          maxH.toFixed(1)
        }`,
      );
    }
  } else {
    // cols
    const colWidths = getColWidths(node.children, innerW, nColumns, gapX);
    const childResults = node.children.map((child, i) =>
      getHeightConstraints(
        ctx,
        child,
        colWidths[i].w,
        gapX,
        gapY,
        itemMeasurer,
        nColumns,
      )
    );
    // Cols: both use max - need space for tallest, can grow to tallest
    minH = Math.max(...childResults.map((r) => r.minH), 0) + paddingAndBorder;
    idealH = Math.max(...childResults.map((r) => r.idealH), 0) +
      paddingAndBorder;
    maxH = Math.max(...childResults.map((r) => r.maxH), 0) + paddingAndBorder;
    if (PANTHER_DEBUG) {
      console.log(
        `  COLS: minH=${minH.toFixed(1)}, idealH=${idealH.toFixed(1)}, maxH=${
          maxH.toFixed(1)
        }`,
      );
    }
  }

  // Apply node-level overrides
  if (node.minH !== undefined) {
    minH = node.minH;
  }
  if (node.maxH !== undefined) {
    maxH = node.maxH;
  }
  // Ensure maxH >= minH after overrides
  maxH = Math.max(minH, maxH);
  // Ensure idealH is within bounds
  idealH = Math.max(minH, Math.min(idealH, maxH));

  return { minH, idealH, maxH };
}

// =============================================================================
// Layout pass - allocates actual space based on constraints
// =============================================================================

function measureNode<T, U>(
  ctx: T,
  node: LayoutNode<U>,
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  overflowTracker: { overflow: boolean },
  nColumns: number,
): MeasuredLayoutNode<U> {
  if (node.type === "rows") {
    return measureRowNode(
      ctx,
      node,
      bounds,
      gapX,
      gapY,
      itemMeasurer,
      overflowTracker,
      nColumns,
    );
  }
  if (node.type === "cols") {
    return measureColNode(
      ctx,
      node,
      bounds,
      gapX,
      gapY,
      itemMeasurer,
      overflowTracker,
      nColumns,
    );
  }
  return measureItemNode(ctx, node, bounds, itemMeasurer);
}

function measureRowNode<T, U>(
  ctx: T,
  node: LayoutNode<U> & { type: "rows" },
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  overflowTracker: { overflow: boolean },
  nColumns: number,
): MeasuredRowsLayoutNode<U> {
  const innerBounds = getInnerBounds(bounds, node.style);
  const pad = new Padding(node.style?.padding ?? 0);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;

  // Get constraints for all children
  const childConstraints = node.children.map((child) =>
    getHeightConstraints(
      ctx,
      child,
      innerBounds.w(),
      gapX,
      gapY,
      itemMeasurer,
      nColumns,
    )
  );

  const totalGapHeight = (node.children.length - 1) * gapY;
  const totalMinH = sum(childConstraints.map((c) => c.minH));
  const availableHeight = innerBounds.h();

  // Check for overflow
  if (totalMinH + totalGapHeight > availableHeight) {
    overflowTracker.overflow = true;
  }

  // Calculate how much space we can use
  const usableHeight = availableHeight - totalGapHeight;

  // Start with minH for everyone
  const childHeights = childConstraints.map((c) => c.minH);
  let totalUsed = totalMinH;

  // Distribute extra space among children that can grow
  let extraSpace = usableHeight - totalUsed;
  while (extraSpace > 0.001) {
    // Find children that can still grow
    const growableIndices: number[] = [];
    for (let i = 0; i < node.children.length; i++) {
      if (childHeights[i] < childConstraints[i].maxH) {
        growableIndices.push(i);
      }
    }

    if (growableIndices.length === 0) break;

    // Distribute equally among growable children
    const sharePerChild = extraSpace / growableIndices.length;
    let distributed = 0;

    for (const i of growableIndices) {
      const canGrow = childConstraints[i].maxH - childHeights[i];
      const growth = Math.min(sharePerChild, canGrow);
      childHeights[i] += growth;
      distributed += growth;
    }

    extraSpace -= distributed;
    totalUsed += distributed;

    // Safety: if nothing was distributed, break to avoid infinite loop
    if (distributed < 0.001) break;
  }

  // Measure children with allocated heights
  const measuredChildren: MeasuredLayoutNode<U>[] = [];
  let currentY = innerBounds.y();

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childH = childHeights[i];

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
      overflowTracker,
      nColumns,
    );

    measuredChildren.push(measuredChild);
    currentY += childH + gapY;
  }

  const actualTotalHeight = currentY - innerBounds.y() - gapY;
  const finalHeight = actualTotalHeight + pad.totalPy() + borderTotal;
  const rpd = bounds.getAdjusted({ h: Math.min(finalHeight, bounds.h()) });

  return {
    ...node,
    rpd,
    children: measuredChildren,
  };
}

function measureColNode<T, U>(
  ctx: T,
  node: LayoutNode<U> & { type: "cols" },
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  overflowTracker: { overflow: boolean },
  nColumns: number,
): MeasuredColsLayoutNode<U> {
  const innerBounds = getInnerBounds(bounds, node.style);
  const pad = new Padding(node.style?.padding ?? 0);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;

  const colWidths = getColWidths(
    node.children,
    innerBounds.w(),
    nColumns,
    gapX,
  );

  // Get constraints for all children
  const childConstraints = node.children.map((child, i) =>
    getHeightConstraints(
      ctx,
      child,
      colWidths[i].w,
      gapX,
      gapY,
      itemMeasurer,
      nColumns,
    )
  );

  // Cols row height: up to largest maxH, but at least largest minH
  const maxOfMinH = Math.max(...childConstraints.map((c) => c.minH), 0);
  const maxOfMaxH = Math.max(...childConstraints.map((c) => c.maxH), 0);

  // Row height is the smaller of container and max of maxH, but at least max of minH
  let rowHeight = Math.min(innerBounds.h(), maxOfMaxH);
  rowHeight = Math.max(rowHeight, maxOfMinH);

  // Check for overflow (can't fit minimum heights)
  if (maxOfMinH > innerBounds.h()) {
    overflowTracker.overflow = true;
  }

  // Measure children - each gets row height, capped by their maxH
  const measuredChildren: MeasuredLayoutNode<U>[] = [];
  let currentX = innerBounds.x();

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childWidth = colWidths[i].w;
    const childConstraint = childConstraints[i];

    // Child height is row height, but capped by their maxH
    const childH = Math.min(rowHeight, childConstraint.maxH);

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
      overflowTracker,
      nColumns,
    );

    measuredChildren.push(measuredChild);
    currentX += childWidth + gapX;
  }

  const finalHeight = rowHeight + pad.totalPy() + borderTotal;
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
): MeasuredItemLayoutNode<U> {
  const innerBounds = getInnerBounds(bounds, node.style);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;
  const pad = new Padding(node.style?.padding ?? 0);

  const constraints = itemMeasurer(ctx, node, innerBounds.w());

  // Convert content heights to total heights by adding padding
  let minH = constraints.minH + pad.totalPy() + borderTotal;
  let idealH = constraints.idealH + pad.totalPy() + borderTotal;
  let maxH = constraints.maxH + pad.totalPy() + borderTotal;

  // Apply node-level overrides (overrides are total heights)
  if (node.minH !== undefined) {
    minH = node.minH;
  }
  if (node.maxH !== undefined) {
    maxH = node.maxH;
  }
  maxH = Math.max(minH, maxH);
  idealH = Math.max(minH, Math.min(idealH, maxH));

  // Fill to bounds, capped by maxH, never below minH
  const availableH = bounds.h();
  let finalH = Math.min(availableH, maxH);
  finalH = Math.max(finalH, minH);

  const rpd = bounds.getAdjusted({ h: Math.min(finalH, bounds.h()) });

  return {
    ...node,
    rpd,
    idealH,
    maxH,
    neededScalingToFitWidth: constraints.neededScalingToFitWidth,
  };
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

// =============================================================================
// Gap extraction for hit detection
// =============================================================================

function extractGaps<U>(
  node: MeasuredLayoutNode<U>,
  gapX: number,
  gapY: number,
  overlap: number,
): LayoutGap[] {
  const gaps: LayoutGap[] = [];
  extractGapsRecursive(node, gapX, gapY, overlap, gaps, 0, 0);
  return gaps;
}

function extractGapsRecursive<U>(
  node: MeasuredLayoutNode<U>,
  gapX: number,
  gapY: number,
  overlap: number,
  gaps: LayoutGap[],
  rowIndex: number,
  _colIndex: number,
): void {
  if (node.type === "rows") {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      // Recurse into child
      extractGapsRecursive(child, gapX, gapY, overlap, gaps, i, 0);

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
      extractGapsRecursive(child, gapX, gapY, overlap, gaps, rowIndex, i);

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
        const dividerX = child.rpd.x() + child.rpd.w() + gapX / 2;
        gaps.push({
          type: "col-divider",
          rowIndex,
          afterColIndex: i,
          line: {
            x: dividerX,
            y1: child.rpd.y(),
            y2: child.rpd.y() + child.rpd.h(),
          },
        });
      }
    }
  }
  // Items don't have gaps
}
