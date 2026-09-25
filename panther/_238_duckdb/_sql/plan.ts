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

export type QueryPlan = {
  ctes: { name: string; sql: string }[];
  source: string;
  columns: SelectColumn[];
  where: string[];
  orderBy: string[];
  limit?: string;
  binds: BindList;
  literals: LiteralList;
};
