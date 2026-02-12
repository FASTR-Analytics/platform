// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { _GLOBAL_LAYOUT_COLUMNS } from "./deps.ts";
import { createColsNode, createRowsNode } from "./id.ts";
import { findById, findNodeInDraft, findParentInDraft } from "./lookup.ts";
import { normalizeLayout, rescaleSpans } from "./_internal/normalize.ts";
import type {
  ContainerStyleOptions,
  IdGenerator,
  LayoutNode,
  LayoutNodeId,
  MeasuredLayoutNode,
} from "./types.ts";
import { updateLayout } from "./update.ts";

function distributeSpansBalanced(
  totalSpan: number,
  count: number,
): number[] {
  const base = Math.floor(totalSpan / count);
  const remainder = totalSpan % count;
  const spans: number[] = [];
  for (let i = 0; i < count; i++) {
    spans.push(i < remainder ? base + 1 : base);
  }
  return spans;
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

    const { parent, index } = parentInfo;
    parent.children.splice(index, 1);

    if (parent.type === "cols" && parent.children.length > 0) {
      const parentSpan = parent.span ?? _GLOBAL_LAYOUT_COLUMNS;
      const oldSpans = parent.children.map((c) => c.span ?? 1);
      const newSpans = rescaleSpans(oldSpans, parentSpan);
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        const oldChildSpan = oldSpans[i];
        child.span = newSpans[i];
        if (child.type !== "item" && oldChildSpan !== newSpans[i]) {
          rescaleDescendantSpans(child, oldChildSpan, newSpans[i]);
        }
      }
    }
  });
}

export function updateNodeStyle<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
  style: Partial<ContainerStyleOptions>,
): LayoutNode<U> {
  return updateLayout(layout, (draft) => {
    const node = findNodeInDraft(draft, nodeId);
    if (!node || node.type !== "item") return;

    node.style = { ...node.style, ...style };
  });
}

export function applyDividerDragUpdate<U>(
  layout: LayoutNode<U>,
  update: {
    leftNodeId: string;
    rightNodeId: string;
    suggestedSpans: { left: number; right: number };
  },
): LayoutNode<U> {
  let updated = setColumnSpan(
    layout,
    update.leftNodeId,
    update.suggestedSpans.left,
  );
  updated = setColumnSpan(
    updated,
    update.rightNodeId,
    update.suggestedSpans.right,
  );
  return updated;
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
    const oldSpan = child.span ?? calculateNodeSpan(child);

    if (span === undefined) {
      delete child.span;
    } else {
      child.span = span;
      if (oldSpan !== span) {
        rescaleDescendantSpans(child, oldSpan, span);
      }
    }
  });
}

function calculateNodeSpan<U>(node: LayoutNode<U>): number {
  if (node.type === "item") return 1;
  if (node.type === "rows") {
    return Math.max(
      ...node.children.map((c) => c.span ?? calculateNodeSpan(c)),
      1,
    );
  }
  return node.children.reduce(
    (sum, c) => sum + (c.span ?? calculateNodeSpan(c)),
    0,
  );
}

function rescaleDescendantSpans<U>(
  node: LayoutNode<U>,
  oldParentSpan: number,
  newParentSpan: number,
): void {
  if (node.type === "item") return;

  if (node.type === "rows") {
    for (const child of node.children) {
      const oldChildSpan = child.span ?? oldParentSpan;
      child.span = newParentSpan;
      if (child.type !== "item") {
        rescaleDescendantSpans(child, oldChildSpan, newParentSpan);
      }
    }
  } else {
    const oldSpans = node.children.map((c) => c.span ?? 1);
    const newSpans = rescaleSpans(oldSpans, newParentSpan);
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const oldChildSpan = oldSpans[i];
      child.span = newSpans[i];
      if (child.type !== "item") {
        rescaleDescendantSpans(child, oldChildSpan, newSpans[i]);
      }
    }
  }
}

