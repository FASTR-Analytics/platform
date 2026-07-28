// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Pure helpers: derive excluded row/col indices from liveDomainExcludeIds
// without needing rc or text measurement. The excluded id can sit on the
// item itself OR on its GROUP (when the excluded dimension is displayed as
// groups, every item in the group is the excluded dimension's data).
// buildExcludedRowIndices feeds the per-column live min/max for cell style
// funcs (measureTable + getMinComfortableWidth); both feed the perpendicular
// exclusion in header sampleN digests (resolve_headers.ts).

export function buildExcludedRowIndices(
  rowGroups: { id?: string; rows: { index: number; id?: string }[] }[],
  liveDomainExcludeIds: string[] | undefined,
): Set<number> {
  const result = new Set<number>();
  if (!liveDomainExcludeIds?.length) return result;
  for (const rowGroup of rowGroups) {
    if (
      rowGroup.id !== undefined && liveDomainExcludeIds.includes(rowGroup.id)
    ) {
      for (const row of rowGroup.rows) {
        result.add(row.index);
      }
    }
    for (const row of rowGroup.rows) {
      if (row.id !== undefined && liveDomainExcludeIds.includes(row.id)) {
        result.add(row.index);
      }
    }
  }
  return result;
}

export function buildExcludedColIndices(
  colGroups: { id?: string; cols: { index: number; id?: string }[] }[],
  liveDomainExcludeIds: string[] | undefined,
): Set<number> {
  const result = new Set<number>();
  if (!liveDomainExcludeIds?.length) return result;
  for (const colGroup of colGroups) {
    if (
      colGroup.id !== undefined && liveDomainExcludeIds.includes(colGroup.id)
    ) {
      for (const col of colGroup.cols) {
        result.add(col.index);
      }
    }
    for (const col of colGroup.cols) {
      if (col.id !== undefined && liveDomainExcludeIds.includes(col.id)) {
        result.add(col.index);
      }
    }
  }
  return result;
}
