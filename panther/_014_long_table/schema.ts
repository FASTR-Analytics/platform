// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getPeriodTypeFromValue } from "./deps.ts";
import type { PeriodType } from "./deps.ts";
import {
  BLANK_SENTINEL,
  LongTableValidationError,
  SAMPLE_N_PREFIX,
} from "./types.ts";
import type {
  DerivedDimension,
  DescribedColumn,
  InferConventions,
  LongTableColumnType,
  LongTableDimension,
  LongTableGrainNames,
  LongTableSchema,
  LongTableTime,
  ResolvedDimension,
} from "./types.ts";

const DEFAULT_GRAIN_NAMES = {
  "year-quarter": "year_quarter",
  year: "year",
} as const;

const DEFAULT_COMPONENT_NAMES = { month: "month", quarter: "quarter" } as const;

const DEFAULT_TIME_COLUMNS: Record<string, PeriodType> = {
  period_id: "year-month",
  quarter_id: "year-quarter",
  year: "year",
};

// One more than the distinct periods any grain can hold (151 years of 12
// months, the range periods.ts accepts). A read of a time column's distinct
// values limited to this is every value, or proof there are too many for
// them all to be periods; either way the check over them is complete, which
// a small sample is not.
export const TIME_VALUES_LIMIT = 1813;

export function getTimeConventions(
  conventions?: InferConventions,
): Record<string, PeriodType> {
  return conventions?.timeColumns ?? DEFAULT_TIME_COLUMNS;
}

// Whether a time column's distinct values (read up to TIME_VALUES_LIMIT) are
// all periods of the grain; when not, the first value that is not, or
// "too many".
export function findNonPeriod(
  values: number[],
  grain: PeriodType,
): number | "too many" | undefined {
  if (values.length >= TIME_VALUES_LIMIT) {
    return "too many";
  }
  return values.find((v) => getPeriodTypeFromValue(v) !== grain);
}

function fail(message: string): never {
  throw new LongTableValidationError(message);
}

export function getReachableGrains(
  grain: PeriodType,
): Exclude<PeriodType, "year-month">[] {
  if (grain === "year-month") {
    return ["year-quarter", "year"];
  }
  if (grain === "year-quarter") {
    return ["year"];
  }
  return [];
}

export function getReachableComponents(
  grain: PeriodType,
): ("month" | "quarter")[] {
  if (grain === "year-month") {
    return ["month", "quarter"];
  }
  if (grain === "year-quarter") {
    return ["quarter"];
  }
  return [];
}

export function getDerivedDimensions(
  schema: LongTableSchema,
): DerivedDimension[] {
  const time = schema.time;
  if (time === undefined) {
    return [];
  }
  return [
    ...getReachableGrains(time.grain).map((grain): DerivedDimension => ({
      name: time.grains?.[grain] ?? DEFAULT_GRAIN_NAMES[grain],
      kind: "grain",
      grain,
    })),
    ...getReachableComponents(time.grain).map(
      (component): DerivedDimension => ({
        name: time.components?.[component] ??
          DEFAULT_COMPONENT_NAMES[component],
        kind: "component",
        component,
      }),
    ),
  ];
}

export function getColumnType(
  schema: LongTableSchema,
  name: string,
): LongTableColumnType | undefined {
  return schema.columns.find((c) => c.name === name)?.type;
}

// A name in `groupBy` or a filter: a declared dimension, the time column, or
// a derived dimension. Undefined for anything else, including a plain value
// column.
export function resolveDimension(
  schema: LongTableSchema,
  name: string,
): ResolvedDimension | undefined {
  const dimension = schema.dimensions.find((d) => d.column === name);
  if (dimension !== undefined) {
    return {
      kind: "dimension",
      dimension,
      type: getColumnType(schema, name) ?? "text",
    };
  }
  if (schema.time !== undefined && schema.time.column === name) {
    return { kind: "time", column: name, grain: schema.time.grain };
  }
  const derived = getDerivedDimensions(schema).find((d) => d.name === name);
  if (derived !== undefined) {
    return { kind: "derived", derived };
  }
  return undefined;
}