export function getMinimumSpan<U>(
  node: LayoutNode<U> | MeasuredLayoutNode<U>,
): number {
  if ("minimumSpanIfAllChildrenWere1" in node) {
    return (node as MeasuredLayoutNode<U>).minimumSpanIfAllChildrenWere1;
  }

  if (node.type === "item") return 1;

  if (node.type === "rows") {
    return Math.max(...node.children.map(getMinimumSpan), 1);
  }

  return node.children.reduce((sum, child) => sum + getMinimumSpan(child), 0);
}

export function canSplitIntoColumns<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
): boolean {
  const found = findById(layout, nodeId);
  if (!found) return false;
  const node = found.node;
  const minSpan = getMinimumSpan(node);
  const currentSpan = found.parent
    ? (found.parent.type === "rows"
      ? (found.parent.span ?? _GLOBAL_LAYOUT_COLUMNS)
      : (node.span ?? 1))
    : (node.span ?? _GLOBAL_LAYOUT_COLUMNS);
  return currentSpan >= Math.max(2, minSpan);
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

    const parent = parentInfo.parent;

    const parentSpan = parent.span ?? calculateNodeSpan(parent);

    const insertIndex = position === "before"
      ? parentInfo.index
      : parentInfo.index + 1;

    parent.children.splice(insertIndex, 0, newNode);

    if (parent.type === "rows") {
      for (const child of parent.children) {
        const oldChildSpan = child.span ?? calculateNodeSpan(child);
        child.span = parentSpan;
        if (child.type !== "item" && oldChildSpan !== parentSpan) {
          rescaleDescendantSpans(child, oldChildSpan, parentSpan);
        }
      }
    } else {
      const balancedSpans = distributeSpansBalanced(
        parentSpan,
        parent.children.length,
      );

      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        const oldChildSpan = child.span ?? calculateNodeSpan(child);
        const newChildSpan = balancedSpans[i];

        child.span = newChildSpan;

        if (child.type !== "item" && oldChildSpan !== newChildSpan) {
          rescaleDescendantSpans(child, oldChildSpan, newChildSpan);
        }
      }
    }
  });
}

export function splitIntoColumns<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "before" | "after" = "after",
  idGenerator?: IdGenerator,
): LayoutNode<U> {
  if (layout.id === targetId) {
    const targetSpan = layout.span ?? _GLOBAL_LAYOUT_COLUMNS;
    if (targetSpan < 2) return layout;
    const halfSpan = Math.floor(targetSpan / 2);
    const child1 = normalizeLayout({ ...layout, span: halfSpan }, halfSpan);
    const child2 = { ...newNode, span: targetSpan - halfSpan };
    const children = position === "before"
      ? [child2, child1]
      : [child1, child2];
    return createColsNode(children, undefined, idGenerator);
  }

  return updateLayout(layout, (draft) => {
    const parentInfo = findParentInDraft(draft, targetId);
    if (!parentInfo) return;

    const { parent, index } = parentInfo;
    const targetNode = parent.children[index];
    const targetSpan = parent.type === "rows"
      ? (parent.span ?? _GLOBAL_LAYOUT_COLUMNS)
      : (targetNode.span ?? 1);

    if (targetSpan < 2) return;

    if (parent.type === "cols") {
      const halfSpan = Math.floor(targetSpan / 2);
      const oldTargetSpan = targetNode.span ?? calculateNodeSpan(targetNode);
      targetNode.span = halfSpan;
      newNode.span = targetSpan - halfSpan;
      if (targetNode.type !== "item" && oldTargetSpan !== halfSpan) {
        rescaleDescendantSpans(targetNode, oldTargetSpan, halfSpan);
      }
      const insertIndex = position === "before" ? index : index + 1;
      parent.children.splice(insertIndex, 0, newNode);
    } else {
      const halfSpan = Math.floor(targetSpan / 2);
      const child1 = normalizeLayout(
        { ...targetNode, span: halfSpan },
        halfSpan,
      );
      const child2 = { ...newNode, span: targetSpan - halfSpan };
      const children = position === "before"
        ? [child2, child1]
        : [child1, child2];
      const wrapper = createColsNode(children as LayoutNode<U>[], {
        span: targetSpan,
      }, idGenerator);
      parent.children[index] = wrapper;
    }
  });
}

