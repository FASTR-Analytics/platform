// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getPeriodTypeFromValue, stableStringify } from "./deps.ts";
import type { PeriodType } from "./deps.ts";
import { getColumnType, resolveDimension } from "./schema.ts";
import {
  getExpressionIdentifiers,
  parseExpression,
} from "./_expression/parse.ts";
import {
  BLANK_SENTINEL,
  LongTableValidationError,
  SAMPLE_N_PREFIX,
} from "./types.ts";
import type {
  LongTableColumnType,
  LongTableFilter,
  LongTableQuery,
  LongTableSchema,
  LongTableValue,
  PeriodFilter,
  ResolvedDimension,
} from "./types.ts";

export const MAX_FILTER_VALUES = 1000;

const BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fail(message: string): never {
  throw new LongTableValidationError(message);
}

export function isBareIdentifier(name: string): boolean {
  return BARE_IDENTIFIER.test(name);
}

export function getValueOutputName(value: LongTableValue): string {
  return value.as ?? value.column;
}

export function validateLongTableQuery(
  schema: LongTableSchema,
  query: LongTableQuery,
): void {
  if (query.values.length === 0) {
    fail("A query needs at least one value");
  }
  const referenced = new Set<string>();
  for (const expression of query.expressions ?? []) {
    for (
      const name of getExpressionIdentifiers(parseExpression(expression.expr))
    ) {
      referenced.add(name);
    }
  }
  const outputNames = new Set<string>();
  const claim = (name: string, what: string) => {
    if (name.length === 0) {
      fail(`${what} has an empty name`);
    }
    if (name.startsWith(SAMPLE_N_PREFIX)) {
      fail(`${what} "${name}" starts with the reserved "${SAMPLE_N_PREFIX}"`);
    }
    const folded = name.toLowerCase();
    if (
      outputNames.has(folded) || outputNames.has(SAMPLE_N_PREFIX + folded) ||
      (folded.startsWith(SAMPLE_N_PREFIX) &&
        outputNames.has(folded.slice(SAMPLE_N_PREFIX.length)))
    ) {
      fail(`Output name "${name}" is used twice (names are case-insensitive)`);
    }
    outputNames.add(folded);
  };
  for (const value of query.values) {
    validateValue(schema, value);
    const name = getValueOutputName(value);
    claim(name, "Value");
    if (referenced.has(name) && !isBareIdentifier(name)) {
      fail(
        `Value "${name}" is used in an expression, so its output name must be a bare identifier`,
      );
    }
  }
  const valueNames = new Set(query.values.map(getValueOutputName));
  for (const expression of query.expressions ?? []) {
    claim(expression.name, "Expression");
    if (!isBareIdentifier(expression.name)) {
      fail(`Expression name "${expression.name}" must be a bare identifier`);
    }
    for (
      const name of getExpressionIdentifiers(parseExpression(expression.expr))
    ) {
      if (!valueNames.has(name)) {
        fail(
          `Expression "${expression.name}" uses "${name}", which is not a requested value's output name`,
        );
      }
    }
  }
  const groupBy = new Set<string>();
  for (const name of query.groupBy) {
    if (groupBy.has(name)) {
      fail(`groupBy names "${name}" twice`);
    }
    groupBy.add(name);
    const resolved = resolveDimension(schema, name);
    if (resolved === undefined) {
      fail(`groupBy "${name}" is not a dimension`);
    }
    if (resolved.kind === "dimension" && resolved.dimension.kind === "set") {
      fail(`groupBy "${name}" is a set dimension and cannot be grouped by`);
    }
  }
  for (const value of query.values) {
    const name = getValueOutputName(value);
    if (groupBy.has(name) && !referenced.has(name)) {
      fail(
        `Value "${name}" has the same output name as a groupBy entry; that is allowed only when an expression uses the value`,
      );
    }
  }
  for (const expression of query.expressions ?? []) {
    if (groupBy.has(expression.name)) {
      fail(
        `Expression "${expression.name}" has the same name as a groupBy entry`,
      );
    }
  }
  for (const filter of query.filters) {
    validateFilter(schema, filter);
  }
  if (query.periodFilter !== undefined) {
    if (schema.time === undefined) {
      fail("A period filter requires a time column");
    }
    validatePeriodFilter(query.periodFilter, schema.time.grain);
  }
  if (query.sampleN === true && schema.unitColumn === undefined) {
    fail("sampleN requires a unit column");
  }
  if (query.rollup !== undefined) {
    validateRollup(schema, query);
  }
}

function validateValue(schema: LongTableSchema, value: LongTableValue): void {
  if (value.column === "*") {
    if (value.func !== "COUNT") {
      fail(`"*" is accepted only with COUNT`);
    }
    if (value.as === undefined) {
      fail(`COUNT of "*" needs an output name (as)`);
    }
    return;
  }
  const type = getColumnType(schema, value.column);
  if (type === undefined) {
    fail(`Value column "${value.column}" is not a column`);
  }
  if (
    value.func === "SUM" || value.func === "AVG" || value.func === "identity"
  ) {
    if (!schema.values.includes(value.column)) {
      fail(
        `${value.func} of "${value.column}" requires a declared value column`,
      );
    }
    if (type === "text") {
      fail(`${value.func} of "${value.column}" requires a numeric column`);
    }
  }
}

