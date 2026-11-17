// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  LongTableFilter,
  LongTableRange,
  LongTableSchema,
} from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan } from "./plan.ts";
import { buildWhere, columnRef } from "./predicates.ts";
import { timeSource } from "./time.ts";

export function buildBoundsPlan(
  schema: LongTableSchema,
  timeColumn: string,
  filters: LongTableFilter[],
  ranges: LongTableRange[],
  source: string,
): QueryPlan {
  const binds = new BindList();
  const literals = new LiteralList();
  const ref = columnRef(timeColumn);
  return {
    ...timeSource(schema, filters.map((f) => f.dim), source),
    columns: [
      { alias: "min", expr: `MIN(${ref})` },
      { alias: "max", expr: `MAX(${ref})` },
    ],
    where: buildWhere(schema, filters, ranges, undefined, binds, literals),
    orderBy: [],
    binds,
    literals,
  };
}
