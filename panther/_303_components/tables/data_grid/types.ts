// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GridColumn, GridColumnGroup, GridRow } from "../grid_types.ts";

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
  columns: GridColumn[];
  // Present: a first header row of group labels, each spanning its
  // contiguous columns. A column whose group is unknown spans alone.
  columnGroups?: GridColumnGroup[];
  rows: GridRow[];
  // cells[rowIndex][columnIndex], aligned with `rows` and `columns`.
  cells: (DataGridCell | undefined)[][];
  rowHeaderLabel?: string;
  defaultSort?: DataGridSort | null;
  onSortChange?: (sort: DataGridSort | null) => void;
  onCellHover?: (hit: DataGridHit | null) => void;
  onCellClick?: (hit: DataGridHit) => void;
  onRowClick?: (rowId: string) => void;
  // A known column is scrolled into view and its header marked; an unknown
  // id or null does nothing.
  focusColumnId?: string | null;
  // Caps the scroll box (e.g. "500px", "60vh") in place of the parent's
  // height, for a parent that gives none.
  maxHeight?: string;
};
