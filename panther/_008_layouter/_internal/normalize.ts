// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutNode } from "../types.ts";

export function rescaleSpans(
  oldSpans: number[],
  targetTotal: number,
): number[] {
  const currentTotal = oldSpans.reduce((a, b) => a + b, 0);
  if (currentTotal === targetTotal) return oldSpans;

  const scale = targetTotal / currentTotal;
  const result: number[] = [];
  let remaining = targetTotal;

  for (let i = 0; i < oldSpans.length; i++) {
    if (i === oldSpans.length - 1) {
      result.push(Math.max(1, remaining));
    } else {
      let scaled = Math.max(1, Math.round(oldSpans[i] * scale));
      const remainingChildren = oldSpans.length - 1 - i;
      if (remaining - scaled < remainingChildren) {
        scaled = Math.max(1, remaining - remainingChildren);
      }
      result.push(scaled);
      remaining -= scaled;
    }
  }

  return result;
}

/**
 * Calculate minimum span needed for a node based on its structure.
 */
function calculateMinimumSpan<U>(node: LayoutNode<U>): number {
  if (node.type === "item") return 1;
  if (node.type === "rows") {
    // Rows: max of children's minimum spans
    return Math.max(...node.children.map((c) => calculateMinimumSpan(c)), 1);
  }
  // Cols: sum of children's minimum spans
  return node.children.reduce((sum, c) => sum + calculateMinimumSpan(c), 0);
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
 * - Rows: all children forced to parent's span
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
      (sum, c) => sum + calculateMinimumSpan(c),
      0,
    );
    if (totalMinSpan > nodeSpan) {
      throw new Error(
        `${nodePath}: Cols children need minimum total span=${totalMinSpan} but only ${nodeSpan} available`,
      );
    }

    for (let i = 0; i < layout.children.length; i++) {
      const child = layout.children[i];
      const neededSpan = calculateMinimumSpan(child);

      if (child.span !== undefined && child.span < neededSpan) {
        throw new Error(
          `${nodePath} child[${i}]: ${child.type} has explicit span=${child.span} but needs minimum span=${neededSpan}`,
        );
      }

      const childAvailableSpan = child.span ?? Math.max(1, neededSpan);
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
    // Rows: cap to available, then force ALL children to exact span
    const rowSpan = Math.min(layout.span ?? availableSpan, availableSpan);
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

  // Cols: rescale children to sum to available span
  const preliminaryChildren = layout.children.map((child) =>
    normalizeLayoutInternal(child, child.span ?? 1)
  );

  const childSpans = preliminaryChildren.map((c) => c.span!);
  const finalSpans = rescaleSpans(childSpans, availableSpan);

  const normalizedChildren = preliminaryChildren.map((child, i) =>
    finalSpans[i] === child.span
      ? child
      : normalizeLayoutInternal(child, finalSpans[i])
  );

  return {
    ...layout,
    children: normalizedChildren,
    span: availableSpan,
  };
}
