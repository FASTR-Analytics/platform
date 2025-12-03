// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ContainerStyleOptions,
  LayoutNode,
  LayoutNodeId,
} from "./types.ts";
import { findNodeInDraft, findParentInDraft } from "./lookup.ts";
import { updateLayout } from "./update.ts";

export function moveNode<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
  newParentId: LayoutNodeId,
  insertIndex: number,
): LayoutNode<U> {
  return updateLayout(layout, (draft) => {
    const nodeToMove = findNodeInDraft(draft, nodeId);
    if (!nodeToMove) return;

    const oldParentInfo = findParentInDraft(draft, nodeId);
    if (!oldParentInfo) return;

    const newParent = findNodeInDraft(draft, newParentId);
    if (!newParent || newParent.type === "item") return;

    oldParentInfo.parent.children.splice(oldParentInfo.index, 1);

    const adjustedIndex = Math.min(insertIndex, newParent.children.length);
    newParent.children.splice(adjustedIndex, 0, nodeToMove as LayoutNode<U>);
  });
}

export function deleteNode<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
): LayoutNode<U> {
  if (layout.id === nodeId) {
    return layout;
  }

  return updateLayout(layout, (draft) => {
    const parentInfo = findParentInDraft(draft, nodeId);
    if (!parentInfo) return;

    parentInfo.parent.children.splice(parentInfo.index, 1);
  });
}

export function reorderNode<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
  newIndex: number,
): LayoutNode<U> {
  return updateLayout(layout, (draft) => {
    const parentInfo = findParentInDraft(draft, nodeId);
    if (!parentInfo) return;

    const { parent, index: oldIndex } = parentInfo;
    const node = parent.children[oldIndex];

    parent.children.splice(oldIndex, 1);

    const adjustedIndex = Math.min(newIndex, parent.children.length);
    parent.children.splice(adjustedIndex, 0, node);
  });
}

export function updateNodeStyle<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
  style: Partial<ContainerStyleOptions>,
): LayoutNode<U> {
  return updateLayout(layout, (draft) => {
    const node = findNodeInDraft(draft, nodeId);
    if (!node) return;

    node.style = { ...node.style, ...style };
  });
}

export function setColumnSpan<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
  span: number | undefined,
): LayoutNode<U> {
  return updateLayout(layout, (draft) => {
    const parentInfo = findParentInDraft(draft, nodeId);
    if (!parentInfo) return;

    const { parent, index } = parentInfo;
    if (parent.type !== "col") return;

    const child = parent.children[index] as LayoutNode<U> & { span?: number };
    if (span === undefined) {
      delete child.span;
    } else {
      child.span = span;
    }
  });
}

export function updateNodeData<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
  updater: (data: U) => U,
): LayoutNode<U> {
  return updateLayout(layout, (draft) => {
    const node = findNodeInDraft(draft, nodeId);
    if (!node || node.type !== "item") return;

    node.data = updater(node.data);
  });
}
