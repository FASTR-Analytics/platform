// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutNode } from "./types.ts";

/**
 * Apply mutations to a layout tree using immutable updates
 * Creates a shallow clone at each level, preserving references where unchanged
 * This preserves function references (e.g., in FigureInputs) that break with structuredClone
 */
export function updateLayout<U>(
  layout: LayoutNode<U>,
  recipe: (draft: LayoutNode<U>) => void,
): LayoutNode<U> {
  // Create mutable draft by shallow cloning the tree
  const draft = shallowCloneTree(layout);
  recipe(draft);
  return draft;
}

/**
 * Shallow clone layout tree - creates new objects at each level but preserves
 * data references. This allows mutations during recipe while preserving functions.
 */
function shallowCloneTree<U>(node: LayoutNode<U>): LayoutNode<U> {
  if (node.type === "item") {
    return { ...node }; // Shallow clone - data reference preserved
  }

  // Container node - shallow clone with cloned children array
  return {
    ...node,
    children: node.children.map((child) =>
      shallowCloneTree(child as LayoutNode<U>)
    ),
  };
}
