// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { assertSqlShape } from "./guard.ts";
import type { QueryPlan, SelectColumn } from "./plan.ts";
import { quoteIdentifier } from "./quote.ts";

const INNER_ALIAS = "inner";

// The one place query SQL is assembled. Assembly is data in the plan; this
// file only joins it, then checks the finished text's shape.
export function emitQuery(plan: QueryPlan): string {
  const parts: string[] = [];
  if (plan.ctes.length > 0) {
    parts.push(
      `WITH ${
        plan.ctes.map((c) => `${quoteIdentifier(c.name)} AS (${c.sql})`).join(
          ", ",
        )
      }`,
    );
  }
  const inner = [emitBranch(plan, plan.columns, plan.having ?? [])];
  if (plan.union !== undefined) {
    assertSameAliases(plan.columns, plan.union.columns);
    inner.push(
      "UNION ALL",
      emitBranch(plan, plan.union.columns, plan.union.having),
    );
  }
  parts.push(
    plan.wrap === undefined
      ? inner.join(" ")
      : `SELECT ${emitSelect(plan.wrap)} FROM (${inner.join(" ")}) AS ${
        quoteIdentifier(INNER_ALIAS)
      }`,
  );
  if (plan.orderBy.length > 0) {
    parts.push(`ORDER BY ${plan.orderBy.join(", ")}`);
  }
  if (plan.limit !== undefined) {
    parts.push(`LIMIT ${plan.limit}`);
  }
  const sql = parts.join(" ");
  assertSqlShape(sql, plan.literals.quoted);
  return sql;
}

function emitBranch(
  plan: QueryPlan,
  columns: SelectColumn[],
  having: string[],
): string {
  const parts = [`SELECT ${emitSelect(columns)} FROM ${plan.source}`];
  if (plan.where.length > 0) {
    parts.push(`WHERE ${plan.where.map((p) => `(${p})`).join(" AND ")}`);
  }
  const groupBy = columns.flatMap((c) =>
    c.groupExpr === undefined ? [] : [c.groupExpr]
  );
  if (groupBy.length > 0) {
    parts.push(`GROUP BY ${groupBy.join(", ")}`);
  }
  if (having.length > 0) {
    parts.push(`HAVING ${having.map((p) => `(${p})`).join(" AND ")}`);
  }
  return parts.join(" ");
}

function emitSelect(columns: SelectColumn[]): string {
  return columns
    .map((c) => `${c.expr} AS ${quoteIdentifier(c.alias)}`)
    .join(", ");
}

// UNION ALL is positional, so a branch whose columns differ in order or name
// would mix columns silently.
function assertSameAliases(main: SelectColumn[], union: SelectColumn[]): void {
  const same = main.length === union.length &&
    main.every((c, i) => c.alias === union[i].alias);
  if (!same) {
    throw new Error("Union branch columns differ from the main select");
  }
}
