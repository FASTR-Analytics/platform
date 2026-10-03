// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getPeriodTypeFromValue, stableStringify } from "./deps.ts";
import type { PeriodType } from "./deps.ts";
import {
  caseHint,
  foldName,
  getColumnType,
  getDimensionNames,
  hasControlCharacter,
  resolveDimension,
} from "./schema.ts";
import {
  getExpressionIdentifiers,
  parseExpression,
} from "./_expression/parse.ts";
import type { ExpressionNode } from "./_expression/parse.ts";
import {
  ALL_LONG_TABLE_AGGREGATES,
  BLANK_SENTINEL,
  isBlankText,
  LongTableValidationError,
  SAMPLE_N_PREFIX,
} from "./types.ts";
import type {
  DerivedDimension,
  LongTableColumnType,
  LongTableFilter,
  LongTableQuery,
  LongTableRange,
  LongTableSchema,
  LongTableTime,
  LongTableValue,
  PeriodFilter,
  ResolvedDimension,
} from "./types.ts";

export const MAX_FILTER_VALUES = 1000;
// DuckDB plans a WHERE of many predicates recursively: several hundred filters
// overflow its native stack and abort the process, which no memory limit
// catches. The caps keep a valid query far below that.
export const MAX_FILTERS = 50;
export const MAX_RANGES = 50;
export const MAX_VALUES = 100;
export const MAX_EXPRESSIONS = 100;
export const MAX_NAME_LENGTH = 200;
export const MAX_FILTER_VALUE_LENGTH = 1000;

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

// A value whose output name is a groupBy entry (names compare by fold) is an
// ingredient only: an expression consumes it and the dimension keeps the name.
export function isIngredientOnly(
  query: LongTableQuery,
  value: LongTableValue,
): boolean {
  const name = foldName(getValueOutputName(value));
  return query.groupBy.some((g) => foldName(g) === name);
}

// The result's columns in order: groupBy entries, values that are not
// ingredient-only, expressions.
export function getOutputNames(query: LongTableQuery): string[] {
  return [
    ...query.groupBy,
    ...query.values
      .filter((v) => !isIngredientOnly(query, v))
      .map(getValueOutputName),
    ...(query.expressions ?? []).map((e) => e.name),
  ];
}

