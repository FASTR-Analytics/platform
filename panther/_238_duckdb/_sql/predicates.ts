// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BIGINT,
  BLANK_CHARACTERS,
  BLANK_SENTINEL,
  coerceFilterValue,
  DEFAULT_SET_DELIMITER,
  DOUBLE,
  getColumnType,
  getFilterBindType,
  VARCHAR,
} from "../deps.ts";
import type {
  LongTableDimension,
  LongTableFilter,
  LongTableRange,
  LongTableSchema,
  PeriodBounds,
  ResolvedDimension,
} from "../deps.ts";
import { resolveDimension } from "../deps.ts";
import type { BindList, LiteralList } from "./plan.ts";
import { quoteIdentifier } from "./quote.ts";

export function columnRef(name: string): string {
  return quoteIdentifier(name);
}

export function blankPredicate(ref: string, literals: LiteralList): string {
  return `${ref} IS NULL OR trim(${ref}, ${literals.add(BLANK_CHARACTERS)}) = ${
    literals.add("")
  }`;
}

// The folded form of a text category: NULL and blank cells become the blank
// sentinel; every other cell is returned untrimmed.
export function foldedRef(ref: string, literals: LiteralList): string {
  return `CASE WHEN ${blankPredicate(ref, literals)} THEN ${
    literals.add(BLANK_SENTINEL)
  } ELSE ${ref} END`;
}

function isCaseInsensitive(resolved: ResolvedDimension): boolean {
  return resolved.kind === "dimension" &&
    resolved.dimension.caseInsensitive === true;
}

// What a dimension is selected as and grouped by. A caseInsensitive
// dimension groups by the upper-cased cell and returns the smallest stored
// spelling, so the value is an id that exists in the data. The spelling is
// taken over every row of that value, not over one output group: grouped
// with a second dimension, "Kigali" in one group and "KIGALI" in another
// would otherwise come back as two ids for one value.
export function dimensionExpr(
  resolved: ResolvedDimension,
  literals: LiteralList,
): { expr: string; groupExpr: string } {
  const ref = dimensionRawRef(resolved);
  if (resolved.kind !== "dimension" || resolved.type !== "text") {
    return { expr: ref, groupExpr: ref };
  }
  const folded = foldedRef(ref, literals);
  return isCaseInsensitive(resolved)
    ? {
      expr: `MIN(MIN(${folded})) OVER (PARTITION BY UPPER(${folded}))`,
      groupExpr: `UPPER(${folded})`,
    }
    : { expr: folded, groupExpr: folded };
}

export function filterPredicate(
  schema: LongTableSchema,
  filter: LongTableFilter,
  binds: BindList,
  literals: LiteralList,
): string {
  const resolved = resolveDimension(schema, filter.dim);
  if (resolved === undefined) {
    throw new Error(`Filter "${filter.dim}" is not a dimension`);
  }
  if (resolved.kind === "dimension" && resolved.dimension.kind === "set") {
    return setPredicate(resolved.dimension, filter, binds, literals);
  }
  const type = getFilterBindType(resolved);
  const duckType = type === "text"
    ? VARCHAR
    : type === "integer"
    ? BIGINT
    : DOUBLE;
  const ref = dimensionRawRef(resolved);
  const fold = isCaseInsensitive(resolved)
    ? (sql: string) => `UPPER(${sql})`
    : (sql: string) => sql;
  const placeholders = filter.values
    .filter((v) => v !== BLANK_SENTINEL)
    .map((v) => {
      const bound = coerceFilterValue(v, resolved, schema.time);
      if (bound === undefined) {
        throw new Error(`Filter "${filter.dim}" holds an untyped value`);
      }
      return fold(binds.add(bound, duckType));
    });
  const parts: string[] = [];
  if (placeholders.length > 0) {
    parts.push(`${fold(ref)} IN (${placeholders.join(", ")})`);
  }
  // The blank sentinel selects the blank cells of any dimension: the folded
  // blank of a text column, NULL everywhere else.
  if (filter.values.includes(BLANK_SENTINEL)) {
    parts.push(
      type === "text" ? blankPredicate(ref, literals) : `${ref} IS NULL`,
    );
  }
  return parts.map((p) => `(${p})`).join(" OR ");
}

function dimensionRawRef(resolved: ResolvedDimension): string {
  if (resolved.kind === "dimension") {
    return columnRef(resolved.dimension.column);
  }
  if (resolved.kind === "time") {
    return columnRef(resolved.column);
  }
  return columnRef(resolved.derived.name);
}

// The members of a set cell, as stored.
export function setMembersExpr(
  dimension: LongTableDimension,
  literals: LiteralList,
): string {
  return `string_split(${columnRef(dimension.column)}, ${
    literals.add(dimension.delimiter ?? DEFAULT_SET_DELIMITER)
  })`;
}

function setPredicate(
  dimension: LongTableDimension,
  filter: LongTableFilter,
  binds: BindList,
  literals: LiteralList,
): string {
  const members = setMembersExpr(dimension, literals);
  const placeholders = filter.values.map((v) => binds.add(String(v), VARCHAR));
  return dimension.caseInsensitive === true
    ? `list_has_any(list_transform(${members}, x -> UPPER(x)), [${
      placeholders.map((p) => `UPPER(${p})`).join(", ")
    }])`
    : `list_has_any(${members}, [${placeholders.join(", ")}])`;
}

export function periodPredicate(
  column: string,
  bounds: PeriodBounds,
  binds: BindList,
): string {
  const ref = columnRef(column);
  return `${ref} >= ${binds.add(bounds.min, BIGINT)} AND ${ref} <= ${
    binds.add(bounds.max, BIGINT)
  }`;
}

// A row-level bound on a numeric column; a NULL cell fails it, as in SQL.
// A whole bound on an integer column binds as an integer: a DOUBLE bind would
// compare past 2^53 by the nearest double.
export function rangePredicate(
  schema: LongTableSchema,
  range: LongTableRange,
  binds: BindList,
): string {
  const ref = columnRef(range.column);
  const integer = getColumnType(schema, range.column) === "integer";
  const bind = (bound: number) =>
    binds.add(bound, integer && Number.isSafeInteger(bound) ? BIGINT : DOUBLE);
  const parts: string[] = [];
  if (range.min !== undefined) {
    parts.push(`${ref} >= ${bind(range.min)}`);
  }
  if (range.max !== undefined) {
    parts.push(`${ref} <= ${bind(range.max)}`);
  }
  return parts.join(" AND ");
}

// The WHERE every read shares: category, set, range and period predicates.
export function buildWhere(
  schema: LongTableSchema,
  filters: LongTableFilter[],
  ranges: LongTableRange[],
  periodBounds: PeriodBounds | undefined,
  binds: BindList,
  literals: LiteralList,
): string[] {
  const where = filters.map((f) => filterPredicate(schema, f, binds, literals));
  for (const range of ranges) {
    where.push(rangePredicate(schema, range, binds));
  }
  if (periodBounds !== undefined && schema.time !== undefined) {
    where.push(periodPredicate(schema.time.column, periodBounds, binds));
  }
  return where;
}
