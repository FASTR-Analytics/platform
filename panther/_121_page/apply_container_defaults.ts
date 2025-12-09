// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContainerStyleOptions, LayoutNode } from "./deps.ts";

/**
 * Recursively applies container style defaults to a layout node tree.
 * Property-level merging: node.style properties override defaults independently.
 *
 * @param node - Layout node tree to process
 * @param defaults - Merged container defaults from page style (already scaled)
 * @returns New layout tree with merged container styles
 */
export function applyContainerDefaults<U>(
  node: LayoutNode<U>,
  defaults: ContainerStyleOptions,
): LayoutNode<U> {
  // Property-level merge: each property checked independently
  const mergedStyle: ContainerStyleOptions = {
    padding: node.style?.padding ?? defaults.padding,
    backgroundColor: node.style?.backgroundColor ?? defaults.backgroundColor,
    borderColor: node.style?.borderColor ?? defaults.borderColor,
    borderWidth: node.style?.borderWidth ?? defaults.borderWidth,
    borderRadius: node.style?.borderRadius ?? defaults.borderRadius,
  };

  // Recursively apply to children
  if (node.type === "row") {
    return {
      ...node,
      style: mergedStyle,
      children: node.children.map((child) =>
        applyContainerDefaults(child, defaults)
      ),
    };
  }

  if (node.type === "col") {
    return {
      ...node,
      style: mergedStyle,
      children: node.children.map((child) =>
        applyContainerDefaults(child, defaults)
      ),
    };
  }

  return {
    ...node,
    style: mergedStyle,
  };
}
