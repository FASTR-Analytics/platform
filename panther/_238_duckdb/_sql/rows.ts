// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BIGINT } from "../deps.ts";
import type {
  LongTableFilter,
  LongTableRange,
  LongTableSchema,
  PeriodBounds,
} from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan } from "./plan.ts";
import { buildWhere, columnRef } from "./predicates.ts";
import { timeSource } from "./time.ts";

// Raw rows under the shared WHERE: every schema column as stored, never
// folded, in file order. The caller sees a sample, not a sequence, so there
// is no ORDER BY.
export function buildRowsPlan(
  schema: LongTableSchema,
  filters: LongTableFilter[],
  ranges: LongTableRange[],
  periodBounds: PeriodBounds | undefined,
  source: string,
  limit: number,
): QueryPlan {
  const binds = new BindList();
  const literals = new LiteralList();
  return {
    ...timeSource(schema, filters.map((f) => f.dim), source),
    columns: schema.columns.map((c) => ({
      alias: c.name,
      expr: columnRef(c.name),
    })),
    where: buildWhere(schema, filters, ranges, periodBounds, binds, literals),
    orderBy: [],
    limit: binds.add(limit, BIGINT),
    binds,
    literals,
  };
}