function validateFilter(
  schema: LongTableSchema,
  filter: LongTableFilter,
): void {
  const resolved = resolveDimension(schema, filter.dim);
  if (resolved === undefined) {
    fail(`Filter "${filter.dim}" is not a dimension`);
  }
  if (filter.values.length === 0) {
    fail(`Filter "${filter.dim}" has no values`);
  }
  if (filter.values.length > MAX_FILTER_VALUES) {
    fail(`Filter "${filter.dim}" has more than ${MAX_FILTER_VALUES} values`);
  }
  if (resolved.kind === "dimension" && resolved.type === "text") {
    for (const v of filter.values) {
      if (String(v).trim().length === 0) {
        fail(
          `Filter "${filter.dim}" has a blank value; use "${BLANK_SENTINEL}" for the blank group`,
        );
      }
      if (resolved.dimension.kind === "set" && v === BLANK_SENTINEL) {
        fail(
          `Filter "${filter.dim}" is a set dimension and has no blank member`,
        );
      }
    }
  }
}

function validatePeriodFilter(filter: PeriodFilter, grain: PeriodType): void {
  if (filter.type === "range" || filter.type === "from") {
    const bounds = filter.type === "range"
      ? [filter.min, filter.max]
      : [filter.min];
    for (const bound of bounds) {
      if (getPeriodTypeFromValue(bound) !== grain) {
        fail(`Period bound ${bound} is not a ${grain} period`);
      }
    }
    if (filter.type === "range" && filter.min > filter.max) {
      fail(`Period range ${filter.min} to ${filter.max} is empty`);
    }
    return;
  }
  if (!Number.isInteger(filter.n) || filter.n < 1) {
    fail(
      `Period filter count ${filter.n} must be a whole number of at least 1`,
    );
  }
  const finer = grain === "year"
    ? ["month", "quarter"]
    : grain === "year-quarter"
    ? ["month"]
    : [];
  if (finer.includes(filter.unit)) {
    fail(`Period unit "${filter.unit}" is finer than the ${grain} time column`);
  }
}

function validateRollup(schema: LongTableSchema, query: LongTableQuery): void {
  const dim = query.rollup?.dim ?? "";
  if (!query.groupBy.includes(dim)) {
    fail(`rollup dimension "${dim}" is not in groupBy`);
  }
  const resolved = resolveDimension(schema, dim);
  if (
    resolved === undefined || resolved.kind !== "dimension" ||
    resolved.dimension.rollup === undefined
  ) {
    fail(`rollup dimension "${dim}" is not declared rollup in the schema`);
  }
  for (const value of query.values) {
    if (value.func === "identity") {
      fail(`identity value "${getValueOutputName(value)}" cannot be rolled up`);
    }
  }
}

// ── Typed coercion ───────────────────────────────────────────────────────────

const INTEGER_STRING = /^-?(0|[1-9]\d*)$/;
const NUMBER_STRING = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export function getFilterBindType(
  resolved: ResolvedDimension,
): LongTableColumnType {
  if (resolved.kind === "dimension") {
    return resolved.type;
  }
  return "integer";
}

// A requested filter value typed by its dimension before it is bound, or
// undefined when it cannot be: DuckDB would otherwise cast the column toward
// the numeric side and throw on the first non-numeric cell.
export function coerceFilterValue(
  v: string | number,
  resolved: ResolvedDimension,
): string | number | undefined {
  const type = getFilterBindType(resolved);
  if (type === "text") {
    const s = String(v);
    return resolved.kind === "dimension" &&
        resolved.dimension.caseInsensitive === true
      ? s.toUpperCase()
      : s;
  }
  if (type === "integer") {
    const n = typeof v === "number"
      ? v
      : INTEGER_STRING.test(v)
      ? Number(v)
      : undefined;
    if (n === undefined || !Number.isSafeInteger(n)) {
      return undefined;
    }
    if (resolved.kind === "time") {
      return getPeriodTypeFromValue(n) === resolved.grain ? n : undefined;
    }
    if (resolved.kind === "derived" && resolved.derived.kind === "grain") {
      return getPeriodTypeFromValue(n) === resolved.derived.grain
        ? n
        : undefined;
    }
    return n;
  }
  const n = typeof v === "number"
    ? v
    : NUMBER_STRING.test(v)
    ? Number(v)
    : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}

// ── Normalization and the key ────────────────────────────────────────────────

function compareByString(a: string | number, b: string | number): number {
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function dedupeValues(values: (string | number)[]): (string | number)[] {
  const seen = new Set<string>();
  const out: (string | number)[] = [];
  for (const v of values) {
    const key = `${typeof v}:${String(v)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  // Total: a number sorts before the string with the same spelling, so the
  // key cannot depend on the order the values were given in.
  return out.sort((a, b) =>
    compareByString(a, b) ||
    (typeof a === typeof b ? 0 : typeof a === "number" ? -1 : 1)
  );
}

export function normalizeLongTableQuery(query: LongTableQuery): LongTableQuery {
  const values = query.values
    .map((v) => ({ column: v.column, func: v.func, as: getValueOutputName(v) }))
    .sort((a, b) => compareByString(a.as, b.as));
  const filters = query.filters
    .map((f, i) => ({ f: { dim: f.dim, values: dedupeValues(f.values) }, i }))
    .sort((a, b) => compareByString(a.f.dim, b.f.dim) || a.i - b.i)
    .map((x) => x.f);
  const normalized: LongTableQuery = {
    values,
    groupBy: [...query.groupBy],
    filters,
  };
  if (query.periodFilter !== undefined) {
    normalized.periodFilter = { ...query.periodFilter };
  }
  if (query.expressions !== undefined && query.expressions.length > 0) {
    normalized.expressions = query.expressions
      .map((e) => ({ name: e.name, expr: e.expr }))
      .sort((a, b) => compareByString(a.name, b.name));
  }
  if (query.rollup !== undefined) {
    normalized.rollup = { dim: query.rollup.dim };
  }
  if (query.sampleN === true) {
    normalized.sampleN = true;
  }
  return normalized;
}

export function getLongTableQueryKey(query: LongTableQuery): string {
  return stableStringify(normalizeLongTableQuery(query));
}
