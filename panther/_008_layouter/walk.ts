// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ItemLayoutNode,
  LayoutNode,
  MeasuredLayoutNode,
} from "./types.ts";

export type LayoutVisitor<U> = (node: MeasuredLayoutNode<U>) => void;

export function walkLayout<U>(
  node: MeasuredLayoutNode<U>,
  visitor: LayoutVisitor<U>,
): void {
  visitor(node);
  if (node.type === "rows" || node.type === "cols") {
    for (const child of node.children) {
      walkLayout(child, visitor);
    }
  }
}

/**
 * Find the first item node in a layout tree.
 * Useful for auto-selecting after delete operations.
 */
export function findFirstItem<U>(
  layout: LayoutNode<U>,
): ItemLayoutNode<U> | undefined {
  if (layout.type === "item") return layout;
  for (const child of layout.children) {
    const result = findFirstItem(child as LayoutNode<U>);
    if (result) return result;
  }
  return undefined;
}
