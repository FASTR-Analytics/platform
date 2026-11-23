// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutNode } from "../types.ts";

// Each span is at least its minimum, so the minimums must sum to no more than
// targetTotal.
export function rescaleSpans(
  oldSpans: number[],
  targetTotal: number,
  minSpans: number[],
): number[] {
  const currentTotal = oldSpans.reduce((a, b) => a + b, 0);
  if (
    currentTotal === targetTotal &&
    oldSpans.every((span, i) => span >= minSpans[i])
  ) {
    return oldSpans;
  }

  const scale = targetTotal / currentTotal;
  const result: number[] = [];
  let remaining = targetTotal;
  let reservedForLater = minSpans.reduce((a, b) => a + b, 0);

  for (let i = 0; i < oldSpans.length; i++) {
    reservedForLater -= minSpans[i];
    const span = i === oldSpans.length - 1 ? remaining : Math.min(
      Math.max(minSpans[i], Math.round(oldSpans[i] * scale)),
      remaining - reservedForLater,
    );
    result.push(span);
    remaining -= span;
  }

  return result;
}

/**
 * Calculate minimum span needed for a node based on its structure.
 */
export function getMinimumSpan<U>(node: LayoutNode<U>): number {
  if (node.type === "item") return 1;
  if (node.type === "rows") {
    // Rows: max of children's minimum spans
    return Math.max(...node.children.map((c) => getMinimumSpan(c)), 1);
  }
  // An empty cols takes a column, as an empty rows does: a node given no
  // column is placed with a NaN or non-positive width.
  return Math.max(
    node.children.reduce((sum, c) => sum + getMinimumSpan(c), 0),
    1,
  );
}

/**
 * Validates that a layout tree is structurally valid. Undefined spans are allowed.
 * - No explicit span exceeds available span
 * - Rows: explicit child spans must match parent span
 * - Cols: total minimum span of children must fit in available span
 * - Cols: explicit child spans must be >= the child's structural minimum
 * THROWS if validation fails.
 */
export function validateLayout<U>(
  layout: LayoutNode<U>,
  availableSpan: number = 12,
): void {
  validateLayoutInternal(layout, availableSpan, []);
}

/**
 * Pure function that normalizes/fixes a layout tree to ensure all spans are valid.
 * Use this in your app if you need to fix spans before passing to measureLayout.
 * - Rows: span set to available span, and all children forced to it
 * - Cols: children rescaled to sum to parent's span
 * - Items: span set to available span
 */
export function normalizeLayout<U>(
  layout: LayoutNode<U>,
  availableSpan: number = 12,
): LayoutNode<U> {
  return normalizeLayoutInternal(layout, availableSpan);
}

/**
 * Validates layout and throws on invalid spans.
 */
function validateLayoutInternal<U>(
  layout: LayoutNode<U>,
  availableSpan: number,
  path: string[],
): void {
  const nodePath = [...path, `${layout.type}[${layout.id}]`].join(" > ");

  // Items: span is optional (will use availableSpan during measurement)
  if (layout.type === "item") {
    if (layout.span !== undefined && layout.span > availableSpan) {
      throw new Error(
        `${nodePath}: Item span ${layout.span} exceeds available ${availableSpan}`,
      );
    }
    return;
  }

  // Container span: can be undefined (will be calculated)
  // Only validate if explicitly exceeds available
  if (layout.span !== undefined && layout.span > availableSpan) {
    throw new Error(
      `${nodePath}: Span ${layout.span} exceeds available ${availableSpan}`,
    );
  }

  const nodeSpan = layout.span ?? availableSpan;

  if (layout.type === "rows") {
    // Rows children: must ALL have EXACTLY the parent's span
    for (let i = 0; i < layout.children.length; i++) {
      const child = layout.children[i];
      if (child.span !== undefined && child.span !== nodeSpan) {
        throw new Error(
          `${nodePath} child[${i}]: Rows child has span=${child.span} but parent has span=${nodeSpan} (must match exactly)`,
        );
      }
      validateLayoutInternal(child, nodeSpan, [
        ...path,
        `${layout.type}[${layout.id}]`,
      ]);
    }
  } else {
    // Cols: check children can structurally fit in the available span
    const totalMinSpan = layout.children.reduce(
      (sum, c) => sum + getMinimumSpan(c),
      0,
    );
    if (totalMinSpan > nodeSpan) {
      throw new Error(
        `${nodePath}: Cols children need minimum total span=${totalMinSpan} but only ${nodeSpan} available`,
      );
    }

    for (let i = 0; i < layout.children.length; i++) {
      const child = layout.children[i];
      const neededSpan = getMinimumSpan(child);

      if (child.span !== undefined && child.span < neededSpan) {
        throw new Error(
          `${nodePath} child[${i}]: ${child.type} has explicit span=${child.span} but needs minimum span=${neededSpan}`,
        );
      }

      const childAvailableSpan = child.span ?? neededSpan;
      validateLayoutInternal(
        child,
        childAvailableSpan,
        [...path, `${layout.type}[${layout.id}]`],
      );
    }
  }
}

/**
 * Normalizes layout by fixing invalid spans (pure function).
 */
function normalizeLayoutInternal<U>(
  layout: LayoutNode<U>,
  availableSpan: number,
): LayoutNode<U> {
  if (layout.type === "item") {
    return { ...layout, span: availableSpan };
  }

  if (layout.type === "rows") {
    // Rows: take the span given, then force ALL children to exact span
    const rowSpan = availableSpan;
    const normalizedChildren = layout.children.map((child) => {
      const normalizedChild = normalizeLayoutInternal(child, rowSpan);
      return { ...normalizedChild, span: rowSpan };
    });
    return {
      ...layout,
      children: normalizedChildren,
      span: rowSpan,
    };
  }

  const childSpans = colsChildSpans(layout.children, availableSpan);
  return {
    ...layout,
    children: layout.children.map((child, i) =>
      normalizeLayoutInternal(child, childSpans[i])
    ),
    span: availableSpan,
  };
}

// Explicit spans are kept while the implicit children's minimums fit beside
// them, and the implicit children share the rest. Otherwise the implicit
// children take their minimums and the explicit spans, as in a cols whose
// every span is explicit, are rescaled into the rest: a stored layout that
// over-claims is drawn, never refused.
function colsChildSpans<U>(
  children: LayoutNode<U>[],
  availableSpan: number,
): number[] {
  const explicit = children.filter((c) => c.span !== undefined);
  const implicit = children.filter((c) => c.span === undefined);
  const explicitSpans = explicit.map((c) => c.span!);
  const explicitTotal = explicitSpans.reduce((a, b) => a + b, 0);
  const implicitMins = implicit.map(getMinimumSpan);
  const implicitMinTotal = implicitMins.reduce((a, b) => a + b, 0);

  const keepExplicit = implicit.length > 0 &&
    explicitTotal + implicitMinTotal <= availableSpan;
  const explicitResult = keepExplicit ? explicitSpans : rescaleSpans(
    explicitSpans,
    availableSpan - implicitMinTotal,
    explicit.map(getMinimumSpan),
  );
  const implicitResult = keepExplicit
    ? rescaleSpans(
      implicit.map(() => 1),
      availableSpan - explicitTotal,
      implicitMins,
    )
    : implicitMins;

  let explicitIdx = 0;
  let implicitIdx = 0;
  return children.map((c) =>
    c.span === undefined
      ? implicitResult[implicitIdx++]
      : explicitResult[explicitIdx++]
  );
}
