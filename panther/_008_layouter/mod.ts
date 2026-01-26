// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  ColsLayoutNode,
  ContainerLayoutNode,
  ContainerStyleOptions,
  HeightConstraints,
  ItemHeightMeasurer,
  ItemLayoutNode,
  LayoutGap,
  LayoutGapColDivider,
  LayoutGapColGap,
  LayoutGapRowGap,
  LayoutNode,
  LayoutNodeBase,
  LayoutNodeId,
  MeasuredColsLayoutNode,
  MeasuredItemLayoutNode,
  MeasuredLayoutNode,
  MeasuredRowsLayoutNode,
  MeasureLayoutResult,
  RowsLayoutNode,
} from "./types.ts";

export {
  isColsLayoutNode,
  isItemLayoutNode,
  isMeasuredColsLayoutNode,
  isMeasuredItemLayoutNode,
  isMeasuredRowsLayoutNode,
  isRowsLayoutNode,
} from "./types.ts";

export { measureLayout } from "./measure.ts";
export type { MeasureLayoutOptions } from "./measure.ts";

export { walkLayout } from "./walk.ts";
export type { LayoutVisitor } from "./walk.ts";

export { renderContainerStyle } from "./render.ts";

export {
  createColsNode,
  createItemNode,
  createRowsNode,
  generateLayoutId,
} from "./id.ts";

export {
  findById,
  findByPoint,
  findNodeInDraft,
  findParentInDraft,
  getAllIds,
} from "./lookup.ts";
export type { NodeLookupResult, ParentLookupResult } from "./lookup.ts";

export { updateLayout } from "./update.ts";

export {
  addCol,
  addRow,
  deleteNode,
  deleteNodeWithCleanup,
  insertSibling,
  moveNode,
  reorderNode,
  setColumnSpan,
  simplifyLayout,
  splitIntoColumns,
  splitIntoRows,
  updateNodeData,
  updateNodeStyle,
} from "./operations.ts";

export { getColWidths, getWidthForSpan } from "./col_widths.ts";
export type { ColWidthInfo } from "./col_widths.ts";

export { optimizeLayout } from "./optimizer.ts";
export type {
  LayoutScore,
  LayoutStyleConfig,
  OptimizerConfig,
  OptimizerConstraint,
  OptimizeResult,
} from "./optimizer.ts";
