// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  clamp,
  getColor,
  overlayPadding,
  Padding,
  PANTHER_DEBUG,
  RectCoordsDims,
  sum,
} from "../deps.ts";
import type { LayoutStyleConfig } from "../optimizer.ts";
import { isOverflow } from "../overflow.ts";
import type {
  ContainerDecorationOptions,
  ContainerStyleOptions,
  ItemLayoutNode,
  ItemSizeMeasurer,
  LayoutNode,
  LayoutNodeBase,
  LayoutNodeNeed,
  LayoutOverflowCause,
  MeasuredColsLayoutNode,
  MeasuredItemLayoutNode,
  MeasuredLayoutNode,
  MeasuredRowsLayoutNode,
  ResolvedContainerDecoration,
  ResolvedContainerStyle,
  SizeConstraints,
} from "../types.ts";

export type MeasureContext<T, U> = {
  renderCtx: T;
  gapX: number;
  gapY: number;
  layoutStyle: LayoutStyleConfig;
  nAbsoluteGridColumns: number;
  dividerPositions: number[]; // N-1 divider positions (center of gaps between columns)
  globalSnapPositions: number[]; // Same as dividerPositions
  boundsX: number;
  boundsW: number;
  itemMeasurer: ItemSizeMeasurer<T, U>;
  parentStartColumn: number;
  parentAvailableSpan: number;
};

type NodeMinimum = { minH: number; neededBy: LayoutNodeNeed[] };

type NodeHeightConstraints = NodeMinimum & { idealH: number; maxH: number };

// A node placed in its rect, with the items under it that are wider than
// theirs.
type PlacedNode<N> = { measured: N; widthCauses: LayoutOverflowCause[] };

function resolveContainerStyle(
  nodeStyle: ContainerStyleOptions | undefined,
  layoutStyle: LayoutStyleConfig,
): ResolvedContainerStyle {
  const sf = layoutStyle.alreadyScaledValue ?? 1;
  const defaults = layoutStyle.containerDefaults;

  const defaultPadding = defaults?.padding ?? new Padding(0);
  const padding = overlayPadding(defaultPadding, nodeStyle?.padding, sf);

  const borderWidth = nodeStyle?.borderWidth !== undefined
    ? nodeStyle.borderWidth * sf
    : (defaults?.borderWidth ?? 0);

  const backgroundColor = nodeStyle?.backgroundColor !== undefined
    ? getColor(nodeStyle.backgroundColor)
    : (defaults?.backgroundColor ?? "none");

  const borderColor = nodeStyle?.borderColor !== undefined
    ? getColor(nodeStyle.borderColor)
    : (defaults?.borderColor ?? "none");

  const rectRadius = nodeStyle?.rectRadius !== undefined
    ? nodeStyle.rectRadius * sf
    : (defaults?.rectRadius ?? 0);

  const decoration = resolveDecoration(nodeStyle?.decoration, sf);

  const backgroundExtent = nodeStyle?.backgroundExtent ?? "content";

  return {
    padding,
    borderWidth,
    backgroundColor,
    borderColor,
    rectRadius,
    decoration,
    backgroundExtent,
  };
}

function resolveDecoration(
  dec: ContainerDecorationOptions | undefined,
  sf: number,
): ResolvedContainerDecoration {
  if (!dec) return { type: "none" };
  const size = (dec.size ?? 40) * sf;
  const topMargin = dec.topMargin ?? size * 0.3;
  return {
    type: "quote",
    color: getColor(dec.color ?? "black"),
    size,
    topMargin,
  };
}

// =============================================================================
// Size constraints
// =============================================================================

