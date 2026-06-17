// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ProcessedData,
  SortConfig,
  TableColumn,
  TableGroup,
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

export function sortData<T extends Record<string, any>>(
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

export function groupData<T extends Record<string, any>>(
  data: T[],
  group: TableGroup<T>,
  sortConfig: SortConfig | null,
  columns?: TableColumn<T>[],
): ProcessedData<T> {
  const grouped: Record<string, T[]> = {};
  const groupOrder: string[] = [];

  data.forEach((item) => {
    const groupKey = group.groupBy(item);
    if (!grouped[groupKey]) {
      grouped[groupKey] = [];
      groupOrder.push(groupKey);
    }
    grouped[groupKey].push(item);
  });

  // Sort within each group if needed
  if (sortConfig) {
    const column = columns?.find((c) => c.key === sortConfig.key);
    const getValue = column?.sortValue ?? ((item: T) => item[sortConfig.key]);

    Object.values(grouped).forEach((items) => {
      items.sort((a, b) => {
        const comparison = compareValues(getValue(a), getValue(b));
        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    });
  }

  return {
    isGrouped: true,
    groups: groupOrder.map((key) => ({
      key,
      label: group.label(grouped[key]),
      items: grouped[key],
    })),
    allItems: data,
  };
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

export function getPaddingClasses(
  paddingX: "compact" | "normal" | "comfortable",
  paddingY: "compact" | "normal" | "comfortable",
): { px: string; py: string } {
  const px = paddingX === "compact"
    ? "px-2"
    : paddingX === "comfortable"
    ? "px-6"
    : "px-4";
  const py = paddingY === "compact"
    ? "py-0.5"
    : paddingY === "comfortable"
    ? "py-3"
    : "py-1.5";
  return { px, py };
}
