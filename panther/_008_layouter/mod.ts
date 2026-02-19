// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type {
  ColsLayoutNode,
  ContainerLayoutNode,
  ContainerStyleOptions,
  HeightConstraints,
  IdGenerator,
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
  ResolvedContainerStyle,
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

export { createCachedMeasurer, measureLayout } from "./measure.ts";
export type { MeasureLayoutOptions } from "./measure.ts";

export { findFirstItem, walkLayout } from "./walk.ts";
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
  applyDividerDragUpdate,
  canSplitIntoColumns,
  deleteNode,
  deleteNodeWithCleanup,
  getMinimumSpan,
  insertSibling,
  moveNodeDown,
  moveNodeLeft,
  moveNodeRight,
  moveNodeUp,
  setColumnSpan,
  simplifyLayout,
  splitIntoColumns,
  splitIntoRows,
  updateNodeData,
  updateNodeStyle,
} from "./operations.ts";

export {
  computeWeightedScore,
  generateCandidates,
  optimizeLayout,
  pickBestLayout,
  scoreLayouts,
} from "./optimizer.ts";
export type {
  LayoutScore,
  LayoutScoreWeights,
  LayoutStyleConfig,
  OptimizerConfig,
  OptimizerConstraint,
  ScoredLayout,
} from "./optimizer.ts";

export { normalizeLayout, validateLayout } from "./_internal/normalize.ts";
