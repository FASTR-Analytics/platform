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

function hasControlCharacter(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

function fold(name: string): string {
  return name.toLowerCase();
}

export function validateLongTableSchema(schema: LongTableSchema): void {
  const seen = new Set<string>();
  for (const column of schema.columns) {
    if (column.name.length === 0) {
      fail("A column name is empty");
    }
    if (hasControlCharacter(column.name)) {
      fail(
        `Column name ${JSON.stringify(column.name)} has a control character`,
      );
    }
    if (column.name.startsWith(SAMPLE_N_PREFIX)) {
      fail(
        `Column "${column.name}" starts with the reserved "${SAMPLE_N_PREFIX}"`,
      );
    }
    if (seen.has(fold(column.name))) {
      fail(
        `Column "${column.name}" is declared twice (names are case-insensitive)`,
      );
    }
    seen.add(fold(column.name));
  }
  const requireColumn = (name: string, where: string) => {
    if (!seen.has(fold(name))) {
      fail(`${where} "${name}" is not a column`);
    }
    if (getColumnType(schema, name) === undefined) {
      fail(`${where} "${name}" differs in case from its column`);
    }
  };
  for (const v of schema.values) {
    requireColumn(v, "Value");
  }
  const dimensionNames = new Set<string>();
  for (const d of schema.dimensions) {
    requireColumn(d.column, "Dimension");
    if (dimensionNames.has(fold(d.column))) {
      fail(`Dimension "${d.column}" is declared twice`);
    }
    dimensionNames.add(fold(d.column));
    validateDimension(schema, d);
  }
  if (schema.unitColumn !== undefined) {
    requireColumn(schema.unitColumn, "Unit column");
  }
  if (schema.time !== undefined) {
    validateTime(schema, schema.time, seen, dimensionNames);
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

function validateTime(
  schema: LongTableSchema,
  time: LongTableTime,
  columnNames: Set<string>,
  dimensionNames: Set<string>,
): void {
  if (getColumnType(schema, time.column) === undefined) {
    fail(`Time column "${time.column}" is not a column`);
  }
  if (getColumnType(schema, time.column) !== "integer") {
    fail(`Time column "${time.column}" must be an integer column`);
  }
  if (dimensionNames.has(fold(time.column))) {
    fail(`Time column "${time.column}" cannot also be a dimension`);
  }
  if (time.fiscalYear !== undefined) {
    if (time.grain !== "year-month") {
      fail("A fiscal year rule requires a year-month time column");
    }
    const s = time.fiscalYear.startMonth;
    if (!Number.isInteger(s) || s < 2 || s > 12) {
      fail("fiscalYear.startMonth must be an integer from 2 to 12");
    }
  }
  const reachableGrains = new Set<string>(getReachableGrains(time.grain));
  for (const grain of Object.keys(time.grains ?? {})) {
    if (!reachableGrains.has(grain)) {
      fail(
        `Grain "${grain}" is not reachable from a ${time.grain} time column`,
      );
    }
  }
  const reachableComponents = new Set<string>(
    getReachableComponents(time.grain),
  );
  for (const component of Object.keys(time.components ?? {})) {
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
    if (derived.name.startsWith(SAMPLE_N_PREFIX)) {
      fail(
        `Derived dimension "${derived.name}" starts with the reserved "${SAMPLE_N_PREFIX}"`,
      );
    }
    if (columnNames.has(fold(derived.name))) {
      fail(`Derived dimension "${derived.name}" collides with a column`);
    }
    if (derivedNames.has(fold(derived.name))) {
      fail(`Derived dimension "${derived.name}" is declared twice`);
    }
    derivedNames.add(fold(derived.name));
  }
}

// Panther's defaults over a described parquet: a convention-named integer
// column whose every sampled value matches its grain is the time column
// (first match wins, in the conventions' order); text, boolean, date and
// timestamp columns are category dimensions (the engine's view casts the
// last three to text); integer columns are both dimension and value; number
// columns are values; unsupported columns are omitted.
export function inferLongTableSchema(
  columns: DescribedColumn[],
  conventions?: InferConventions,
): LongTableSchema {
  const timeColumns = conventions?.timeColumns ?? DEFAULT_TIME_COLUMNS;
  const usable = columns.filter((c) => c.type !== "unsupported");
  const time = findTimeColumn(usable, timeColumns);
  const schema: LongTableSchema = {
    columns: usable.map((c) => ({
      name: c.name,
      type: c.type === "integer" || c.type === "number" ? c.type : "text",
    })),
    values: usable
      .filter((c) => c.type === "integer" || c.type === "number")
      .map((c) => c.name),
    dimensions: usable
      .filter((c) => c.type !== "number" && c.name !== time?.column)
      .map((c) => ({ column: c.name, kind: "category" })),
  };
  if (time !== undefined) {
    schema.time = time;
  }
  if (
    conventions?.unitColumn !== undefined &&
    usable.some((c) => c.name === conventions.unitColumn)
  ) {
    schema.unitColumn = conventions.unitColumn;
  }
  return schema;
}

function findTimeColumn(
  columns: DescribedColumn[],
  timeColumns: Record<string, PeriodType>,
): LongTableTime | undefined {
  for (const [name, grain] of Object.entries(timeColumns)) {
    const column = columns.find((c) => c.name === name);
    if (
      column === undefined || column.type !== "integer" ||
      column.sample === undefined || column.sample.length === 0
    ) {
      continue;
    }
    if (column.sample.every((v) => getPeriodTypeFromValue(v) === grain)) {
      return { column: name, grain };
    }
  }
  return undefined;
}
