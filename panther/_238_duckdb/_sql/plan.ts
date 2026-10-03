// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DuckDBType } from "../deps.ts";
import { quoteLiteral } from "./quote.ts";

// A query's bound values in order: every value that came from a query is a
// `$n` placeholder typed before binding, never text in the SQL.
export class BindList {
  readonly values: (string | number)[] = [];
  readonly types: DuckDBType[] = [];

  add(value: string | number, type: DuckDBType): string {
    this.values.push(value);
    this.types.push(type);
    return `$${this.values.length}`;
  }
}

// The literals the emitter is allowed to contain: server-owned constants
// (sentinels, delimiters, the trim charset) registered here so the finished
// SQL can be checked to hold no other quote.
export class LiteralList {
  readonly quoted: string[] = [];

  add(value: string): string {
    const q = quoteLiteral(value);
    this.quoted.push(q);
    return q;
  }
}

export type SelectColumn = {
  alias: string;
  expr: string;
  // Present on a grouped column: the expression GROUP BY repeats verbatim
  // (grouping by an alias equal to a column name groups the raw column).
  groupExpr?: string;
};

// A second SELECT over the same source and WHERE, UNION ALL-ed under the main
// select: the roll-up branch, with its own columns and HAVING.
export type UnionBranch = { columns: SelectColumn[]; having: string[] };

export type QueryPlan = {
  ctes: { name: string; sql: string }[];
  source: string;
  columns: SelectColumn[];
  where: string[];
  // HAVING on the main select. An aggregate select with no GROUP BY returns
  // one row over no input, so an ungrouped read carries COUNT(*) > 0 and
  // "nothing matched" is no rows, as it is when grouped.
  having?: string[];
  union?: UnionBranch;
  // An outer select over the main select (and its union): the expression
  // wrapper. It re-projects inner aliases under output names and adds the
  // compiled expressions; ORDER BY and LIMIT then apply to it.
  wrap?: SelectColumn[];
  orderBy: string[];
  limit?: string;
  binds: BindList;
  literals: LiteralList;
};
