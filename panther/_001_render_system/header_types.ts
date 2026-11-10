// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BLANK_LABEL, BLANK_SENTINEL, t3 } from "./deps.ts";

export type HeaderItem = {
  id: string;
  label: string;
};

// A slot's dimension, named, with its members. A slot with no dimension
// configured has no axis.
export type DataAxis = {
  dimension: string;
  headers: HeaderItem[];
};

// Dimension names for data whose author named none: `--` marks a name panther
// supplies, as `--v` names the axis of value columns.
export const MARKDOWN_TABLE_ROW_DIMENSION = "--row";
export const MARKDOWN_TABLE_COLUMN_DIMENSION = "--column";

// The members a slot lays out: an unsplit slot (no axis) is one member with no
// header.
export function slotHeaders(
  axis: DataAxis | undefined,
): (HeaderItem | undefined)[] {
  return axis?.headers ?? [undefined];
}

// Per-axis membership policy for chart layout dimensions. "balanced" (the
// default) gives every pane the full global header set on that axis;
// "unbalanced" lets each pane show only the headers it has data for.
// Raggedness is allowed only along a chart's categorical (text-axis)
// direction — the scale direction stays balanced.
export type AxisMembership = "balanced" | "unbalanced";

export type HeaderSortFunc = (a: HeaderItem, b: HeaderItem) => number;

export type HeaderSortConfig =
  | HeaderSortFunc
  | "by-label"
  | "by-id"
  | { byIdOrder: string[] }
  | { byLabelOrder: string[] }
  | { base?: "by-label" | "by-id"; first?: string[]; last?: string[] };

export function isBlankHeader(h: HeaderItem): boolean {
  return h.id === BLANK_SENTINEL;
}

export function compareBlankLast(a: HeaderItem, b: HeaderItem): number {
  return Number(isBlankHeader(a)) - Number(isBlankHeader(b));
}

export function sortByLabel(a: HeaderItem, b: HeaderItem): number {
  return compareBlankLast(a, b) || a.label.localeCompare(b.label);
}

export function sortById(a: HeaderItem, b: HeaderItem): number {
  return compareBlankLast(a, b) || a.id.localeCompare(b.id);
}

export function sortByIdOrder(order: string[]): HeaderSortFunc {
  const rank = new Map(order.map((id, i) => [id, i]));
  return (a, b) => {
    const ai = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bi = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) {
      return ai - bi;
    }
    return compareBlankLast(a, b) || a.label.localeCompare(b.label);
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
    return compareBlankLast(a, b) || a.label.localeCompare(b.label);
  };
}

export function sortByPinned(
  base: "by-label" | "by-id" | undefined,
  first: string[],
  last: string[],
): HeaderSortFunc {
  // No base: items outside the pinned buckets compare equal, so a stable sort
  // preserves their existing order — a pin-only sort.
  const baseFunc: HeaderSortFunc = base === "by-id"
    ? sortById
    : base === "by-label"
    ? sortByLabel
    : () => 0;
  const firstRank = new Map(first.map((id, i) => [id, i]));
  const lastRank = new Map(last.map((id, i) => [id, i]));
  const bucket = (id: string): number =>
    firstRank.has(id)
      ? 0
      : lastRank.has(id)
      ? 3
      : id === BLANK_SENTINEL
      ? 2
      : 1;
  return (a, b) => {
    const ab = bucket(a.id);
    const bb = bucket(b.id);
    if (ab !== bb) {
      return ab - bb;
    }
    if (ab === 0) {
      return firstRank.get(a.id)! - firstRank.get(b.id)!;
    }
    if (ab === 3) {
      return lastRank.get(a.id)! - lastRank.get(b.id)!;
    }
    return baseFunc(a, b);
  };
}

function resolveSortFunc(
  config: HeaderSortConfig | undefined,
): HeaderSortFunc {
  if (config === undefined) {
    return compareBlankLast;
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
  if ("base" in config || "first" in config || "last" in config) {
    return sortByPinned(config.base, config.first ?? [], config.last ?? []);
  }
  throw new Error("Invalid sort config");
}

export function toHeaderItem(
  id: string | undefined,
  label: string | undefined,
): HeaderItem | undefined {
  return id === undefined ? undefined : { id, label: label ?? id };
}

export function createHeaderItem(
  id: string,
  labelReplacements: Record<string, string> | undefined,
): HeaderItem {
  return {
    id,
    label: labelReplacements?.[id] ??
      (id === BLANK_SENTINEL ? t3(BLANK_LABEL) : id),
  };
}

export function createHeaderItems(
  ids: string[],
  labelReplacements: Record<string, string> | undefined,
): HeaderItem[] {
  return ids.map((id) => createHeaderItem(id, labelReplacements));
}

export function sortHeaderItems(
  items: HeaderItem[],
  sortConfig: HeaderSortConfig | undefined,
): HeaderItem[] {
  return [...items].sort(resolveSortFunc(sortConfig));
}
