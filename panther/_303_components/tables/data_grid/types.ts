// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// A numeric matrix as the caller has already formatted and coloured it: the
// grid draws text and colours it is given and computes nothing. `value` is
// the sort key, since text alone cannot order numbers; a cell without one
// sorts by its text, and an empty cell sorts last.
export type DataGridCell = {
  text: string;
  value?: number;
  bg?: string;
  fg?: string;
};

export type DataGridColumn = {
  id: string;
  label: string;
  groupId?: string;
};

export type DataGridColumnGroup = {
  id: string;
  label: string;
};

export type DataGridRow = {
  id: string;
  label: string;
};

export type DataGridSort = {
  // The row-header column sorts by row label under ROW_HEADER_COLUMN_ID.
  columnId: string;
  direction: "asc" | "desc";
};

export type DataGridHit = {
  rowId: string;
  columnId: string;
  cell: DataGridCell | undefined;
};

export type DataGridProps = {
  columns: DataGridColumn[];
  // Present: a first header row of group labels, each spanning its
  // contiguous columns. A column whose group is unknown spans alone.
  columnGroups?: DataGridColumnGroup[];
  rows: DataGridRow[];
  // cells[rowIndex][columnIndex], aligned with `rows` and `columns`.
  cells: (DataGridCell | undefined)[][];
  rowHeaderLabel?: string;
  defaultSort?: DataGridSort | null;
  onSortChange?: (sort: DataGridSort | null) => void;
  onCellHover?: (hit: DataGridHit | null) => void;
  onCellClick?: (hit: DataGridHit) => void;
  onRowClick?: (rowId: string) => void;
  // Fills the parent's height and scrolls inside it; otherwise grows.
  fitToAvailableHeight?: boolean;
};
