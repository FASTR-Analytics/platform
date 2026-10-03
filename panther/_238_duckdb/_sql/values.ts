// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BIGINT, BLANK_CHARACTERS } from "../deps.ts";
import type {
  LongTableFilter,
  LongTableRange,
  LongTableSchema,
  PeriodBounds,
  ResolvedDimension,
} from "../deps.ts";
import { BindList, LiteralList } from "./plan.ts";
import type { QueryPlan, SelectColumn } from "./plan.ts";
import { buildWhere, dimensionExpr, setMembersExpr } from "./predicates.ts";
import { quoteIdentifier } from "./quote.ts";
import { timeSource } from "./time.ts";

export const OPTION_ALIAS = "v";

// The distinct values of one dimension under the shared WHERE. A set
// dimension is unnested to its members, with empty and whitespace-only
// members dropped in SQL so they never consume the limit.
export function buildValuesPlan(
  schema: LongTableSchema,
  resolved: ResolvedDimension,
  filters: LongTableFilter[],
  ranges: LongTableRange[],
  periodBounds: PeriodBounds | undefined,
  viewSource: string,
  limit: number,
): QueryPlan {
  const binds = new BindList();
  const literals = new LiteralList();
  const where = buildWhere(
    schema,
    filters,
    ranges,
    periodBounds,
    binds,
    literals,
  );
  const v = quoteIdentifier(OPTION_ALIAS);
  const { ctes, source } = timeSource(
    schema,
    [
      ...filters.map((f) => f.dim),
      ...(resolved.kind === "derived" ? [resolved.derived.name] : []),
    ],
    viewSource,
  );
  if (resolved.kind === "dimension" && resolved.dimension.kind === "set") {
    const inner = [
      `SELECT unnest(${setMembersExpr(resolved.dimension, literals)}) AS ${v}`,
      `FROM ${source}`,
      where.length === 0
        ? ""
        : `WHERE ${where.map((p) => `(${p})`).join(" AND ")}`,
    ].filter((s) => s.length > 0).join(" ");
    return {
      ctes: [...ctes, { name: "members", sql: inner }],
      source: quoteIdentifier("members"),
      columns: [
        distinctColumn(
          resolved.dimension.caseInsensitive === true
            ? { expr: `MIN(${v})`, groupExpr: `UPPER(${v})` }
            : { expr: v, groupExpr: v },
        ),
      ],
      where: [
        `trim(${v}, ${literals.add(BLANK_CHARACTERS)}) <> ${literals.add("")}`,
      ],
      orderBy: [v],
      limit: binds.add(limit, BIGINT),
      binds,
      literals,
    };
  }
  return {
    ctes,
    source,
    columns: [distinctColumn(dimensionExpr(resolved, literals))],
    where,
    orderBy: [v],
    limit: binds.add(limit, BIGINT),
    binds,
    literals,
  };
}

// One row per distinct value: grouped, so a caseInsensitive dimension's
// aggregate over its case variants and a plain column read the same way.
function distinctColumn(
  dimension: { expr: string; groupExpr: string },
): SelectColumn {
  return { alias: OPTION_ALIAS, ...dimension };
}
