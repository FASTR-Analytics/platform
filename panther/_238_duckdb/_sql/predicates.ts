// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BIGINT,
  BLANK_SENTINEL,
  coerceFilterValue,
  DEFAULT_SET_DELIMITER,
  DOUBLE,
  getFilterBindType,
  VARCHAR,
} from "../deps.ts";
import type {
  LongTableDimension,
  LongTableFilter,
  LongTableSchema,
  PeriodBounds,
  ResolvedDimension,
} from "../deps.ts";
import { resolveDimension } from "../deps.ts";
import type { BindList, LiteralList } from "./plan.ts";
import { quoteIdentifier } from "./quote.ts";

// Whitespace a text cell may hold and still be blank: space, tab, carriage
// return, line feed, no-break space, embedded as real characters.
export const TRIM_CHARSET = " \t\r\n ";

export function columnRef(name: string): string {
  return quoteIdentifier(name);
}

export function blankPredicate(ref: string, literals: LiteralList): string {
  return `${ref} IS NULL OR trim(${ref}, ${literals.add(TRIM_CHARSET)}) = ${
    literals.add("")
  }`;
}

// The folded form of a text category: NULL and whitespace-only cells become
// the blank sentinel; every other cell is returned untrimmed.
export function foldedRef(ref: string, literals: LiteralList): string {
  return `CASE WHEN ${blankPredicate(ref, literals)} THEN ${
    literals.add(BLANK_SENTINEL)
  } ELSE ${ref} END`;
}

// The expression a dimension is selected and grouped by.
export function dimensionExpr(
  resolved: ResolvedDimension,
  literals: LiteralList,
): string {
  if (resolved.kind === "dimension") {
    const ref = columnRef(resolved.dimension.column);
    return resolved.type === "text" ? foldedRef(ref, literals) : ref;
  }
  if (resolved.kind === "time") {
    return columnRef(resolved.column);
  }
  return columnRef(resolved.derived.name);
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
  const wantsBlank = resolved.kind === "dimension" &&
    resolved.type === "text" && filter.values.includes(BLANK_SENTINEL);
  const bound = filter.values
    .filter((v) => !(wantsBlank && v === BLANK_SENTINEL))
    .map((v) => coerceFilterValue(v, resolved))
    .filter((v): v is string | number => v !== undefined);
  const type = getFilterBindType(resolved);
  const ref = dimensionRawRef(resolved);
  const parts: string[] = [];
  if (bound.length > 0) {
    const duckType = type === "text"
      ? VARCHAR
      : type === "integer"
      ? BIGINT
      : DOUBLE;
    const placeholders = bound.map((v) => binds.add(v, duckType)).join(", ");
    const lhs = resolved.kind === "dimension" &&
        resolved.dimension.caseInsensitive === true
      ? `UPPER(${ref})`
      : ref;
    parts.push(`${lhs} IN (${placeholders})`);
  }
  if (wantsBlank) {
    parts.push(blankPredicate(ref, literals));
  }
  return parts.length === 0 ? "FALSE" : parts.map((p) => `(${p})`).join(" OR ");
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

// The members of a set cell. `forFilter` upper-cases them under
// caseInsensitive so a filter compares folded; options read the raw members.
export function setMembersExpr(
  dimension: LongTableDimension,
  literals: LiteralList,
  forFilter: boolean,
): string {
  const split = `string_split(${columnRef(dimension.column)}, ${
    literals.add(dimension.delimiter ?? DEFAULT_SET_DELIMITER)
  })`;
  return forFilter && dimension.caseInsensitive === true
    ? `list_transform(${split}, x -> UPPER(x))`
    : split;
}

function setPredicate(
  dimension: LongTableDimension,
  filter: LongTableFilter,
  binds: BindList,
  literals: LiteralList,
): string {
  const resolved: ResolvedDimension = {
    kind: "dimension",
    dimension,
    type: "text",
  };
  const bound = filter.values
    .map((v) => coerceFilterValue(v, resolved))
    .filter((v): v is string => typeof v === "string");
  if (bound.length === 0) {
    return "FALSE";
  }
  const placeholders = bound.map((v) => binds.add(v, VARCHAR)).join(", ");
  return `list_has_any(${
    setMembersExpr(dimension, literals, true)
  }, [${placeholders}])`;
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

// The WHERE every read shares: category, set and period predicates.
export function buildWhere(
  schema: LongTableSchema,
  filters: LongTableFilter[],
  periodBounds: PeriodBounds | undefined,
  binds: BindList,
  literals: LiteralList,
): string[] {
  const where = filters.map((f) => filterPredicate(schema, f, binds, literals));
  if (periodBounds !== undefined && schema.time !== undefined) {
    where.push(periodPredicate(schema.time.column, periodBounds, binds));
  }
  return where;
}
