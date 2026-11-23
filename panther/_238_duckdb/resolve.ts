// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  caseHint,
  findNonPeriod,
  foldName,
  isOutsideSafeRange,
  LongTableValidationError,
  validateLongTableSchema,
} from "./deps.ts";
import type { DuckDBConnection, LongTableSchema } from "./deps.ts";
import {
  describeStatement,
  lockDown,
  readIntegerBounds,
  readParquet,
  readTimeValues,
  validateParquetPath,
  withConnection,
} from "./instance.ts";
import type { PhysicalColumn } from "./instance.ts";
import { isCompatibleType, normalizeDuckDbType } from "./physical_types.ts";
import { quoteIdentifier } from "./_sql/quote.ts";

export type ParquetLookup = { parquet: string; key: string; columns: string[] };

export type ParquetSource = { parquet: string; lookups?: ParquetLookup[] };

// Opening trusts `files` and `select` and checks nothing again, so only
// resolveLongTable makes one: mod.ts exports the class as a type only, and
// the private field keeps an object literal, or a spread of a real one with
// a field replaced, from typechecking. A symbol-keyed brand survives a spread.
export class ResolvedLongTable {
  readonly #resolved = true;
  constructor(
    readonly schema: LongTableSchema,
    readonly files: readonly string[],
    readonly select: string,
  ) {}
}

export async function resolveLongTable(
  source: ParquetSource,
  schema: LongTableSchema,
): Promise<ResolvedLongTable> {
  validateLongTableSchema(schema);
  const parquet = await validateParquetPath(source.parquet);
  const lookups = await Promise.all(
    (source.lookups ?? []).map(async (lookup) => ({
      ...lookup,
      parquet: await validateParquetPath(lookup.parquet),
    })),
  );
  const files = [...new Set([parquet, ...lookups.map((l) => l.parquet)])];
  const select = await withConnection(async (connection) => {
    await lockDown(connection, files);
    const main = await describeStatement(
      connection,
      `SELECT * FROM ${readParquet(parquet)}`,
    );
    const sources = new Map<string, ColumnSource>(
      main.map((c) => [foldName(c.name), { ...c, table: MAIN_ALIAS }]),
    );
    for (const [i, lookup] of lookups.entries()) {
      await checkLookup(connection, lookup, main, sources, lookupAlias(i));
    }
    const select = buildViewSelect(
      parquet,
      lookups,
      resolveColumns(schema, sources),
    );
    await checkIntegerRange(connection, schema, sources, `(${select})`);
    await checkTimeColumn(connection, schema, `(${select})`);
    return select;
  });
  return new ResolvedLongTable(structuredClone(schema), files, select);
}

// Only BIGINT and UBIGINT can hold an integer a JSON cell cannot carry; every
// narrower type fits. A declared-integer column is read as a number, so such
// a cell would be a silent rounding of an id: the file is refused here
// instead, once, and the caller is told to declare the column text.
// `describeLongTable` describes such a column as text, so an inferred schema
// never reaches this. A declared-number column over either type is a DOUBLE
// in the view, so its cells are the nearest doubles, as a DECIMAL's are.
const WIDE_INTEGER_TYPES = new Set(["BIGINT", "UBIGINT"]);

function isWideInteger(rawType: string): boolean {
  return WIDE_INTEGER_TYPES.has(rawType.toUpperCase());
}

async function checkIntegerRange(
  connection: DuckDBConnection,
  schema: LongTableSchema,
  sources: Map<string, ColumnSource>,
  from: string,
): Promise<void> {
  const wide = schema.columns
    .filter((c) =>
      c.type === "integer" &&
      isWideInteger(sources.get(foldName(c.name))?.rawType ?? "")
    )
    .map((c) => c.name);
  if (wide.length === 0) {
    return;
  }
  const bounds = await readIntegerBounds(connection, wide, from);
  for (const column of wide) {
    const bad = bounds.get(column)?.find(isOutsideSafeRange);
    if (bad !== undefined) {
      throw new LongTableValidationError(
        `Column "${column}" is declared integer but holds ${bad}, outside the safe integer range; declare it text`,
      );
    }
  }
}

// The declared grain is checked against the data once, here. A cell that is
// not a period of the grain would otherwise derive a thirteenth month, and
// as the data's last period it would make every relative period filter
// throw.
async function checkTimeColumn(
  connection: DuckDBConnection,
  schema: LongTableSchema,
  from: string,
): Promise<void> {
  const time = schema.time;
  if (time === undefined) {
    return;
  }
  const bad = findNonPeriod(
    await readTimeValues(connection, time.column, from),
    time.grain,
  );
  if (bad !== undefined) {
    throw new LongTableValidationError(
      bad === "too many"
        ? `Time column "${time.column}" holds more distinct values than a ${time.grain} column can`
        : `Time column "${time.column}" holds ${bad}, which is not a ${time.grain} period`,
    );
  }
}

const MAIN_ALIAS = "r";

function lookupAlias(i: number): string {
  return `l${i}`;
}

