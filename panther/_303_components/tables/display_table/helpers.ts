// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnyRow,
  FilterConfig,
  SortConfig,
  TableColumn,
  TablePadding,
} from "./types.ts";

export function compareValues(a: unknown, b: unknown): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;

  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  }

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  return String(a).localeCompare(String(b));
}

export function sortData<T extends AnyRow>(
  data: T[],
  sortConfig: SortConfig | null,
  columns?: TableColumn<T>[],
): T[] {
  if (!sortConfig) return data;

  const column = columns?.find((c) => c.key === sortConfig.key);
  const getValue = column?.sortValue ?? ((item: T) => item[sortConfig.key]);

  const sorted = [...data];
  sorted.sort((a, b) => {
    const comparison = compareValues(getValue(a), getValue(b));
    return sortConfig.direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

export function getFilterValues<T extends AnyRow>(
  item: T,
  column: TableColumn<T>,
): string[] {
  const value = column.filterValue?.(item) ?? String(item[column.key] ?? "");
  if (typeof value === "string") return [value];
  return value.length > 0 ? value : [""];
}

export function distinctFilterValues<T extends AnyRow>(
  data: T[],
  column: TableColumn<T>,
): string[] {
  const values = new Set<string>();
  for (const item of data) {
    for (const value of getFilterValues(item, column)) {
      values.add(value);
    }
  }
  return [...values].sort(compareValues);
}

export function filterData<T extends AnyRow>(
  data: T[],
  filters: FilterConfig,
  columns: TableColumn<T>[],
): T[] {
  const active = columns.flatMap((column) => {
    const excluded = filters.get(column.key);
    return column.filterable && excluded && excluded.size > 0
      ? [{ column, excluded }]
      : [];
  });
  if (active.length === 0) return data;
  return data.filter((item) =>
    active.every(({ column, excluded }) =>
      getFilterValues(item, column).some((value) => !excluded.has(value))
    )
  );
}

export function getColumnSearchValue<T extends AnyRow>(
  item: T,
  column: TableColumn<T>,
): string {
  return column.searchValue?.(item) ??
    getFilterValues(item, column).join(" ");
}

// The fold and the matcher (foldString and matchesSearch in _000_utils) are
// parameters rather than imports: this module's deps.ts loads _301, whose
// router cannot be evaluated under `deno test`, and these functions' tests are
// the table search's only check.
export function buildSearchHaystacks<T extends AnyRow>(
  data: T[],
  columns: TableColumn<T>[],
  rowSearchValue: ((item: T) => string) | undefined,
  fold: (s: string) => string,
): string[] {
  if (rowSearchValue) {
    return data.map((item) => fold(rowSearchValue(item)));
  }
  const searched = columns.filter((column) => column.searchable !== false);
  return data.map((item) =>
    fold(searched.map((column) => getColumnSearchValue(item, column)).join(" "))
  );
}

export function searchData<T>(
  data: T[],
  haystacks: string[],
  tokens: string[],
  matches: (foldedHaystack: string, tokens: string[]) => boolean,
): T[] {
  if (tokens.length === 0) return data;
  return data.filter((_, i) => matches(haystacks[i], tokens));
}

export function getCellAlignment(alignH?: string): string {
  switch (alignH) {
    case "center":
      return "text-center";
    case "right":
      return "text-right";
    default:
      return "text-left";
  }
}

// Whole class names, not a template over the enum: Tailwind only emits a
// utility whose name it can read in the source.
const TABLE_PAD_X: Record<TablePadding, string> = {
  compact: "ui-tablepad-x-compact",
  normal: "ui-tablepad-x-normal",
  comfortable: "ui-tablepad-x-comfortable",
};

const TABLE_PAD_Y: Record<TablePadding, string> = {
  compact: "ui-tablepad-y-compact",
  normal: "ui-tablepad-y-normal",
  comfortable: "ui-tablepad-y-comfortable",
};

export function getPaddingClasses(
  paddingX: TablePadding,
  paddingY: TablePadding,
): { px: string; py: string } {
  return { px: TABLE_PAD_X[paddingX], py: TABLE_PAD_Y[paddingY] };
}