export function getSizeConstraints<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U>,
  width: number,
  availableColumns: number,
  startColumn: number,
): NodeHeightConstraints {
  if (node.type === "item") {
    const { minH, idealH, maxH, neededBy } = measureItemConstraints(
      mctx,
      node,
      width,
    );
    if (PANTHER_DEBUG) {
      console.log(
        `  ITEM: minH=${minH.toFixed(1)}, idealH=${idealH.toFixed(1)}, maxH=${
          maxH.toFixed(
            1,
          )
        }`,
      );
    }
    return { minH, idealH, maxH, neededBy };
  }

  let minH: number;
  let neededBy: LayoutNodeNeed[];
  let idealH: number;
  let maxH: number;

  if (node.type === "rows") {
    if (node.children.length === 0) {
      minH = 0;
      neededBy = [];
      idealH = 0;
      maxH = 0;
    } else {
      const childResults = node.children.map((child) =>
        getSizeConstraints(mctx, child, width, availableColumns, startColumn)
      );
      const totalGaps = (node.children.length - 1) * mctx.gapY;
      ({ minH, neededBy } = stackedMinimum(childResults, mctx.gapY));
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
      const result = getSizeConstraints(
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
    ({ minH, neededBy } = tallestMinimum(childResults));
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

  return resolveNodeConstraints(node, { minH, neededBy, idealH, maxH });
}

function stackedMinimum(
  children: NodeHeightConstraints[],
  gapY: number,
): NodeMinimum {
  return {
    minH: sum(children.map((c) => c.minH)) +
      Math.max(0, children.length - 1) * gapY,
    neededBy: children.flatMap((c) => c.neededBy),
  };
}

function tallestMinimum(children: NodeHeightConstraints[]): NodeMinimum {
  const minH = Math.max(...children.map((c) => c.minH), 0);
  return {
    minH,
    neededBy: children.flatMap((c) => c.minH === minH ? c.neededBy : []),
  };
}

function resolveNodeConstraints(
  node: LayoutNodeBase,
  content: NodeHeightConstraints,
): NodeHeightConstraints {
  const minH = Math.max(content.minH, node.minH ?? 0);
  const maxH = Math.max(minH, node.maxH ?? content.maxH);
  const raised = node.minH !== undefined && node.minH > content.minH;
  return {
    minH,
    neededBy: raised ? [{ id: node.id, need: minH }] : content.neededBy,
    idealH: clamp(content.idealH, minH, maxH),
    maxH,
  };
}

// An item's content constraints, read at the width its padding and border
// leave, and its total heights: padding and border added, maxH unbounded when
// it aligns its content or fills its background, and its own minH and maxH
// applied.
function measureItemConstraints<T, U>(
  mctx: MeasureContext<T, U>,
  node: ItemLayoutNode<U>,
  width: number,
): NodeHeightConstraints & {
  resolved: ResolvedContainerStyle;
  content: SizeConstraints;
} {
  const resolved = resolveContainerStyle(node.style, mctx.layoutStyle);
  const borderTotal = resolved.borderWidth * 2;
  const paddingAndBorder = resolved.padding.totalPy() + borderTotal;
  const content = mctx.itemMeasurer(
    mctx.renderCtx,
    node,
    width - resolved.padding.totalPx() - borderTotal,
  );
  const minH = content.minH + paddingAndBorder;
  return {
    resolved,
    content,
    ...resolveNodeConstraints(node, {
      minH,
      neededBy: [{ id: node.id, need: minH }],
      idealH: content.idealH + paddingAndBorder,
      maxH: node.alignV || resolved.backgroundExtent === "fill"
        ? Infinity
        : content.maxH + paddingAndBorder,
    }),
  };
}

// =============================================================================
// Layout pass - allocates actual space based on constraints
// =============================================================================

export function measureNode<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U>,
  bounds: RectCoordsDims,
): PlacedNode<MeasuredLayoutNode<U>> {
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
): PlacedNode<MeasuredRowsLayoutNode<U>> {
  // Rows have no style (containers are structural only)
  // Calculate row span (used for child measurements)
  // Row children should all have the same span as their parent
  const rowSpan = node.span ?? mctx.parentAvailableSpan;

  // Get constraints for all children
  const childConstraints = node.children.map((child) =>
    getSizeConstraints(
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

  const toIdeal = shareEqually(
    childConstraints.map((c) => c.minH),
    childConstraints.map((c) => c.idealH),
    availableHeight - totalGapHeight - totalMinH,
  );
  const childHeights = shareEqually(
    toIdeal.heights,
    childConstraints.map((c) => c.maxH),
    toIdeal.extra,
  ).heights;

  // Measure children with allocated heights
  const placedChildren: PlacedNode<MeasuredLayoutNode<U>>[] = [];
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

    placedChildren.push(measureNode(childMctx, child, childBounds));
    currentY += childH + mctx.gapY;
  }

  const measuredChildren = placedChildren.map((p) => p.measured);
  const actualTotalHeight = measuredChildren.length > 0
    ? currentY - bounds.y() - mctx.gapY
    : 0;
  const rpd = bounds.getAdjusted({
    h: clamp(actualTotalHeight, 0, bounds.h()),
  });

  // Calculate span as max of children (rows stack vertically, occupy same columns)
  const calculatedSpan = Math.max(...measuredChildren.map((c) => c.span), 1);
  const span = node.span ?? calculatedSpan;

  return {
    measured: {
      ...node,
      rpd,
      children: measuredChildren,
      absoluteStartColumn: mctx.parentStartColumn,
      absoluteEndColumn: mctx.parentStartColumn + span,
      span,
    },
    widthCauses: placedChildren.flatMap((p) => p.widthCauses),
  };
}

function measureColNode<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U> & { type: "cols" },
  bounds: RectCoordsDims,
): PlacedNode<MeasuredColsLayoutNode<U>> {
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
    const result = getSizeConstraints(
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

  // Measure children - each gets row height, capped by their maxH
  const placedChildren: PlacedNode<MeasuredLayoutNode<U>>[] = [];
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

    placedChildren.push(measureNode(childMctx, child, childBounds));
    currentCol += childSpan;
  }

  const measuredChildren = placedChildren.map((p) => p.measured);
  const rpd = bounds.getAdjusted({ h: Math.min(rowHeight, bounds.h()) });

  // Calculate span as sum of children (cols are horizontal)
  const calculatedSpan = measuredChildren.reduce((sum, c) => sum + c.span, 0);
  const span = node.span ?? calculatedSpan;

  return {
    measured: {
      ...node,
      rpd,
      children: measuredChildren,
      absoluteStartColumn: mctx.parentStartColumn,
      absoluteEndColumn: mctx.parentStartColumn + span,
      span,
    },
    widthCauses: placedChildren.flatMap((p) => p.widthCauses),
  };
}

function measureItemNode<T, U>(
  mctx: MeasureContext<T, U>,
  node: LayoutNode<U> & { type: "item" },
  bounds: RectCoordsDims,
): PlacedNode<MeasuredItemLayoutNode<U>> {
  const { resolved, content, idealH, maxH } = measureItemConstraints(
    mctx,
    node,
    bounds.w(),
  );
  const pad = resolved.padding;
  const borderWidth = resolved.borderWidth;

  const boundsAfterBorder = bounds.getPadded(new Padding(borderWidth));
  const innerBounds = boundsAfterBorder.getPadded(pad);

  const minW = content.minW + pad.totalPx() + borderWidth * 2;
  const widthCauses: LayoutOverflowCause[] = isOverflow(minW, bounds.w())
    ? [{
      axis: "width",
      need: minW,
      available: bounds.w(),
      neededBy: [{ id: node.id, need: minW }],
    }]
    : [];

  const span = node.span ?? mctx.parentAvailableSpan;
  const { style: _style, ...nodeWithoutStyle } = node;

  const contentH = node.alignV
    ? Math.min(content.idealH, innerBounds.h())
    : innerBounds.h();
  const spareH = innerBounds.h() - contentH;
  const yOffset = node.alignV === "middle"
    ? spareH / 2
    : node.alignV === "bottom"
    ? spareH
    : 0;
  const contentRpd = innerBounds.getAdjusted({
    y: innerBounds.y() + yOffset,
    h: contentH,
  });
  const filledStyleRpd = bounds.getPadded(new Padding(borderWidth / 2));
  const styleRpd = node.alignV && resolved.backgroundExtent === "content"
    ? filledStyleRpd.getAdjusted({
      y: contentRpd.y() - pad.pt() - borderWidth / 2,
      h: contentH + pad.totalPy() + borderWidth,
    })
    : filledStyleRpd;

  return {
    measured: {
      ...nodeWithoutStyle,
      type: "item",
      resolvedStyle: resolved,
      rpd: bounds,
      contentRpd,
      styleRpd,
      idealH,
      maxH,
      neededScalingToFitWidth: content.neededScalingToFitWidth,
      absoluteStartColumn: mctx.parentStartColumn,
      absoluteEndColumn: mctx.parentStartColumn + span,
      span,
    },
    widthCauses,
  };
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

function shareEqually(
  heights: number[],
  caps: number[],
  extra: number,
): { heights: number[]; extra: number } {
  const grown = [...heights];
  let left = extra;
  while (left > 0.001) {
    const growable = grown.flatMap((h, i) => h < caps[i] ? [i] : []);
    if (growable.length === 0) break;
    const share = left / growable.length;
    let distributed = 0;
    for (const i of growable) {
      const growth = Math.min(share, caps[i] - grown[i]);
      grown[i] += growth;
      distributed += growth;
    }
    left -= distributed;
    if (distributed < 0.001) break;
  }
  return { heights: grown, extra: left };
}
