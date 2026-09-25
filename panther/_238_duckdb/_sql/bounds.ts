// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LongTableFilter, LongTableSchema } from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan } from "./plan.ts";
import { buildWhere, columnRef } from "./predicates.ts";

export function buildBoundsPlan(
  schema: LongTableSchema,
  timeColumn: string,
  filters: LongTableFilter[],
  source: string,
): QueryPlan {
  const binds = new BindList();
  const literals = new LiteralList();
  const ref = columnRef(timeColumn);
  return {
    ctes: [],
    source,
    columns: [
      { alias: "min", expr: `MIN(${ref})` },
      { alias: "max", expr: `MAX(${ref})` },
    ],
    where: buildWhere(schema, filters, undefined, binds, literals),
    orderBy: [],
    binds,
    literals,
  };
}