export function splitIntoRows<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "before" | "after" = "after",
  idGenerator?: IdGenerator,
): LayoutNode<U> {
  if (layout.id === targetId) {
    const targetSpan = layout.span ?? _GLOBAL_LAYOUT_COLUMNS;
    const child1 = { ...layout, span: targetSpan };
    const child2 = { ...newNode, span: targetSpan };
    const children = position === "before"
      ? [child2, child1]
      : [child1, child2];
    return createRowsNode(children, undefined, idGenerator);
  }

  return updateLayout(layout, (draft) => {
    const parentInfo = findParentInDraft(draft, targetId);
    if (!parentInfo) return;

    const { parent, index } = parentInfo;
    const targetNode = parent.children[index];
    const targetSpan = parent.type === "cols"
      ? (targetNode.span ?? 1)
      : (parent.span ?? _GLOBAL_LAYOUT_COLUMNS);

    if (parent.type === "rows") {
      newNode.span = targetSpan;
      const insertIndex = position === "before" ? index : index + 1;
      parent.children.splice(insertIndex, 0, newNode);
    } else {
      const child1 = normalizeLayout(
        { ...targetNode, span: targetSpan },
        targetSpan,
      );
      const child2 = { ...newNode, span: targetSpan };
      const children = position === "before"
        ? [child2, child1]
        : [child1, child2];
      const wrapper = createRowsNode(children as LayoutNode<U>[], {
        span: targetSpan,
      }, idGenerator);
      parent.children[index] = wrapper;
    }
  });
}

export function simplifyLayout<U>(layout: LayoutNode<U>): LayoutNode<U> {
  return simplifyNode(layout);
}

function simplifyNode<U>(node: LayoutNode<U>): LayoutNode<U> {
  if (node.type === "item") {
    return node;
  }

  const simplifiedChildren = node.children
    .map((child) => simplifyNode(child as LayoutNode<U>))
    .filter((child) => child.type === "item" || child.children.length > 0);

  if (simplifiedChildren.length === 1) {
    const child = simplifiedChildren[0] as LayoutNode<U>;
    return { ...child, span: node.span };
  }

  return { ...node, children: simplifiedChildren as typeof node.children };
}

export function deleteNodeWithCleanup<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
): LayoutNode<U> | null {
  if (layout.id === targetId) {
    return null;
  }

  const afterDelete = deleteNode(layout, targetId);
  const simplified = simplifyLayout(afterDelete);
  return normalizeLayout(simplified, simplified.span ?? _GLOBAL_LAYOUT_COLUMNS);
}

export function addRow<U>(
  layout: LayoutNode<U>,
  targetId: LayoutNodeId,
  newNode: LayoutNode<U>,
  position: "above" | "below",
  idGenerator?: IdGenerator,
): LayoutNode<U> {
  if (layout.id === targetId || layout.type === "item") {
    const layoutSpan = layout.span ?? _GLOBAL_LAYOUT_COLUMNS;
    const child1 = normalizeLayout(
      { ...layout, span: layoutSpan },
      layoutSpan,
    );
    const child2 = { ...newNode, span: layoutSpan };
    const children = position === "above" ? [child2, child1] : [child1, child2];
    return createRowsNode(children, { span: layoutSpan }, idGenerator);
  }

  const parentInfo = findParentInDraft(layout, targetId);
  if (parentInfo && parentInfo.parent.type === "rows") {
    return updateLayout(layout, (draft) => {
      const info = findParentInDraft(draft, targetId);
      if (info && info.parent.type === "rows") {
        const parent = info.parent;

        const parentSpan = parent.span ?? calculateNodeSpan(parent);

        const clonedNew = { ...newNode, span: parentSpan };
        const insertIndex = position === "above" ? info.index : info.index + 1;

        parent.children.splice(insertIndex, 0, clonedNew);

        for (const child of parent.children) {
          const oldChildSpan = child.span ?? calculateNodeSpan(child);
          child.span = parentSpan;
          if (child.type !== "item" && oldChildSpan !== parentSpan) {
            rescaleDescendantSpans(child, oldChildSpan, parentSpan);
          }
        }
      }
    });
  }

  const rowAncestor = findRowAncestor(layout, targetId);

  if (rowAncestor) {
    return updateLayout(layout, (draft) => {
      const ancestor = findRowAncestor(draft, targetId);
      if (ancestor) {
        const parent = ancestor.rowsParent;

        const parentSpan = parent.span ?? calculateNodeSpan(parent);

        const clonedNew = { ...newNode, span: parentSpan };
        const insertIndex = position === "above"
          ? ancestor.childIndex
          : ancestor.childIndex + 1;

        parent.children.splice(insertIndex, 0, clonedNew);

        for (const child of parent.children) {
          const oldChildSpan = child.span ?? calculateNodeSpan(child);
          child.span = parentSpan;
          if (child.type !== "item" && oldChildSpan !== parentSpan) {
            rescaleDescendantSpans(child, oldChildSpan, parentSpan);
          }
        }
      }
    });
  }

  const layoutSpan = layout.span ?? _GLOBAL_LAYOUT_COLUMNS;
  const child1 = normalizeLayout(layout, layoutSpan);
  const child2 = { ...newNode, span: layoutSpan };
  const children = position === "above" ? [child2, child1] : [child1, child2];
  return createRowsNode(children, { span: layoutSpan }, idGenerator);
}

