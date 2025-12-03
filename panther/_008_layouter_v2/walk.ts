// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MeasuredLayoutNode } from "./types.ts";

export type LayoutVisitor<U> = (node: MeasuredLayoutNode<U>) => void;

export function walkLayout<U>(
  node: MeasuredLayoutNode<U>,
  visitor: LayoutVisitor<U>,
): void {
  visitor(node);
  if (node.type === "row" || node.type === "col") {
    for (const child of node.children) {
      walkLayout(child, visitor);
    }
  }
}
