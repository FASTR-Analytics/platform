// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColsLayoutNode,
  IdGenerator,
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
  idGenerator?: IdGenerator,
): RowsLayoutNode<U> {
  return {
    id: (idGenerator ?? generateLayoutId)(),
    type: "rows",
    children,
    ...options,
  };
}

export function createColsNode<U>(
  children: LayoutNode<U>[],
  options?: Partial<Omit<ColsLayoutNode<U>, "type" | "children">>,
  idGenerator?: IdGenerator,
): ColsLayoutNode<U> {
  return {
    id: (idGenerator ?? generateLayoutId)(),
    type: "cols",
    children,
    ...options,
  };
}

export function createItemNode<U>(
  data: U,
  options?: Partial<Omit<ItemLayoutNode<U>, "type" | "data">>,
  idGenerator?: IdGenerator,
): ItemLayoutNode<U> {
  return {
    id: (idGenerator ?? generateLayoutId)(),
    type: "item",
    data,
    ...options,
  };
}
