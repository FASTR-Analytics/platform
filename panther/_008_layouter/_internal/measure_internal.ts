// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding, PANTHER_DEBUG, RectCoordsDims, sum } from "../deps.ts";
import type {
  ContainerStyleOptions,
  HeightConstraints,
  ItemHeightMeasurer,
  LayoutNode,
  MeasuredColsLayoutNode,
  MeasuredItemLayoutNode,
  MeasuredLayoutNode,
  MeasuredRowsLayoutNode,
} from "../types.ts";

export type MeasureContext<T, U> = {
  renderCtx: T;
  gapX: number;
  gapY: number;
  nAbsoluteGridColumns: number;
  dividerPositions: number[]; // N-1 divider positions (center of gaps between columns)
  globalSnapPositions: number[]; // Same as dividerPositions
  boundsX: number;
  boundsW: number;
  itemMeasurer: ItemHeightMeasurer<T, U>;
  overflowTracker: { overflow: boolean };
  parentStartColumn: number;
  parentAvailableSpan: number;
};

// =============================================================================
// Recursive function to calculate height constraints (minH, maxH) for each node
// =============================================================================

export function getHeightConstraints<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U>,
  width: number,
  availableColumns: number,
  startColumn: number,
): HeightConstraints {
  let minH: number;
  let idealH: number;
  let maxH: number;

  if (node.type === "item") {
    // Items have style (padding/border)
    const pad = new Padding(node.style?.padding ?? 0);
    const borderWidth = node.style?.borderWidth ?? 0;
    const borderTotal = borderWidth * 2;
    const paddingAndBorder = pad.totalPy() + borderTotal;
    const innerW = width - pad.totalPx() - borderTotal;

    const result = mctx.itemMeasurer(mctx.renderCtx, node, innerW);
    // Add padding to convert content heights to total heights
    minH = result.minH + paddingAndBorder;
    idealH = result.idealH + paddingAndBorder;
    maxH = result.maxH + paddingAndBorder;
    if (PANTHER_DEBUG) {
      console.log(
        `  ITEM: minH=${minH.toFixed(1)}, idealH=${idealH.toFixed(1)}, maxH=${
          maxH.toFixed(
            1,
          )
        }`,
      );
    }
  } else if (node.type === "rows") {
    if (node.children.length === 0) {
      minH = 0;
      idealH = 0;
      maxH = 0;
    } else {
      const childResults = node.children.map((child) =>
        getHeightConstraints(
          mctx,
          child,
          width,
          availableColumns,
          startColumn,
        )
      );
      const totalGaps = (node.children.length - 1) * mctx.gapY;
      minH = sum(childResults.map((r) => r.minH)) + totalGaps;
      idealH = sum(childResults.map((r) => r.idealH)) + totalGaps;
      maxH = sum(childResults.map((r) => r.maxH)) + totalGaps;
    }
    if (PANTHER_DEBUG) {
      console.log(
        `  ROWS: minH=${minH.toFixed(1)}, idealH=${idealH.toFixed(1)}, maxH=${
          maxH.toFixed(
            1,
          )
        }`,
      );
    }
  } else {
    // Cols: use global grid for child widths
    let currentCol = startColumn;
    const childResults = node.children.map((child) => {
      const childSpan = child.span ?? 1;
      const { contentWidth } = getContentBounds(
        currentCol,
        currentCol + childSpan,
        mctx.dividerPositions,
        mctx.gapX,
        mctx.boundsX,
        mctx.boundsW,
        mctx.nAbsoluteGridColumns,
      );
      const result = getHeightConstraints(
        mctx,
        child,
        contentWidth,
        childSpan,
        currentCol,
      );
      currentCol += childSpan;
      return result;
    });
    // Cols: both use max - need space for tallest, can grow to tallest
    minH = Math.max(...childResults.map((r) => r.minH), 0);
    idealH = Math.max(...childResults.map((r) => r.idealH), 0);
    maxH = Math.max(...childResults.map((r) => r.maxH), 0);
    if (PANTHER_DEBUG) {
      console.log(
        `  COLS: minH=${minH.toFixed(1)}, idealH=${idealH.toFixed(1)}, maxH=${
          maxH.toFixed(
            1,
          )
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

export function measureNode<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U>,
  bounds: RectCoordsDims,
): MeasuredLayoutNode<U> {
  if (node.type === "rows") {
    return measureRowNode(mctx, node, bounds);
  }
  if (node.type === "cols") {
    return measureColNode(mctx, node, bounds);
  }
  return measureItemNode(mctx, node, bounds);
}

function measureRowNode<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U> & { type: "rows" },
  bounds: RectCoordsDims,
): MeasuredRowsLayoutNode<U> {
  // Rows have no style (containers are structural only)
  // Calculate row span (used for child measurements)
  // Row children should all have the same span as their parent
  const rowSpan = node.span ?? mctx.parentAvailableSpan;

  // Get constraints for all children
  const childConstraints = node.children.map((child) =>
    getHeightConstraints(
      mctx,
      child,
      bounds.w(),
      rowSpan,
      mctx.parentStartColumn,
    )
  );

  const totalGapHeight = (node.children.length - 1) * mctx.gapY;
  const totalMinH = sum(childConstraints.map((c) => c.minH));
  const availableHeight = bounds.h();

  // Check for overflow
  if (totalMinH + totalGapHeight > availableHeight) {
    mctx.overflowTracker.overflow = true;
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
  let currentY = bounds.y();

  // Row's absoluteStartColumn (for passing to children)
  const rowStartColumn = mctx.parentStartColumn;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childH = childHeights[i];

    const childBounds = new RectCoordsDims({
      x: bounds.x(),
      y: currentY,
      w: bounds.w(),
      h: childH,
    });

    // Row children inherit the row's horizontal position
    const childMctx: MeasureContext<T, U> = {
      ...mctx,
      parentStartColumn: rowStartColumn,
      parentAvailableSpan: rowSpan,
    };

    const measuredChild = measureNode(childMctx, child, childBounds);

    measuredChildren.push(measuredChild);
    currentY += childH + mctx.gapY;
  }

  const actualTotalHeight = measuredChildren.length > 0
    ? currentY - bounds.y() - mctx.gapY
    : 0;
  const rpd = bounds.getAdjusted({
    h: Math.max(0, Math.min(actualTotalHeight, bounds.h())),
  });

  // Calculate span as max of children (rows stack vertically, occupy same columns)
  const calculatedSpan = Math.max(...measuredChildren.map((c) => c.span), 1);
  const span = node.span ?? calculatedSpan;

  // Calculate minimum span (max of children's minimums since rows stack)
  const minimumSpanIfAllChildrenWere1 = Math.max(
    ...measuredChildren.map((c) => c.minimumSpanIfAllChildrenWere1),
    1,
  );

  return {
    ...node,
    rpd,
    children: measuredChildren,
    absoluteStartColumn: mctx.parentStartColumn,
    absoluteEndColumn: mctx.parentStartColumn + span,
    span,
    minimumSpanIfAllChildrenWere1,
  };
}

function measureColNode<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U> & { type: "cols" },
  bounds: RectCoordsDims,
): MeasuredColsLayoutNode<U> {
  // Cols have no style (containers are structural only)
  // Get constraints for all children using divider-based widths
  let constraintCol = mctx.parentStartColumn;
  const childConstraints = node.children.map((child) => {
    const childSpan = child.span ?? 1;
    const { contentWidth } = getContentBounds(
      constraintCol,
      constraintCol + childSpan,
      mctx.dividerPositions,
      mctx.gapX,
      mctx.boundsX,
      mctx.boundsW,
      mctx.nAbsoluteGridColumns,
    );
    const result = getHeightConstraints(
      mctx,
      child,
      contentWidth,
      childSpan,
      constraintCol,
    );
    constraintCol += childSpan;
    return result;
  });

  // Cols row height: up to largest maxH, but at least largest minH
  const maxOfMinH = Math.max(...childConstraints.map((c) => c.minH), 0);
  const maxOfMaxH = Math.max(...childConstraints.map((c) => c.maxH), 0);

  // Row height is the smaller of container and max of maxH, but at least max of minH
  let rowHeight = Math.min(bounds.h(), maxOfMaxH);
  rowHeight = Math.max(rowHeight, maxOfMinH);

  // Check for overflow (can't fit minimum heights)
  if (maxOfMinH > bounds.h()) {
    mctx.overflowTracker.overflow = true;
  }

  // Measure children - each gets row height, capped by their maxH
  const measuredChildren: MeasuredLayoutNode<U>[] = [];
  let currentCol = mctx.parentStartColumn;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childConstraint = childConstraints[i];
    const childSpan = child.span ?? 1;

    // Calculate position and width from dividers
    const { leftEdge, contentWidth } = getContentBounds(
      currentCol,
      currentCol + childSpan,
      mctx.dividerPositions,
      mctx.gapX,
      mctx.boundsX,
      mctx.boundsW,
      mctx.nAbsoluteGridColumns,
    );
    const childX = leftEdge;
    const childWidth = contentWidth;

    // Child height is row height, but capped by their maxH
    const childH = Math.min(rowHeight, childConstraint.maxH);

    const childBounds = new RectCoordsDims({
      x: childX,
      y: bounds.y(),
      w: childWidth,
      h: childH,
    });

    const childMctx: MeasureContext<T, U> = {
      ...mctx,
      parentStartColumn: currentCol,
      parentAvailableSpan: childSpan,
    };

    const measuredChild = measureNode(childMctx, child, childBounds);

    measuredChildren.push(measuredChild);
    currentCol += childSpan;
  }

  const rpd = bounds.getAdjusted({ h: Math.min(rowHeight, bounds.h()) });

  // Calculate span as sum of children (cols are horizontal)
  const calculatedSpan = measuredChildren.reduce((sum, c) => sum + c.span, 0);
  const span = node.span ?? calculatedSpan;

  // Calculate minimum span (sum of children's minimums since cols are horizontal)
  const minimumSpanIfAllChildrenWere1 = measuredChildren.reduce(
    (sum, c) => sum + c.minimumSpanIfAllChildrenWere1,
    0,
  );

  return {
    ...node,
    rpd,
    children: measuredChildren,
    absoluteStartColumn: mctx.parentStartColumn,
    absoluteEndColumn: mctx.parentStartColumn + span,
    span,
    minimumSpanIfAllChildrenWere1,
  };
}

function measureItemNode<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U> & { type: "item" },
  bounds: RectCoordsDims,
): MeasuredItemLayoutNode<U> {
  const innerBounds = getInnerBounds(bounds, node.style);
  const borderWidth = node.style?.borderWidth ?? 0;
  const borderTotal = borderWidth * 2;
  const pad = new Padding(node.style?.padding ?? 0);

  const constraints = mctx.itemMeasurer(mctx.renderCtx, node, innerBounds.w());

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

  const rpd = bounds;
  const contentRpd = innerBounds;

  const span = node.span ?? mctx.parentAvailableSpan;

  return {
    ...node,
    rpd,
    contentRpd,
    idealH,
    maxH,
    neededScalingToFitWidth: constraints.neededScalingToFitWidth,
    absoluteStartColumn: mctx.parentStartColumn,
    absoluteEndColumn: mctx.parentStartColumn + span,
    span,
    minimumSpanIfAllChildrenWere1: 1,
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

/**
 * Calculate content bounds for a column span using divider positions.
 * Gaps are centered on dividers, with no gap at outer edges.
 */
function getContentBounds(
  startCol: number,
  endCol: number,
  dividerPositions: number[],
  gapX: number,
  boundsX: number,
  boundsW: number,
  nCols: number,
): { leftEdge: number; rightEdge: number; contentWidth: number } {
  const leftEdge = startCol === 0
    ? boundsX
    : dividerPositions[startCol - 1] + gapX / 2;
  const rightEdge = endCol === nCols
    ? boundsX + boundsW
    : dividerPositions[endCol - 1] - gapX / 2;
  return { leftEdge, rightEdge, contentWidth: rightEdge - leftEdge };
}
