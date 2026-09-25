// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { QueryPlan } from "./plan.ts";
import { quoteIdentifier } from "./quote.ts";

// The one place query SQL is assembled. Assembly is data in the plan; this
// file only joins it, then checks that the only quotes in the text are the
// registered literals'.
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
  parts.push(`SELECT ${emitSelect(plan)} FROM ${plan.source}`);
  if (plan.where.length > 0) {
    parts.push(`WHERE ${plan.where.map((p) => `(${p})`).join(" AND ")}`);
  }
  const groupBy = plan.columns.flatMap((c) =>
    c.groupExpr === undefined ? [] : [c.groupExpr]
  );
  if (groupBy.length > 0) {
    parts.push(`GROUP BY ${groupBy.join(", ")}`);
  }
  if (plan.orderBy.length > 0) {
    parts.push(`ORDER BY ${plan.orderBy.join(", ")}`);
  }
  if (plan.limit !== undefined) {
    parts.push(`LIMIT ${plan.limit}`);
  }
  const sql = parts.join(" ");
  assertOnlyRegisteredLiterals(sql, plan);
  return sql;
}

export function emitSelect(plan: QueryPlan): string {
  return plan.columns
    .map((c) => `${c.expr} AS ${quoteIdentifier(c.alias)}`)
    .join(", ");
}

function assertOnlyRegisteredLiterals(sql: string, plan: QueryPlan): void {
  // Longest first, so a literal that contains a doubled quote is removed
  // before the empty literal could split it.
  const registered = [...new Set(plan.literals.quoted)].sort(
    (a, b) => b.length - a.length,
  );
  let rest = sql;
  for (const literal of registered) {
    rest = rest.replaceAll(literal, "");
  }
  if (rest.includes("'")) {
    throw new Error(
      "Emitted SQL holds a quote outside the registered literals",
    );
  }
}
