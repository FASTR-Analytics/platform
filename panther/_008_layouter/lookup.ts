// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ContainerLayoutNode,
  LayoutNode,
  LayoutNodeId,
  MeasuredLayoutNode,
} from "./types.ts";

export type NodeLookupResult<U> = {
  node: LayoutNode<U>;
  parent: LayoutNode<U> | undefined;
  index: number;
};

export function findById<U>(
  layout: LayoutNode<U>,
  id: LayoutNodeId,
): NodeLookupResult<U> | undefined {
  return findByIdRecursive(layout, id, undefined, -1);
}

function findByIdRecursive<U>(
  node: LayoutNode<U>,
  id: LayoutNodeId,
  parent: LayoutNode<U> | undefined,
  index: number,
): NodeLookupResult<U> | undefined {
  if (node.id === id) {
    return { node, parent, index };
  }

  if (node.type === "row" || node.type === "col") {
    for (let i = 0; i < node.children.length; i++) {
      const result = findByIdRecursive(node.children[i], id, node, i);
      if (result) return result;
    }
  }

  return undefined;
}

export function findByPoint<U>(
  measured: MeasuredLayoutNode<U>,
  x: number,
  y: number,
): MeasuredLayoutNode<U> | undefined {
  if (!isPointInNode(measured, x, y)) {
    return undefined;
  }

  if (measured.type === "row" || measured.type === "col") {
    for (const child of measured.children) {
      const result = findByPoint(child, x, y);
      if (result) return result;
    }
  }

  return measured;
}

function isPointInNode<U>(
  node: MeasuredLayoutNode<U>,
  x: number,
  y: number,
): boolean {
  const rpd = node.rpd;
  return (
    x >= rpd.x() &&
    x <= rpd.x() + rpd.w() &&
    y >= rpd.y() &&
    y <= rpd.y() + rpd.h()
  );
}

export function getAllIds<U>(layout: LayoutNode<U>): LayoutNodeId[] {
  const ids: LayoutNodeId[] = [];
  collectIds(layout, ids);
  return ids;
}

function collectIds<U>(node: LayoutNode<U>, ids: LayoutNodeId[]): void {
  ids.push(node.id);

  if (node.type === "row" || node.type === "col") {
    for (const child of node.children) {
      collectIds(child, ids);
    }
  }
}

export function findNodeInDraft<U>(
  draft: LayoutNode<U>,
  id: LayoutNodeId,
): LayoutNode<U> | undefined {
  if (draft.id === id) {
    return draft;
  }

  if (draft.type === "row" || draft.type === "col") {
    for (const child of draft.children) {
      const result = findNodeInDraft(child, id);
      if (result) return result;
    }
  }

  return undefined;
}

export type ParentLookupResult<U> = {
  parent: ContainerLayoutNode<U>;
  index: number;
};

export function findParentInDraft<U>(
  draft: LayoutNode<U>,
  id: LayoutNodeId,
): ParentLookupResult<U> | undefined {
  if (draft.type === "row" || draft.type === "col") {
    for (let i = 0; i < draft.children.length; i++) {
      if (draft.children[i].id === id) {
        return { parent: draft, index: i };
      }
      const result = findParentInDraft(draft.children[i], id);
      if (result) return result;
    }
  }

  return undefined;
}
