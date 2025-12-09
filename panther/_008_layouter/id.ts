// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColsLayoutNode,
  ItemLayoutNode,
  LayoutNode,
  LayoutNodeId,
  RowsLayoutNode,
} from "./types.ts";

export function generateLayoutId(): LayoutNodeId {
  return crypto.randomUUID();
}

export function createRowsNode<U>(
  children: LayoutNode<U>[],
  options?: Partial<Omit<RowsLayoutNode<U>, "type" | "children">>,
): RowsLayoutNode<U> {
  return {
    id: generateLayoutId(),
    type: "row",
    children,
    ...options,
  };
}

export function createColsNode<U>(
  children: (LayoutNode<U> & { span?: number })[],
  options?: Partial<Omit<ColsLayoutNode<U>, "type" | "children">>,
): ColsLayoutNode<U> {
  return {
    id: generateLayoutId(),
    type: "col",
    children,
    ...options,
  };
}

export function createItemNode<U>(
  data: U,
  options?: Partial<Omit<ItemLayoutNode<U>, "type" | "data">>,
): ItemLayoutNode<U> {
  return {
    id: generateLayoutId(),
    type: "item",
    data,
    ...options,
  };
}