export function hasControlCharacter(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

// DuckDB folds identifiers over ASCII only: "É" and "é" are two columns,
// "E" and "e" are one. Every uniqueness check in the layer uses this fold, so
// the layer and the engine agree on which names are the same name.
export function foldName(name: string): string {
  return name.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

// The declared name a reference differs from only in case, for a message
// that names the spelling to use. References themselves are exact.
export function findCaseVariant(
  name: string,
  declared: Iterable<string>,
): string | undefined {
  const folded = foldName(name);
  for (const candidate of declared) {
    if (candidate !== name && foldName(candidate) === folded) {
      return candidate;
    }
  }
  return undefined;
}

export function caseHint(name: string, declared: Iterable<string>): string {
  const variant = findCaseVariant(name, declared);
  return variant === undefined ? "" : `; it differs in case from "${variant}"`;
}

// Every name a groupBy entry or a filter may use.
export function getDimensionNames(schema: LongTableSchema): string[] {
  return [
    ...schema.dimensions.map((d) => d.column),
    ...(schema.time === undefined ? [] : [schema.time.column]),
    ...getDerivedDimensions(schema).map((d) => d.name),
  ];
}

export function validateLongTableSchema(schema: LongTableSchema): void {
  const seen = new Set<string>();
  for (const column of schema.columns) {
    if (column.name.length === 0) {
      fail("A column name is empty");
    }
    if (column.name === "*") {
      fail(`A column cannot be named "*", which a query reads as every row`);
    }
    if (hasControlCharacter(column.name)) {
      fail(
        `Column name ${JSON.stringify(column.name)} has a control character`,
      );
    }
    if (foldName(column.name).startsWith(SAMPLE_N_PREFIX)) {
      fail(
        `Column "${column.name}" starts with the reserved "${SAMPLE_N_PREFIX}"`,
      );
    }
    if (seen.has(foldName(column.name))) {
      fail(
        `Column "${column.name}" is declared twice (names are case-insensitive)`,
      );
    }
    seen.add(foldName(column.name));
  }
  const columnNames = schema.columns.map((c) => c.name);
  const requireColumn = (name: string, where: string) => {
    if (getColumnType(schema, name) === undefined) {
      fail(
        `${where} "${name}" is not a column${caseHint(name, columnNames)}`,
      );
    }
  };
  const valueNames = new Set<string>();
  for (const v of schema.values) {
    requireColumn(v, "Value");
    if (valueNames.has(v)) {
      fail(`Value "${v}" is listed twice`);
    }
    valueNames.add(v);
    // values gates SUM, AVG and identity, none of which takes text.
    if (getColumnType(schema, v) === "text") {
      fail(`Value "${v}" is a text column`);
    }
  }
  const dimensionNames = new Set<string>();
  for (const d of schema.dimensions) {
    requireColumn(d.column, "Dimension");
    if (dimensionNames.has(foldName(d.column))) {
      fail(`Dimension "${d.column}" is declared twice`);
    }
    dimensionNames.add(foldName(d.column));
    validateDimension(schema, d);
  }
  if (schema.unitColumn !== undefined) {
    requireColumn(schema.unitColumn, "Unit column");
  }
  if (schema.time !== undefined) {
    requireColumn(schema.time.column, "Time column");
    validateTime(schema, schema.time, seen, dimensionNames);
    // A period id is not a measure.
    if (valueNames.has(schema.time.column)) {
      fail(`Value "${schema.time.column}" is the time column`);
    }
  }
}

function validateDimension(
  schema: LongTableSchema,
  d: LongTableDimension,
): void {
  const type = getColumnType(schema, d.column);
  if (d.kind === "set" && type !== "text") {
    fail(`Set dimension "${d.column}" must be a text column`);
  }
  if (d.caseInsensitive === true && type !== "text") {
    fail(`caseInsensitive on "${d.column}" requires a text column`);
  }
  if (d.delimiter !== undefined) {
    if (d.kind !== "set") {
      fail(`delimiter on "${d.column}" requires kind "set"`);
    }
    if (d.delimiter.length === 0 || d.delimiter.includes("'")) {
      fail(`delimiter on "${d.column}" must be non-empty and contain no quote`);
    }
  }
  if (d.rollup !== undefined) {
    if (type !== "text") {
      fail(`rollup on "${d.column}" requires a text column`);
    }
    if (d.kind === "set") {
      fail(`rollup on "${d.column}" requires kind "category"`);
    }
    const sentinel = d.rollup.sentinel;
    if (sentinel !== undefined) {
      if (sentinel.trim().length === 0 || sentinel === BLANK_SENTINEL) {
        fail(
          `rollup sentinel on "${d.column}" must be non-blank and not "${BLANK_SENTINEL}"`,
        );
      }
      if (sentinel.includes("'")) {
        fail(`rollup sentinel on "${d.column}" contains a quote`);
      }
    }
  }
}

const PERIOD_TYPES: readonly string[] = ["year-month", "year-quarter", "year"];

// A key whose value is undefined is not a declaration.
function declaredKeys(
  names: Record<string, string | undefined> | undefined,
): string[] {
  return Object.entries(names ?? {})
    .filter(([, name]) => name !== undefined)
    .map(([key]) => key);
}

function validateTime(
  schema: LongTableSchema,
  time: LongTableTime,
  columnNames: Set<string>,
  dimensionNames: Set<string>,
): void {
  if (getColumnType(schema, time.column) !== "integer") {
    fail(`Time column "${time.column}" must be an integer column`);
  }
  if (dimensionNames.has(foldName(time.column))) {
    fail(`Time column "${time.column}" cannot also be a dimension`);
  }
  if (!PERIOD_TYPES.includes(time.grain)) {
    fail(`Time grain ${JSON.stringify(time.grain)} is not a period type`);
  }
  if (time.fiscalYear !== undefined) {
    if (time.grain !== "year-month") {
      fail("A fiscal year rule requires a year-month time column");
    }
    const namedBy: string = time.fiscalYear.namedBy;
    if (namedBy !== "start" && namedBy !== "end") {
      fail(`fiscalYear.namedBy must be "start" or "end"`);
    }
    const s = time.fiscalYear.startMonth;
    if (!Number.isInteger(s) || s < 2 || s > 12) {
      fail("fiscalYear.startMonth must be an integer from 2 to 12");
    }
  }
  const reachableGrains = new Set<string>(getReachableGrains(time.grain));
  for (const grain of declaredKeys(time.grains)) {
    if (!reachableGrains.has(grain)) {
      fail(
        `Grain "${grain}" is not reachable from a ${time.grain} time column`,
      );
    }
  }
  const reachableComponents = new Set<string>(
    getReachableComponents(time.grain),
  );
  for (const component of declaredKeys(time.components)) {
    if (!reachableComponents.has(component)) {
      fail(
        `Component "${component}" is not reachable from a ${time.grain} time column`,
      );
    }
  }
  const derivedNames = new Set<string>();
  for (const derived of getDerivedDimensions(schema)) {
    if (derived.name.length === 0 || hasControlCharacter(derived.name)) {
      fail(`Derived dimension name ${JSON.stringify(derived.name)} is invalid`);
    }
    if (foldName(derived.name).startsWith(SAMPLE_N_PREFIX)) {
      fail(
        `Derived dimension "${derived.name}" starts with the reserved "${SAMPLE_N_PREFIX}"`,
      );
    }
    if (columnNames.has(foldName(derived.name))) {
      fail(`Derived dimension "${derived.name}" collides with a column`);
    }
    if (derivedNames.has(foldName(derived.name))) {
      fail(`Derived dimension "${derived.name}" is declared twice`);
    }
    derivedNames.add(foldName(derived.name));
  }
}

// Panther's defaults over a described parquet: a convention-named integer
// column whose every value is a period of its grain is the time column
// (first match wins, in the conventions' order; `sample` holds the column's
// distinct values up to TIME_VALUES_LIMIT); a derived dimension whose default
// name is taken by a column is renamed after the time column, so the schema
// is always one validation accepts; text, boolean, date and
// timestamp columns are category dimensions (the engine's view casts the
// last three to text); integer columns are both dimension and value, except
// the time column, which is neither (a period id is not a measure); number
// columns are values; unsupported columns are omitted.
export function inferLongTableSchema(
  columns: DescribedColumn[],
  conventions?: InferConventions,
): LongTableSchema {
  const usable = columns.filter((c) => c.type !== "unsupported");
  const found = findTimeColumn(usable, getTimeConventions(conventions));
  const time = found === undefined
    ? undefined
    : withFreeDerivedNames(found, usable.map((c) => c.name));
  const schema: LongTableSchema = {
    columns: usable.map((c) => ({
      name: c.name,
      type: c.type === "integer" || c.type === "number" ? c.type : "text",
    })),
    values: usable
      .filter((c) =>
        (c.type === "integer" || c.type === "number") &&
        c.name !== time?.column
      )
      .map((c) => c.name),
    dimensions: usable
      .filter((c) => c.type !== "number" && c.name !== time?.column)
      .map((c) => ({ column: c.name, kind: "category" })),
  };
  if (time !== undefined) {
    schema.time = time;
  }
  const unit = conventions?.unitColumn === undefined
    ? undefined
    : findByFoldedName(usable, conventions.unitColumn);
  if (unit !== undefined) {
    schema.unitColumn = unit.name;
  }
  return schema;
}

// A convention names a column whatever its case; the schema keeps the file's
// spelling.
function findByFoldedName(
  columns: DescribedColumn[],
  name: string,
): DescribedColumn | undefined {
  return columns.find((c) => foldName(c.name) === foldName(name));
}

function findTimeColumn(
  columns: DescribedColumn[],
  timeColumns: Record<string, PeriodType>,
): LongTableTime | undefined {
  for (const [name, grain] of Object.entries(timeColumns)) {
    const column = findByFoldedName(columns, name);
    if (
      column === undefined || column.type !== "integer" ||
      column.sample === undefined || column.sample.length === 0
    ) {
      continue;
    }
    const values = column.sample.map(Number);
    if (findNonPeriod(values, grain) === undefined) {
      return { column: column.name, grain };
    }
  }
  return undefined;
}

// A derived dimension's default name ("year", "quarter") may be a column of
// the file. That derived dimension is renamed `<time column>_<default>`, then
// `_2`, `_3` until the name is free; the others keep their defaults and the
// physical column is untouched.
function withFreeDerivedNames(
  time: LongTableTime,
  columnNames: string[],
): LongTableTime {
  const taken = new Set(columnNames.map(foldName));
  const free = (name: string): string | undefined => {
    if (!taken.has(foldName(name))) {
      taken.add(foldName(name));
      return undefined;
    }
    const base = `${time.column}_${name}`;
    let renamed = base;
    for (let i = 2; taken.has(foldName(renamed)); i++) {
      renamed = `${base}_${i}`;
    }
    taken.add(foldName(renamed));
    return renamed;
  };
  const grains: LongTableGrainNames = {};
  for (const grain of getReachableGrains(time.grain)) {
    const renamed = free(DEFAULT_GRAIN_NAMES[grain]);
    if (renamed !== undefined) {
      grains[grain] = renamed;
    }
  }
  const components: NonNullable<LongTableTime["components"]> = {};
  for (const component of getReachableComponents(time.grain)) {
    const renamed = free(DEFAULT_COMPONENT_NAMES[component]);
    if (renamed !== undefined) {
      components[component] = renamed;
    }
  }
  return {
    ...time,
    ...(Object.keys(grains).length > 0 ? { grains } : {}),
    ...(Object.keys(components).length > 0 ? { components } : {}),
  };
}
