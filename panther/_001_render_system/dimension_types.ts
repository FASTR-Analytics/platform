// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BLANK_LABEL, BLANK_SENTINEL, t3 } from "./deps.ts";

export type DimensionMember = {
  id: string;
  label: string;
};

// A dimension: a column a figure splits by, named by its prop, with its
// members. A pane, tier, lane, series or indicator with no prop has none.
export type DataDimension = {
  name: string;
  members: DimensionMember[];
};

// Dimension names for data whose author named none: `--` marks a name panther
// supplies, as `--v` names the dimension of value columns.
export const MARKDOWN_TABLE_ROW_DIMENSION = "--row";
export const MARKDOWN_TABLE_COLUMN_DIMENSION = "--column";

// The members to lay out: a dimension's members, or one position with no
// member when no prop is given.
export function getDimensionMembers(
  dimension: DataDimension | undefined,
): (DimensionMember | undefined)[] {
  return dimension?.members ?? [undefined];
}

// Per-dimension membership policy for chart layout dimensions. "balanced" (the
// default) gives every pane the full global member set of that dimension;
// "unbalanced" lets each pane show only the members it has data for.
// Raggedness is allowed only along a chart's categorical (text-axis)
// direction — the value direction stays balanced.
export type DimensionMembership = "balanced" | "unbalanced";

export type MemberSortFunc = (a: DimensionMember, b: DimensionMember) => number;

export type MemberSortConfig =
  | MemberSortFunc
  | "by-label"
  | "by-id"
  | { byIdOrder: string[] }
  | { byLabelOrder: string[] }
  | { base?: "by-label" | "by-id"; first?: string[]; last?: string[] };

export function isBlankMember(h: DimensionMember): boolean {
  return h.id === BLANK_SENTINEL;
}

export function compareBlankLast(
  a: DimensionMember,
  b: DimensionMember,
): number {
  return Number(isBlankMember(a)) - Number(isBlankMember(b));
}

export function sortByLabel(a: DimensionMember, b: DimensionMember): number {
  return compareBlankLast(a, b) || a.label.localeCompare(b.label);
}

export function sortById(a: DimensionMember, b: DimensionMember): number {
  return compareBlankLast(a, b) || a.id.localeCompare(b.id);
}

export function sortByIdOrder(order: string[]): MemberSortFunc {
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

export function sortByLabelOrder(order: string[]): MemberSortFunc {
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
): MemberSortFunc {
  // No base: items outside the pinned buckets compare equal, so a stable sort
  // preserves their existing order — a pin-only sort.
  const baseFunc: MemberSortFunc = base === "by-id"
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
  config: MemberSortConfig | undefined,
): MemberSortFunc {
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

export function toDimensionMember(
  id: string | undefined,
  label: string | undefined,
): DimensionMember | undefined {
  return id === undefined ? undefined : { id, label: label ?? id };
}

export function createDimensionMember(
  id: string,
  labelReplacements: Record<string, string> | undefined,
): DimensionMember {
  return {
    id,
    label: labelReplacements?.[id] ??
      (id === BLANK_SENTINEL ? t3(BLANK_LABEL) : id),
  };
}

export function createDimensionMembers(
  ids: string[],
  labelReplacements: Record<string, string> | undefined,
): DimensionMember[] {
  return ids.map((id) => createDimensionMember(id, labelReplacements));
}

export function sortDimensionMembers(
  items: DimensionMember[],
  sortConfig: MemberSortConfig | undefined,
): DimensionMember[] {
  return [...items].sort(resolveSortFunc(sortConfig));
}