export function validateLongTableQuery(
  schema: LongTableSchema,
  query: LongTableQuery,
): void {
  if (query.values.length === 0) {
    fail("A query needs at least one value");
  }
  requireAtMost(query.values.length, MAX_VALUES, "values");
  requireAtMost(query.filters.length, MAX_FILTERS, "filters");
  requireAtMost(query.ranges?.length ?? 0, MAX_RANGES, "ranges");
  requireAtMost(
    query.expressions?.length ?? 0,
    MAX_EXPRESSIONS,
    "expressions",
  );
  const identifiers = (query.expressions ?? []).map((expression) => {
    requireString(expression.name, "An expression's name");
    requireString(expression.expr, "An expression's expr");
    return getExpressionIdentifiers(parseNamed(expression));
  });
  const referenced = new Set(identifiers.flatMap((names) => [...names]));
  const outputNames = new Set<string>();
  const claim = (name: string, what: string) => {
    requireString(name, `${what} name`);
    if (name.length === 0) {
      fail(`${what} has an empty name`);
    }
    if (name.length > MAX_NAME_LENGTH) {
      fail(`${what} name is longer than ${MAX_NAME_LENGTH} characters`);
    }
    if (hasControlCharacter(name)) {
      fail(`${what} name ${JSON.stringify(name)} has a control character`);
    }
    const folded = foldName(name);
    if (folded.startsWith(SAMPLE_N_PREFIX)) {
      fail(`${what} "${name}" starts with the reserved "${SAMPLE_N_PREFIX}"`);
    }
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
  }
  const valuesByName = new Map(
    query.values.map((v) => [getValueOutputName(v), v]),
  );
  for (const [i, expression] of (query.expressions ?? []).entries()) {
    claim(expression.name, "Expression");
    if (!isBareIdentifier(expression.name)) {
      fail(`Expression name "${expression.name}" must be a bare identifier`);
    }
    for (const name of identifiers[i]) {
      const value = valuesByName.get(name);
      if (value === undefined) {
        fail(
          `Expression "${expression.name}" uses "${name}", which is not a requested value's output name${
            caseHint(name, valuesByName.keys())
          }`,
        );
      }
      // MIN and MAX of a text column are text, the one output an expression
      // cannot do arithmetic on.
      if (
        (value.func === "MIN" || value.func === "MAX") &&
        getColumnType(schema, value.column) === "text"
      ) {
        fail(
          `Expression "${expression.name}" uses "${name}", which is ${value.func} of the text column "${value.column}"; an expression needs numbers`,
        );
      }
    }
  }
  const dimensionNames = getDimensionNames(schema);
  const groupBy = new Set<string>();
  for (const name of query.groupBy) {
    if (groupBy.has(foldName(name))) {
      fail(`groupBy names "${name}" twice`);
    }
    groupBy.add(foldName(name));
    const resolved = resolveDimension(schema, name);
    if (resolved === undefined) {
      fail(
        `groupBy "${name}" is not a dimension${caseHint(name, dimensionNames)}`,
      );
    }
    if (resolved.kind === "dimension" && resolved.dimension.kind === "set") {
      fail(`groupBy "${name}" is a set dimension and cannot be grouped by`);
    }
  }
  for (const value of query.values) {
    const name = getValueOutputName(value);
    if (groupBy.has(foldName(name)) && value.func === "identity") {
      fail(
        `identity value "${name}" has the same output name as a groupBy entry; an identity value is grouped by, so it cannot be hidden as an expression's ingredient`,
      );
    }
    if (groupBy.has(foldName(name)) && !referenced.has(name)) {
      fail(
        `Value "${name}" has the same output name as a groupBy entry; that is allowed only when an expression uses the value`,
      );
    }
  }
  for (const expression of query.expressions ?? []) {
    if (groupBy.has(foldName(expression.name))) {
      fail(
        `Expression "${expression.name}" has the same name as a groupBy entry`,
      );
    }
  }
  for (const filter of query.filters) {
    validateFilter(schema, filter);
  }
  for (const range of query.ranges ?? []) {
    validateRange(schema, range);
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
  validateOrderBy(query);
  if (
    query.limit !== undefined &&
    (!Number.isInteger(query.limit) || query.limit < 1)
  ) {
    fail(`limit ${query.limit} must be a whole number of at least 1`);
  }
}

// orderBy names output columns only; the upper bound on limit is checked by
// the engine, which knows maxItems.
function validateOrderBy(query: LongTableQuery): void {
  const outputs = new Set(getOutputNames(query));
  const seen = new Set<string>();
  for (const order of query.orderBy ?? []) {
    if (!outputs.has(order.name)) {
      fail(
        `orderBy "${order.name}" is not an output column${
          caseHint(order.name, outputs)
        }`,
      );
    }
    if (seen.has(order.name)) {
      fail(`orderBy names "${order.name}" twice`);
    }
    seen.add(order.name);
  }
}

// A parse error says where in the text; this says which expression.
function parseNamed(
  expression: { name: string; expr: string },
): ExpressionNode {
  try {
    return parseExpression(expression.expr);
  } catch (cause) {
    if (cause instanceof LongTableValidationError) {
      fail(`Expression "${expression.name}": ${cause.message}`);
    }
    throw cause;
  }
}

function requireAtMost(count: number, max: number, field: string): void {
  if (count > max) {
    fail(`A query has at most ${max} ${field}; this one has ${count}`);
  }
}

// The zod twin types these fields; a caller that skips it must still get a
// validation error, never a TypeError from a string method.
function requireString(value: unknown, what: string): void {
  if (typeof value !== "string") {
    fail(`${what} must be a string`);
  }
}

function isAggregate(func: string): boolean {
  return (ALL_LONG_TABLE_AGGREGATES as readonly string[]).includes(func);
}

function validateValue(schema: LongTableSchema, value: LongTableValue): void {
  requireString(value.column, "A value's column");
  if (!isAggregate(value.func)) {
    fail(
      `Value "${value.column}" has func ${
        JSON.stringify(value.func)
      }; it must be one of ${ALL_LONG_TABLE_AGGREGATES.join(", ")}`,
    );
  }
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
    fail(
      `Value column "${value.column}" is not a column${
        caseHint(value.column, schema.columns.map((c) => c.name))
      }`,
    );
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
    fail(
      `Filter "${filter.dim}" is not a dimension${
        caseHint(filter.dim, getDimensionNames(schema))
      }`,
    );
  }
  if (filter.values.length === 0) {
    fail(`Filter "${filter.dim}" has no values`);
  }
  if (filter.values.length > MAX_FILTER_VALUES) {
    fail(`Filter "${filter.dim}" has more than ${MAX_FILTER_VALUES} values`);
  }
  const isSet = resolved.kind === "dimension" &&
    resolved.dimension.kind === "set";
  const isText = resolved.kind === "dimension" && resolved.type === "text";
  for (const v of filter.values) {
    if (typeof v === "string" && v.length > MAX_FILTER_VALUE_LENGTH) {
      fail(
        `Filter "${filter.dim}" has a value longer than ${MAX_FILTER_VALUE_LENGTH} characters`,
      );
    }
    if (typeof v === "number" && !Number.isFinite(v)) {
      fail(`Filter "${filter.dim}" has the value ${v}, which is not a number`);
    }
    if (v === BLANK_SENTINEL) {
      if (isSet) {
        fail(
          `Filter "${filter.dim}" is a set dimension and has no blank member`,
        );
      }
      continue;
    }
    if (isText) {
      if (isBlankText(String(v))) {
        fail(
          `Filter "${filter.dim}" has a blank value; use "${BLANK_SENTINEL}" for the blank group`,
        );
      }
      continue;
    }
    if (coerceFilterValue(v, resolved, schema.time) === undefined) {
      fail(
        `Filter "${filter.dim}" has the value ${
          JSON.stringify(v)
        }, which is not ${
          bindRule(resolved)
        }; use "${BLANK_SENTINEL}" for blank cells`,
      );
    }
  }
}

