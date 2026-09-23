// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GridColumn, GridColumnGroup, GridRow } from "../grid_types.ts";

export type PresenceGridProps = {
  columns: GridColumn[];
  // Present: one header row of group labels and no per-column labels.
  // Absent: one header row of column labels.
  columnGroups?: GridColumnGroup[];
  rows: GridRow[];
  // cells[rowIndex][columnIndex]: true where the row has presence in the
  // column.
  cells: boolean[][];
  // "fixed": a 16px swatch per cell (dense, many columns).
  // "stretch": the swatch fills its column (few columns).
  cellWidth: "fixed" | "stretch";
  // Caps the scroll box (e.g. "500px", "60vh") in place of the parent's
  // height, for a parent that gives none.
  maxHeight?: string;
};
