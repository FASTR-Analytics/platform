// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GridColumn, GridColumnGroup } from "../grid_types.ts";

export type GroupSpan = {
  groupId: string | undefined;
  label: string;
  span: number;
};

// Contiguous runs of one group id, in column order, so a group header spans
// exactly the columns beneath it. A column whose group is unknown spans alone
// with an empty label; adjacent unknowns do not merge.
export function computeGroupSpans(
  columns: GridColumn[],
  columnGroups: GridColumnGroup[],
): GroupSpan[] {
  const labelById = new Map(columnGroups.map((g) => [g.id, g.label]));
  const spans: GroupSpan[] = [];
  for (const column of columns) {
    const groupId = column.groupId !== undefined &&
        labelById.has(column.groupId)
      ? column.groupId
      : undefined;
    const last = spans.at(-1);
    if (groupId !== undefined && last?.groupId === groupId) {
      last.span += 1;
    } else {
      spans.push({
        groupId,
        label: groupId === undefined ? "" : labelById.get(groupId)!,
        span: 1,
      });
    }
  }
  return spans;
}
