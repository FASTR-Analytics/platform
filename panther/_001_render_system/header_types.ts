// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type HeaderItem = {
  id: string;
  label: string;
};

export type HeaderSortFunc = (a: HeaderItem, b: HeaderItem) => number;

export type HeaderSortConfig =
  | HeaderSortFunc
  | "by-label"
  | "by-id"
  | { byIdOrder: string[] }
  | { byLabelOrder: string[] };

export function sortByLabel(a: HeaderItem, b: HeaderItem): number {
  return a.label.localeCompare(b.label);
}

export function sortById(a: HeaderItem, b: HeaderItem): number {
  return a.id.localeCompare(b.id);
}

export function sortByIdOrder(order: string[]): HeaderSortFunc {
  const rank = new Map(order.map((id, i) => [id, i]));
  return (a, b) => {
    const ai = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bi = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) {
      return ai - bi;
    }
    return a.label.localeCompare(b.label);
  };
}

export function sortByLabelOrder(order: string[]): HeaderSortFunc {
  const rank = new Map(order.map((label, i) => [label, i]));
  return (a, b) => {
    const ai = rank.get(a.label) ?? Number.POSITIVE_INFINITY;
    const bi = rank.get(b.label) ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) {
      return ai - bi;
    }
    return a.label.localeCompare(b.label);
  };
}

export function resolveSortFunc(
  config: HeaderSortConfig | undefined,
): HeaderSortFunc | undefined {
  if (config === undefined) {
    return undefined;
  }
  if (typeof config === "function") {
    return config;
  }
  if (config === "by-label") {
    return sortByLabel;
  }
  if (config === "by-id") {
    return sortById;
  }
  if ("byIdOrder" in config) {
    return sortByIdOrder(config.byIdOrder);
  }
  if ("byLabelOrder" in config) {
    return sortByLabelOrder(config.byLabelOrder);
  }
  throw new Error("Invalid sort config");
}

export function toHeaderItem(
  id: string | undefined,
  label: string | undefined,
): HeaderItem | undefined {
  return id === undefined ? undefined : { id, label: label ?? id };
}

export function createHeaderItems(
  ids: string[],
  labelReplacements: Record<string, string> | undefined,
): HeaderItem[] {
  return ids.map((id) => ({
    id,
    label: labelReplacements?.[id] ?? id,
  }));
}

export function sortHeaderItems(
  items: HeaderItem[],
  sortConfig: HeaderSortConfig | undefined,
): HeaderItem[] {
  const fn = resolveSortFunc(sortConfig);
  if (!fn) {
    return items;
  }
  return [...items].sort(fn);
}
