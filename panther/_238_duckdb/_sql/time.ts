// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getDerivedDimensions, resolveDimension } from "../deps.ts";
import type { DerivedDimension, LongTableSchema } from "../deps.ts";
import { columnRef } from "./predicates.ts";
import { quoteIdentifier } from "./quote.ts";

export const TIME_CTE = "time";

// The derived time dimensions as integer arithmetic over the physical
// column. `//` truncates only on integer operands, which is why the time
// column must be declared integer. The fiscal quarter adds the months from
// the start month to the year's end as one constant, so no step is negative:
// DuckDB's `%` of a negative is negative, and on an unsigned column a
// subtraction below zero is an overflow.
export function derivedExpr(
  schema: LongTableSchema,
  derived: DerivedDimension,
): string {
  const time = schema.time;
  if (time === undefined) {
    throw new Error("Derived time dimensions need a time column");
  }
  const col = columnRef(time.column);
  if (time.grain === "year-quarter") {
    return derived.kind === "grain" ? `${col} // 10` : `${col} % 10`;
  }
  const y = `${col} // 100`;
  const m = `${col} % 100`;
  if (derived.kind === "component" && derived.component === "month") {
    return m;
  }
  const rule = time.fiscalYear;
  const quarter = rule === undefined
    ? `(${m} + 2) // 3`
    : `((${m} + ${12 - rule.startMonth}) % 12) // 3 + 1`;
  if (derived.kind === "component") {
    return quarter;
  }
  const e = rule?.namedBy === "end" ? 1 : 0;
  const year = rule === undefined
    ? y
    : `${y} + CASE WHEN ${m} >= ${rule.startMonth} THEN ${e} ELSE ${e - 1} END`;
  return derived.grain === "year" ? year : `(${year}) * 10 + ${quarter}`;
}

// The source a read selects from: the flat view, or a CTE over it that adds
// every derived dimension under its declared name when a referenced name is
// one. The CTE is emitted only when needed so a query on physical columns
// stays a plain select.
export function timeSource(
  schema: LongTableSchema,
  referenced: string[],
  source: string,
): { ctes: { name: string; sql: string }[]; source: string } {
  const needed = referenced.some(
    (name) => resolveDimension(schema, name)?.kind === "derived",
  );
  if (!needed) {
    return { ctes: [], source };
  }
  const derived = getDerivedDimensions(schema).map(
    (d) => `${derivedExpr(schema, d)} AS ${quoteIdentifier(d.name)}`,
  );
  return {
    ctes: [{
      name: TIME_CTE,
      sql: `SELECT *, ${derived.join(", ")} FROM ${source}`,
    }],
    source: quoteIdentifier(TIME_CTE),
  };
}