// A physical column and the table alias it is read from in the view.
type ColumnSource = PhysicalColumn & { table: string };

// The type classes a lookup key may have. The two sides must share one: a
// join across classes binds, and then every read throws on the first cell
// that does not convert.
const KEY_CLASSES = new Set([
  "integer",
  "text",
  "date",
  "boolean",
  "timestamp",
]);

async function checkLookup(
  connection: DuckDBConnection,
  lookup: ParquetLookup,
  main: PhysicalColumn[],
  sources: Map<string, ColumnSource>,
  alias: string,
): Promise<void> {
  const columns = await describeStatement(
    connection,
    `SELECT * FROM ${readParquet(lookup.parquet)}`,
  );
  const physical = new Map(columns.map((c) => [c.name, c.rawType]));
  const keyType = physical.get(lookup.key);
  if (keyType === undefined) {
    throw new Error(
      `Lookup key "${lookup.key}" is not in ${lookup.parquet}${
        caseHint(lookup.key, physical.keys())
      }`,
    );
  }
  const mainKeyType = main.find((c) => c.name === lookup.key)?.rawType;
  if (mainKeyType === undefined) {
    throw new Error(
      `Lookup key "${lookup.key}" is not in the main table${
        caseHint(lookup.key, main.map((c) => c.name))
      }`,
    );
  }
  const keyClass = normalizeDuckDbType(keyType);
  if (
    keyClass !== normalizeDuckDbType(mainKeyType) || !KEY_CLASSES.has(keyClass)
  ) {
    throw new Error(
      `Lookup key "${lookup.key}" is ${keyType} in the lookup and ${mainKeyType} in the main table`,
    );
  }
  for (const column of lookup.columns) {
    const rawType = physical.get(column);
    if (rawType === undefined) {
      throw new Error(
        `Lookup column "${column}" is not in ${lookup.parquet}${
          caseHint(column, physical.keys())
        }`,
      );
    }
    if (sources.has(foldName(column))) {
      throw new Error(
        `Lookup column "${column}" is already a column of the main table or another lookup`,
      );
    }
    sources.set(foldName(column), { name: column, rawType, table: alias });
  }
  const key = quoteIdentifier(lookup.key);
  const unique = await connection.runAndReadAll(
    `SELECT COUNT(*) = COUNT(DISTINCT ${key}) AS ok FROM ${
      readParquet(lookup.parquet)
    }`,
  );
  if (unique.getRowObjects()[0]?.ok !== true) {
    throw new Error(
      `Lookup key "${lookup.key}" in ${lookup.parquet} must be unique and never NULL`,
    );
  }
}

type ViewColumn = {
  name: string;
  table: string;
  cast: "VARCHAR" | "DOUBLE" | undefined;
};

// Every schema column matched to the physical column that backs it. A
// declared-text column over another type is cast to VARCHAR, a declared-
// number column over a wide integer to DOUBLE; integer and number must be
// backed by a compatible type.
function resolveColumns(
  schema: LongTableSchema,
  sources: Map<string, ColumnSource>,
): ViewColumn[] {
  const physicalNames = [...sources.values()].map((c) => c.name);
  return schema.columns.map((column) => {
    const source = sources.get(foldName(column.name));
    if (source === undefined || source.name !== column.name) {
      throw new LongTableValidationError(
        `Schema column "${column.name}" is not in the parquet${
          caseHint(column.name, physicalNames)
        }`,
      );
    }
    const castToText = column.type === "text" &&
      normalizeDuckDbType(source.rawType) !== "text";
    if (!castToText && !isCompatibleType(column.type, source.rawType)) {
      throw new LongTableValidationError(
        `Schema column "${column.name}" is declared ${column.type} but the parquet holds ${source.rawType}`,
      );
    }
    const cast = castToText
      ? "VARCHAR"
      : column.type === "number" && isWideInteger(source.rawType)
      ? "DOUBLE"
      : undefined;
    return { name: column.name, table: source.table, cast };
  });
}

// One flat SELECT of the declared columns and nothing else: an undeclared
// physical column would otherwise share a namespace with the derived time
// dimensions, and DuckDB binds the first of two columns with one name. Each
// lookup is left-joined on its key.
function buildViewSelect(
  parquet: string,
  lookups: ParquetLookup[],
  columns: ViewColumn[],
): string {
  const selects = columns.map((c) => {
    const ref = `${c.table}.${quoteIdentifier(c.name)}`;
    const value = c.cast === undefined ? ref : `CAST(${ref} AS ${c.cast})`;
    return `${value} AS ${quoteIdentifier(c.name)}`;
  });
  const joins = lookups.map((lookup, i) => {
    const alias = lookupAlias(i);
    const key = quoteIdentifier(lookup.key);
    return `LEFT JOIN ${
      readParquet(lookup.parquet)
    } ${alias} ON ${MAIN_ALIAS}.${key} = ${alias}.${key}`;
  });
  return [
    `SELECT ${selects.join(", ")}`,
    `FROM ${readParquet(parquet)} ${MAIN_ALIAS}`,
    ...joins,
  ].join(" ");
}
