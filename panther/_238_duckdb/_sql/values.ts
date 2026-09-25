// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BIGINT, resolveDimension } from "../deps.ts";
import type {
  LongTableFilter,
  LongTableSchema,
  PeriodBounds,
  ResolvedDimension,
} from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan } from "./plan.ts";
import {
  buildWhere,
  dimensionExpr,
  setMembersExpr,
  TRIM_CHARSET,
} from "./predicates.ts";
import { quoteIdentifier } from "./quote.ts";

export const OPTION_ALIAS = "v";

// The distinct values of one dimension under the shared WHERE. A set
// dimension is unnested to its members, with empty and whitespace-only
// members dropped in SQL so they never consume the limit.
export function buildValuesPlan(
  schema: LongTableSchema,
  resolved: ResolvedDimension,
  filters: LongTableFilter[],
  periodBounds: PeriodBounds | undefined,
  source: string,
  limit: number,
): QueryPlan {
  const binds = new BindList();
  const literals = new LiteralList();
  const where = buildWhere(schema, filters, periodBounds, binds, literals);
  const v = quoteIdentifier(OPTION_ALIAS);
  if (resolved.kind === "dimension" && resolved.dimension.kind === "set") {
    const inner = [
      `SELECT unnest(${
        setMembersExpr(resolved.dimension, literals, false)
      }) AS ${v}`,
      `FROM ${source}`,
      where.length === 0
        ? ""
        : `WHERE ${where.map((p) => `(${p})`).join(" AND ")}`,
    ].filter((s) => s.length > 0).join(" ");
    return {
      ctes: [{ name: "members", sql: inner }],
      source: quoteIdentifier("members"),
      columns: [{ alias: OPTION_ALIAS, expr: `DISTINCT ${v}` }],
      where: [
        `trim(${v}, ${literals.add(TRIM_CHARSET)}) <> ${literals.add("")}`,
      ],
      orderBy: [v],
      limit: binds.add(limit, BIGINT),
      binds,
      literals,
    };
  }
  return {
    ctes: [],
    source,
    columns: [{
      alias: OPTION_ALIAS,
      expr: `DISTINCT ${dimensionExpr(resolved, literals)}`,
    }],
    where,
    orderBy: [v],
    limit: binds.add(limit, BIGINT),
    binds,
    literals,
  };
}

export function resolveOptionDimension(
  schema: LongTableSchema,
  dim: string,
): ResolvedDimension | undefined {
  return resolveDimension(schema, dim);
}
