// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  PaddingOptions,
  RectCoordsDims,
} from "./deps.ts";

export type LayoutNodeId = string;

export type HeightMode =
  | "use-measured-height"
  | "fill-to-row-height"
  | "fill-to-container";

export type ContainerStyleOptions = {
  padding?: PaddingOptions;
  backgroundColor?: ColorKeyOrString;
  borderColor?: ColorKeyOrString;
  borderWidth?: number;
  borderRadius?: number;
};

export type LayoutNodeBase = {
  id: LayoutNodeId;
  height?: number;
  heightMode?: HeightMode;
  style?: ContainerStyleOptions;
  span?: number;
};

export type RowsLayoutNode<U> = LayoutNodeBase & {
  type: "rows";
  children: LayoutNode<U>[];
};

export type ColsLayoutNode<U> = LayoutNodeBase & {
  type: "cols";
  children: LayoutNode<U>[];
};

export type ItemLayoutNode<U> = LayoutNodeBase & {
  type: "item";
  data: U;
};

export type LayoutNode<U> =
  | RowsLayoutNode<U>
  | ColsLayoutNode<U>
  | ItemLayoutNode<U>;

export type ContainerLayoutNode<U> = RowsLayoutNode<U> | ColsLayoutNode<U>;

export type MeasuredRowsLayoutNode<U> = RowsLayoutNode<U> & {
  rpd: RectCoordsDims;
  children: MeasuredLayoutNode<U>[];
};

export type MeasuredColsLayoutNode<U> = ColsLayoutNode<U> & {
  rpd: RectCoordsDims;
  children: MeasuredLayoutNode<U>[];
};

export type MeasuredItemLayoutNode<U> = ItemLayoutNode<U> & {
  rpd: RectCoordsDims;
};

export type MeasuredLayoutNode<U> =
  | MeasuredRowsLayoutNode<U>
  | MeasuredColsLayoutNode<U>
  | MeasuredItemLayoutNode<U>;

export type ItemIdealHeightInfo = {
  idealH: number;
  noShrink?: boolean;
};

export type IdealHeightResult = {
  height: number;
  minHeight: number; // Minimum height that cannot be shrunk (from noShrink items)
};

export type ItemHeightMeasurer<T, U> = (
  ctx: T,
  item: ItemLayoutNode<U>,
  width: number,
) => ItemIdealHeightInfo;

export type LayoutWarning = {
  type:
    | "INVALID_SPAN"
    | "SPAN_OVERFLOW"
    | "SPAN_MISMATCH"
    | "NO_SPACE_FOR_FLEX"
    | "HEIGHT_OVERFLOW";
  message: string;
  path?: string;
};

export type MeasureLayoutResult<U> = {
  measured: MeasuredLayoutNode<U>;
  warnings: LayoutWarning[];
  gaps: LayoutGap[];
};

export type LayoutGapRowGap = {
  type: "row-gap";
  afterRowIndex: number;
  rcd: RectCoordsDims;
};

export type LayoutGapColGap = {
  type: "col-gap";
  rowIndex: number;
  afterColIndex: number;
  rcd: RectCoordsDims;
};

export type LayoutGapColDivider = {
  type: "col-divider";
  rowIndex: number;
  afterColIndex: number;
  line: { x: number; y1: number; y2: number };
};

export type LayoutGap = LayoutGapRowGap | LayoutGapColGap | LayoutGapColDivider;

export function isRowsLayoutNode<U>(
  node: LayoutNode<U>,
): node is RowsLayoutNode<U> {
  return node.type === "rows";
}

export function isColsLayoutNode<U>(
  node: LayoutNode<U>,
): node is ColsLayoutNode<U> {
  return node.type === "cols";
}

export function isItemLayoutNode<U>(
  node: LayoutNode<U>,
): node is ItemLayoutNode<U> {
  return node.type === "item";
}

export function isMeasuredRowsLayoutNode<U>(
  node: MeasuredLayoutNode<U>,
): node is MeasuredRowsLayoutNode<U> {
  return node.type === "rows";
}

export function isMeasuredColsLayoutNode<U>(
  node: MeasuredLayoutNode<U>,
): node is MeasuredColsLayoutNode<U> {
  return node.type === "cols";
}

export function isMeasuredItemLayoutNode<U>(
  node: MeasuredLayoutNode<U>,
): node is MeasuredItemLayoutNode<U> {
  return node.type === "item";
}
