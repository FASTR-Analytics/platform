// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type WhereFilter = Record<string, (string | number)[]>;

export type WherePredicate<T> = (row: T[], i: number) => boolean;

export type AggregateFunction = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";

export type OrderDirection = "asc" | "desc";
