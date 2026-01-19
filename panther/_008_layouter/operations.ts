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
import { createColsNode, createRowsNode, generateLayoutId } from "./id.ts";

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
    if (parent.type !== "cols") return;

    const child = parent.children[index];
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

export function insertSibling<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "before" | "after",
): LayoutNode<U> {
  return updateLayout(layout, (draft) => {
    const parentInfo = findParentInDraft(draft, targetId);
    if (!parentInfo) return;

    const insertIndex = position === "before"
      ? parentInfo.index
      : parentInfo.index + 1;
    parentInfo.parent.children.splice(insertIndex, 0, newNode);
  });
}

export function splitIntoColumns<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "before" | "after" = "after",
): LayoutNode<U> {
  const cloned = structuredClone(layout);

  if (cloned.id === targetId) {
    const children = position === "before"
      ? [newNode, cloned]
      : [cloned, newNode];
    return createColsNode(children);
  }

  return updateLayout(cloned, (draft) => {
    const parentInfo = findParentInDraft(draft, targetId);
    if (!parentInfo) return;

    const { parent, index } = parentInfo;
    const targetNode = parent.children[index];

    if (parent.type === "cols") {
      const insertIndex = position === "before" ? index : index + 1;
      parent.children.splice(insertIndex, 0, newNode);
    } else {
      const children = position === "before"
        ? [newNode, targetNode]
        : [targetNode, newNode];
      const wrapper = createColsNode(children as LayoutNode<U>[]);
      parent.children[index] = wrapper;
    }
  });
}

export function splitIntoRows<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "before" | "after" = "after",
): LayoutNode<U> {
  const cloned = structuredClone(layout);

  if (cloned.id === targetId) {
    const children = position === "before"
      ? [newNode, cloned]
      : [cloned, newNode];
    return createRowsNode(children);
  }

  return updateLayout(cloned, (draft) => {
    const parentInfo = findParentInDraft(draft, targetId);
    if (!parentInfo) return;

    const { parent, index } = parentInfo;
    const targetNode = parent.children[index];

    if (parent.type === "rows") {
      const insertIndex = position === "before" ? index : index + 1;
      parent.children.splice(insertIndex, 0, newNode);
    } else {
      const children = position === "before"
        ? [newNode, targetNode]
        : [targetNode, newNode];
      const wrapper = createRowsNode(children as LayoutNode<U>[]);
      parent.children[index] = wrapper;
    }
  });
}

export function simplifyLayout<U>(layout: LayoutNode<U>): LayoutNode<U> {
  const cloned = structuredClone(layout);
  return simplifyNode(cloned);
}

function simplifyNode<U>(node: LayoutNode<U>): LayoutNode<U> {
  if (node.type === "item") {
    return node;
  }

  node.children = node.children.map((child) =>
    simplifyNode(child as LayoutNode<U>)
  ) as typeof node.children;

  if (node.children.length === 1) {
    const child = node.children[0];
    if (child.span !== undefined) {
      delete child.span;
    }
    return child as LayoutNode<U>;
  }

  return node;
}

export function deleteNodeWithCleanup<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
): LayoutNode<U> | null {
  if (layout.id === targetId) {
    return null;
  }

  const afterDelete = deleteNode(layout, targetId);
  return simplifyLayout(afterDelete);
}

export function addRow<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "above" | "below",
): LayoutNode<U> {
  const cloned = structuredClone(layout);

  // If root is the target or just an item, wrap in a row with both items
  if (cloned.id === targetId || cloned.type === "item") {
    const children = position === "above"
      ? [newNode, cloned]
      : [cloned, newNode];
    return createRowsNode(children);
  }

  // Check if direct parent is a row - if so, just insert as sibling
  const parentInfo = findParentInDraft(cloned, targetId);
  if (parentInfo && parentInfo.parent.type === "rows") {
    const insertIndex = position === "above"
      ? parentInfo.index
      : parentInfo.index + 1;
    parentInfo.parent.children.splice(insertIndex, 0, newNode);
    return cloned;
  }

  // Find a row ancestor and insert there
  const rowAncestor = findRowAncestor(cloned, targetId);

  if (rowAncestor) {
    const { rowParent, colIndex } = rowAncestor;
    const insertIndex = position === "above" ? colIndex : colIndex + 1;
    rowParent.children.splice(insertIndex, 0, newNode);
    return cloned;
  }

  // No row ancestor - wrap entire layout in a row
  const children = position === "above" ? [newNode, cloned] : [cloned, newNode];
  return createRowsNode(children);
}

function findRowAncestor<U>(
  root: LayoutNode<U>,
  targetId: LayoutNodeId,
): { rowParent: LayoutNode<U> & { type: "rows" }; colIndex: number } | null {
  if (root.type === "item") return null;

  if (root.type === "rows") {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      if (containsId(child, targetId)) {
        return { rowParent: root, colIndex: i };
      }
    }
  }

  for (const child of root.children) {
    const result = findRowAncestor(child as LayoutNode<U>, targetId);
    if (result) return result;
  }

  return null;
}

function containsId<U>(node: LayoutNode<U>, targetId: LayoutNodeId): boolean {
  if (node.id === targetId) return true;
  if (node.type === "item") return false;
  return node.children.some((child) =>
    containsId(child as LayoutNode<U>, targetId)
  );
}

export function addCol<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "left" | "right",
): LayoutNode<U> {
  const cloned = structuredClone(layout);

  // If root is the target or just an item, wrap in a cols with both items
  if (cloned.id === targetId || cloned.type === "item") {
    const children = position === "left"
      ? [newNode, cloned]
      : [cloned, newNode];
    return createColsNode(children);
  }

  // Check if direct parent is cols - if so, just insert as sibling
  const parentInfo = findParentInDraft(cloned, targetId);
  if (parentInfo && parentInfo.parent.type === "cols") {
    const insertIndex = position === "left"
      ? parentInfo.index
      : parentInfo.index + 1;
    parentInfo.parent.children.splice(insertIndex, 0, newNode);
    return cloned;
  }

  // Find a cols ancestor and insert there
  const colsAncestor = findColsAncestor(cloned, targetId);

  if (colsAncestor) {
    const { colsParent, rowIndex } = colsAncestor;
    const insertIndex = position === "left" ? rowIndex : rowIndex + 1;
    colsParent.children.splice(insertIndex, 0, newNode);
    return cloned;
  }

  // No cols ancestor - wrap entire layout in cols
  const children = position === "left" ? [newNode, cloned] : [cloned, newNode];
  return createColsNode(children);
}

function findColsAncestor<U>(
  root: LayoutNode<U>,
  targetId: LayoutNodeId,
): { colsParent: LayoutNode<U> & { type: "cols" }; rowIndex: number } | null {
  if (root.type === "item") return null;

  if (root.type === "cols") {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      if (containsId(child, targetId)) {
        return { colsParent: root, rowIndex: i };
      }
    }
  }

  for (const child of root.children) {
    const result = findColsAncestor(child as LayoutNode<U>, targetId);
    if (result) return result;
  }

  return null;
}