function findRowAncestor<U>(
  root: LayoutNode<U>,
  targetId: LayoutNodeId,
): { rowsParent: LayoutNode<U> & { type: "rows" }; childIndex: number } | null {
  if (root.type === "item") return null;

  if (root.type === "rows") {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      if (containsId(child, targetId)) {
        const deeper = findRowAncestor(child as LayoutNode<U>, targetId);
        if (deeper) return deeper;
        return { rowsParent: root, childIndex: i };
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
  idGenerator?: IdGenerator,
): LayoutNode<U> {
  if (layout.id === targetId || layout.type === "item") {
    const layoutSpan = layout.span ?? _GLOBAL_LAYOUT_COLUMNS;
    const halfSpan = Math.floor(layoutSpan / 2);

    const child1 = normalizeLayout(layout, halfSpan);
    const child2 = { ...newNode, span: layoutSpan - halfSpan };
    const children = position === "left" ? [child2, child1] : [child1, child2];
    return createColsNode(children, { span: layoutSpan }, idGenerator);
  }

  const parentInfo = findParentInDraft(layout, targetId);
  if (parentInfo && parentInfo.parent.type === "cols") {
    return updateLayout(layout, (draft) => {
      const info = findParentInDraft(draft, targetId);
      if (info && info.parent.type === "cols") {
        const parent = info.parent;

        const clonedNew = { ...newNode };
        const insertIndex = position === "left" ? info.index : info.index + 1;

        parent.children.splice(insertIndex, 0, clonedNew);

        const parentSpan = parent.span ?? calculateNodeSpan(parent);
        const balancedSpans = distributeSpansBalanced(
          parentSpan,
          parent.children.length,
        );

        for (let i = 0; i < parent.children.length; i++) {
          const child = parent.children[i];
          const oldChildSpan = child.span ?? calculateNodeSpan(child);
          const newChildSpan = balancedSpans[i];

          child.span = newChildSpan;

          if (child.type !== "item" && oldChildSpan !== newChildSpan) {
            rescaleDescendantSpans(child, oldChildSpan, newChildSpan);
          }
        }
      }
    });
  }

  const colsAncestor = findColsAncestor(layout, targetId);

  if (colsAncestor) {
    return updateLayout(layout, (draft) => {
      const ancestor = findColsAncestor(draft, targetId);
      if (ancestor) {
        const parent = ancestor.colsParent;

        const clonedNew = { ...newNode };
        const insertIndex = position === "left"
          ? ancestor.childIndex
          : ancestor.childIndex + 1;

        parent.children.splice(insertIndex, 0, clonedNew);

        const parentSpan = parent.span ?? calculateNodeSpan(parent);
        const balancedSpans = distributeSpansBalanced(
          parentSpan,
          parent.children.length,
        );

        for (let i = 0; i < parent.children.length; i++) {
          const child = parent.children[i];
          const oldChildSpan = child.span ?? calculateNodeSpan(child);
          const newChildSpan = balancedSpans[i];

          child.span = newChildSpan;

          if (child.type !== "item" && oldChildSpan !== newChildSpan) {
            rescaleDescendantSpans(child, oldChildSpan, newChildSpan);
          }
        }
      }
    });
  }

  const layoutSpan = layout.span ?? _GLOBAL_LAYOUT_COLUMNS;
  const halfSpan = Math.floor(layoutSpan / 2);
  const child1 = normalizeLayout(layout, halfSpan);
  const child2 = { ...newNode, span: layoutSpan - halfSpan };
  const children = position === "left" ? [child2, child1] : [child1, child2];
  return createColsNode(children, { span: layoutSpan }, idGenerator);
}

function findColsAncestor<U>(
  root: LayoutNode<U>,
  targetId: LayoutNodeId,
): { colsParent: LayoutNode<U> & { type: "cols" }; childIndex: number } | null {
  if (root.type === "item") return null;

  if (root.type === "cols") {
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      if (containsId(child, targetId)) {
        const deeper = findColsAncestor(child as LayoutNode<U>, targetId);
        if (deeper) return deeper;
        return { colsParent: root, childIndex: i };
      }
    }
  }

  for (const child of root.children) {
    const result = findColsAncestor(child as LayoutNode<U>, targetId);
    if (result) return result;
  }

  return null;
}

export function moveNodeLeft<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
): LayoutNode<U> | null {
  const colsAncestor = findColsAncestor(layout, nodeId);
  if (!colsAncestor || colsAncestor.childIndex === 0) return null;

  return updateLayout(layout, (draft) => {
    const ancestor = findColsAncestor(draft, nodeId);
    if (ancestor && ancestor.childIndex > 0) {
      const siblings = ancestor.colsParent.children;
      const i = ancestor.childIndex;
      [siblings[i - 1], siblings[i]] = [siblings[i], siblings[i - 1]];
    }
  });
}

