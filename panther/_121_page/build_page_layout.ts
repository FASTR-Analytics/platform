// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutNode } from "./deps.ts";
import { createColsNode, createItemNode, createRowsNode } from "./deps.ts";
import type { PageContentItem } from "./types.ts";

export type LayoutInput =
  | string
  | PageContentItem
  | LayoutNode<PageContentItem>
  | LayoutInput[];

export function buildPageLayout(
  input: LayoutInput,
  depth = 0,
): LayoutNode<PageContentItem> {
  if (Array.isArray(input)) {
    const isRow = depth % 2 === 0;
    const children = input.map((child) => buildPageLayout(child, depth + 1));

    return isRow ? createRowsNode(children) : createColsNode(children);
  }

  if (isLayoutNode<PageContentItem>(input)) {
    if (input.type === "row") {
      return {
        ...input,
        children: input.children.map((child) => buildPageLayout(child, 1)),
      };
    }
    if (input.type === "col") {
      return {
        ...input,
        children: input.children.map((child) => buildPageLayout(child, 0)),
      };
    }
    return input;
  }

  if (typeof input === "string") {
    return createItemNode({ markdown: input });
  }

  return createItemNode(input);
}

function isLayoutNode<U>(input: unknown): input is LayoutNode<U> {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("type" in input) || !("id" in input)) {
    return false;
  }
  const type = (input as { type: unknown }).type;
  return type === "row" || type === "col" || type === "item";
}
