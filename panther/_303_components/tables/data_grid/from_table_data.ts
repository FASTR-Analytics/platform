// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { TableDataTransformed } from "../../deps.ts";
import type {
  DataGridCell,
  DataGridColumn,
  DataGridColumnGroup,
  DataGridProps,
  DataGridRow,
} from "./types.ts";

// A cell's position in the pivot, by the pivot's own ids: the caller's
// formatting and colouring may depend on any axis (a column's group is the
// indicator when columns are periods).
export type DataGridCellPosition = {
  rowId: string | undefined;
  rowGroupId: string | undefined;
  colId: string | undefined;
  colGroupId: string | undefined;
};

export type DataGridCellFunction = (
  value: string | number | undefined,
  position: DataGridCellPosition,
) => DataGridCell | undefined;

// The pivot's placeholder for a combination with no value.
const MISSING = ".";
const ID_SEPARATOR = "::";

function headerId(
  id: string | undefined,
  label: string | undefined,
  index: number,
): string {
  return id ?? label ?? String(index);
}

// Item ids repeat across groups (the same period under every indicator), and
// the grid needs one id per column and row.
function qualifiedId(groupId: string | undefined, itemId: string): string {
  return groupId === undefined ? itemId : `${groupId}${ID_SEPARATOR}${itemId}`;
}

// The canvas table's pivot as DataGrid props: column groups become
// `columnGroups` (omitted when the pivot has none), row groups are flattened
// with the group label prefixing each row label, and every cell goes through
// `cell`.
export function dataGridPropsFromTableData(
  data: TableDataTransformed,
  cell: DataGridCellFunction,
): Pick<DataGridProps, "columns" | "columnGroups" | "rows" | "cells"> {
  const hasColGroups = data.colGroups.some((g) => g.id !== undefined);
  const hasRowGroups = data.rowGroups.some((g) => g.id !== undefined);

  const columnGroups: DataGridColumnGroup[] = data.colGroups.map((g, i) => ({
    id: headerId(g.id, g.label, i),
    label: g.label ?? "",
  }));

  const columnEntries = data.colGroups.flatMap((g, gi) =>
    g.cols.map((c) => {
      const groupId = hasColGroups ? columnGroups[gi].id : undefined;
      const column: DataGridColumn = {
        id: qualifiedId(groupId, headerId(c.id, c.label, c.index)),
        label: c.label ?? "",
        ...(groupId === undefined ? {} : { groupId }),
      };
      return { column, index: c.index, colId: c.id, colGroupId: g.id };
    })
  );

  const rowEntries = data.rowGroups.flatMap((g, gi) =>
    g.rows.map((r) => {
      const groupId = hasRowGroups ? headerId(g.id, g.label, gi) : undefined;
      const label = r.label ?? "";
      const row: DataGridRow = {
        id: qualifiedId(groupId, headerId(r.id, r.label, r.index)),
        label: hasRowGroups && g.label ? `${g.label} · ${label}` : label,
      };
      return { row, index: r.index, rowId: r.id, rowGroupId: g.id };
    })
  );

  const cells = rowEntries.map((r) =>
    columnEntries.map((c) => {
      const raw = data.aoa[r.index]?.[c.index];
      return cell(raw === undefined || raw === MISSING ? undefined : raw, {
        rowId: r.rowId,
        rowGroupId: r.rowGroupId,
        colId: c.colId,
        colGroupId: c.colGroupId,
      });
    })
  );

  return {
    columns: columnEntries.map((c) => c.column),
    columnGroups: hasColGroups ? columnGroups : undefined,
    rows: rowEntries.map((r) => r.row),
    cells,
  };
}
