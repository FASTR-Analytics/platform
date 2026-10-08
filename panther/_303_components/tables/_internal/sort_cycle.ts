// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// `current` is null when the table is unsorted or sorted by another column, so
// a click on a new column always starts it in its first direction.
export function getNextSortDirection(
  current: "asc" | "desc" | null,
  descFirst: boolean,
): "asc" | "desc" | null {
  const first = descFirst ? "desc" : "asc";
  if (current === null) return first;
  if (current !== first) return null;
  return first === "asc" ? "desc" : "asc";
}
