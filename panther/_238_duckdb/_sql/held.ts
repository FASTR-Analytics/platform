// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { resolveDimension } from "../deps.ts";
import type { LongTableFilter, LongTableSchema } from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan } from "./plan.ts";
import { columnRef, filterPredicate } from "./predicates.ts";
import { quoteIdentifier } from "./quote.ts";

const HELD_CTE = "held";

// Which of a filter's values some row of the table holds, under no other
// filter: one row whose column `i` counts the cells value `i` selects. Each
// value is tested by the predicate a filter of that value alone emits, so the
// check folds exactly as the filter does (blank, case, set members). The
// values are tested over the distinct cells the whole filter selects, so each
// value's predicate runs once per distinct cell, not once per row.
export function buildHeldValuesPlan(
  schema: LongTableSchema,
  filter: LongTableFilter,
  viewSource: string,
): QueryPlan {
  const resolved = resolveDimension(schema, filter.dim);
  if (resolved?.kind !== "dimension") {
    throw new Error(`Filter "${filter.dim}" is not a declared dimension`);
  }
  const binds = new BindList();
  const literals = new LiteralList();
  const selected = filterPredicate(schema, filter, binds, literals);
  return {
    ctes: [{
      name: HELD_CTE,
      sql: `SELECT DISTINCT ${
        columnRef(resolved.dimension.column)
      } FROM ${viewSource} WHERE ${selected}`,
    }],
    source: quoteIdentifier(HELD_CTE),
    columns: filter.values.map((v, i) => ({
      alias: String(i),
      expr: `COUNT(*) FILTER (WHERE ${
        filterPredicate(
          schema,
          { dim: filter.dim, values: [v] },
          binds,
          literals,
        )
      })`,
    })),
    where: [],
    orderBy: [],
    binds,
    literals,
  };
}