export function moveNodeRight<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
): LayoutNode<U> | null {
  const colsAncestor = findColsAncestor(layout, nodeId);
  if (!colsAncestor) return null;

  const maxIndex = colsAncestor.colsParent.children.length - 1;
  if (colsAncestor.childIndex >= maxIndex) return null;

  return updateLayout(layout, (draft) => {
    const ancestor = findColsAncestor(draft, nodeId);
    if (
      ancestor &&
      ancestor.childIndex < ancestor.colsParent.children.length - 1
    ) {
      const siblings = ancestor.colsParent.children;
      const i = ancestor.childIndex;
      [siblings[i], siblings[i + 1]] = [siblings[i + 1], siblings[i]];
    }
  });
}

export function moveNodeUp<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
): LayoutNode<U> | null {
  const rowAncestor = findRowAncestor(layout, nodeId);
  if (!rowAncestor || rowAncestor.childIndex === 0) return null;

  return updateLayout(layout, (draft) => {
    const ancestor = findRowAncestor(draft, nodeId);
    if (ancestor && ancestor.childIndex > 0) {
      const siblings = ancestor.rowsParent.children;
      const i = ancestor.childIndex;
      [siblings[i - 1], siblings[i]] = [siblings[i], siblings[i - 1]];
    }
  });
}

export function moveNodeDown<U>(
  layout: LayoutNode<U>,
  nodeId: LayoutNodeId,
): LayoutNode<U> | null {
  const rowAncestor = findRowAncestor(layout, nodeId);
  if (!rowAncestor) return null;

  const maxIndex = rowAncestor.rowsParent.children.length - 1;
  if (rowAncestor.childIndex >= maxIndex) return null;

  return updateLayout(layout, (draft) => {
    const ancestor = findRowAncestor(draft, nodeId);
    if (
      ancestor &&
      ancestor.childIndex < ancestor.rowsParent.children.length - 1
    ) {
      const siblings = ancestor.rowsParent.children;
      const i = ancestor.childIndex;
      [siblings[i], siblings[i + 1]] = [siblings[i + 1], siblings[i]];
    }
  });
}
