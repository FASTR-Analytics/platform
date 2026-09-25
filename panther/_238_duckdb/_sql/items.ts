// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BIGINT, getValueOutputName, resolveDimension } from "../deps.ts";
import type {
  LongTableQuery,
  LongTableSchema,
  LongTableValue,
  PeriodBounds,
} from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan, SelectColumn } from "./plan.ts";
import { buildWhere, columnRef, dimensionExpr } from "./predicates.ts";
import { quoteIdentifier } from "./quote.ts";

export function aggregateExpr(value: LongTableValue): string {
  if (value.column === "*") {
    return "COUNT(*)";
  }
  const ref = columnRef(value.column);
  if (value.func === "identity") {
    return ref;
  }
  return `${value.func}(${ref})`;
}

export function buildItemsPlan(
  schema: LongTableSchema,
  query: LongTableQuery,
  periodBounds: PeriodBounds | undefined,
  source: string,
  fetchLimit: number,
): QueryPlan {
  const binds = new BindList();
  const literals = new LiteralList();
  const columns: SelectColumn[] = [];
  for (const name of query.groupBy) {
    const resolved = resolveDimension(schema, name);
    if (resolved === undefined) {
      throw new Error(`groupBy "${name}" is not a dimension`);
    }
    const expr = dimensionExpr(resolved, literals);
    columns.push({ alias: name, expr, groupExpr: expr });
  }
  for (const value of query.values) {
    const expr = aggregateExpr(value);
    columns.push({
      alias: getValueOutputName(value),
      expr,
      // An identity value is grouped by, never aggregated.
      ...(value.func === "identity" ? { groupExpr: expr } : {}),
    });
  }
  const orderBy = columns.map((c) => `${quoteIdentifier(c.alias)} NULLS LAST`);
  return {
    ctes: [],
    source,
    columns,
    where: buildWhere(schema, query.filters, periodBounds, binds, literals),
    orderBy,
    limit: binds.add(fetchLimit, BIGINT),
    binds,
    literals,
  };
}