function bindRule(resolved: ResolvedDimension): string {
  if (resolved.kind === "time") {
    return `a ${resolved.grain} period`;
  }
  if (resolved.kind === "derived") {
    if (resolved.derived.kind === "grain") {
      return `a ${resolved.derived.grain} period`;
    }
    return resolved.derived.component === "month"
      ? "a month from 1 to 12"
      : "a quarter from 1 to 4";
  }
  return resolved.type === "integer" ? "a whole number" : "a number";
}

// A range names a numeric column other than the time column, which the
// period filter owns; a derived dimension is not a column and is rejected
// by the column lookup.
function validateRange(schema: LongTableSchema, range: LongTableRange): void {
  const type = getColumnType(schema, range.column);
  if (type === undefined) {
    fail(
      `Range column "${range.column}" is not a column${
        caseHint(range.column, schema.columns.map((c) => c.name))
      }`,
    );
  }
  if (type === "text") {
    fail(`Range column "${range.column}" is a text column`);
  }
  if (schema.time?.column === range.column) {
    fail(
      `Range column "${range.column}" is the time column; use periodFilter`,
    );
  }
  if (range.min === undefined && range.max === undefined) {
    fail(`Range on "${range.column}" has no bound`);
  }
  for (const bound of [range.min, range.max]) {
    if (bound !== undefined && !Number.isFinite(bound)) {
      fail(`Range bound ${bound} on "${range.column}" is not a finite number`);
    }
  }
  if (
    range.min !== undefined && range.max !== undefined && range.min > range.max
  ) {
    fail(`Range on "${range.column}" has min above max`);
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
    fail(
      `rollup dimension "${dim}" is not in groupBy${
        caseHint(dim, query.groupBy)
      }`,
    );
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
// undefined when it cannot be, which validation reports: DuckDB would
// otherwise cast the column toward the numeric side and throw on the first
// non-numeric cell. A text value is bound as given; a caseInsensitive
// dimension folds both sides in SQL, where one function does both. `time` is
// the schema's time declaration, whose fiscal rule widens a derived grain.
export function coerceFilterValue(
  v: string | number,
  resolved: ResolvedDimension,
  time?: LongTableTime,
): string | number | undefined {
  const type = getFilterBindType(resolved);
  if (type === "text") {
    return String(v);
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
    if (resolved.kind === "derived") {
      return isDerivedValue(n, resolved.derived, time) ? n : undefined;
    }
    return n;
  }
  const n = typeof v === "number"
    ? v
    : NUMBER_STRING.test(v)
    ? Number(v)
    : undefined;
  if (n === undefined || !Number.isFinite(n)) {
    return undefined;
  }
  // A whole number written past 2^53 would bind a neighbour, silently.
  if (typeof v === "string" && !v.includes(".") && !Number.isSafeInteger(n)) {
    return undefined;
  }
  return n;
}

// Whether a derived dimension can hold `n`. A fiscal rule names a year by
// its start or its end, so the derived year of the last (or first) period in
// range lies one year outside it: under { 11, end } the period 205012 is
// fiscal 2051.
function isDerivedValue(
  n: number,
  derived: DerivedDimension,
  time: LongTableTime | undefined,
): boolean {
  if (derived.kind === "component") {
    return n >= 1 && n <= (derived.component === "month" ? 12 : 4);
  }
  if (getPeriodTypeFromValue(n) === derived.grain) {
    return true;
  }
  const rule = time?.fiscalYear;
  if (rule === undefined) {
    return false;
  }
  const oneYear = derived.grain === "year" ? 1 : 10;
  const shifted = rule.namedBy === "end" ? n - oneYear : n + oneYear;
  return getPeriodTypeFromValue(shifted) === derived.grain;
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

function rangeOf(range: LongTableRange): LongTableRange {
  const out: LongTableRange = { column: range.column };
  if (range.min !== undefined) {
    out.min = range.min;
  }
  if (range.max !== undefined) {
    out.max = range.max;
  }
  return out;
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
  if (query.ranges !== undefined && query.ranges.length > 0) {
    normalized.ranges = query.ranges
      .map((r, i) => ({ r: rangeOf(r), i }))
      .sort((a, b) => compareByString(a.r.column, b.r.column) || a.i - b.i)
      .map((x) => x.r);
  }
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
  if (query.orderBy !== undefined && query.orderBy.length > 0) {
    normalized.orderBy = query.orderBy.map((o) => ({
      name: o.name,
      dir: o.dir,
    }));
  }
  if (query.limit !== undefined) {
    normalized.limit = query.limit;
  }
  return normalized;
}

export function getLongTableQueryKey(query: LongTableQuery): string {
  return stableStringify(normalizeLongTableQuery(query));
}
