// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  caseHint,
  findNonPeriod,
  foldName,
  validateLongTableSchema,
} from "./deps.ts";
import type {
  DuckDBConnection,
  DuckDBInstance,
  LongTableSchema,
} from "./deps.ts";
import {
  createInstance,
  describeStatement,
  parentDirectory,
  readParquet,
  readTimeValues,
  validateParquetPath,
} from "./instance.ts";
import type { LongTableOpenOptions, PhysicalColumn } from "./instance.ts";
import { isCompatibleType, normalizeDuckDbType } from "./physical_types.ts";
import { quoteIdentifier, quoteLiteral } from "./_sql/quote.ts";

export type ParquetLookup = { parquet: string; key: string; columns: string[] };

export type ParquetSource = { parquet: string; lookups?: ParquetLookup[] };

export type LongTableHandle = {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
  schema: LongTableSchema;
  viewName: string;
};

export const LONG_TABLE_VIEW = "long_table";

export async function openLongTable(
  source: ParquetSource,
  schema: LongTableSchema,
  opts: LongTableOpenOptions = {},
): Promise<LongTableHandle> {
  validateLongTableSchema(schema);
  const resolved: ParquetSource = {
    parquet: await validateParquetPath(source.parquet),
    lookups: await Promise.all(
      (source.lookups ?? []).map(async (lookup) => ({
        ...lookup,
        parquet: await validateParquetPath(lookup.parquet),
      })),
    ),
  };
  const lookups = resolved.lookups ?? [];
  const instance = await createInstance(opts);
  let connection: DuckDBConnection | undefined;
  try {
    connection = await instance.connect();
    await lockDown(connection, [
      resolved.parquet,
      ...lookups.map((l) => l.parquet),
    ]);
    const main = await describeStatement(
      connection,
      `SELECT * FROM ${readParquet(resolved.parquet)}`,
    );
    const sources = new Map<string, ColumnSource>(
      main.map((c) => [foldName(c.name), { ...c, table: MAIN_ALIAS }]),
    );
    for (const [i, lookup] of lookups.entries()) {
      await checkLookup(connection, lookup, main, sources, lookupAlias(i));
    }
    await connection.run(
      createViewSql(resolved, resolveColumns(schema, sources)),
    );
    await checkTimeColumn(connection, schema);
    // Nothing the open set may be changed afterwards: without this a holder
    // of the connection could raise the memory limit or the thread count.
    await connection.run("SET lock_configuration = true");
  } catch (cause) {
    closeQuietly(connection, instance);
    throw cause;
  }
  return { instance, connection, schema, viewName: LONG_TABLE_VIEW };
}

export function closeLongTable(handle: LongTableHandle): void {
  handle.connection.closeSync();
  handle.instance.closeSync();
}

// The original failure is the one to report, so a close that throws on the
// way out is dropped; the instance is closed even when the connection's
// close fails.
function closeQuietly(
  connection: DuckDBConnection | undefined,
  instance: DuckDBInstance,
): void {
  try {
    connection?.closeSync();
  } catch {
    // dropped: see above
  }
  try {
    instance.closeSync();
  } catch {
    // dropped: see above
  }
}

// The declared grain is checked against the data once, here. A cell that is
// not a period of the grain would otherwise derive a thirteenth month, and
// as the data's last period it would make every relative period filter
// throw.
async function checkTimeColumn(
  connection: DuckDBConnection,
  schema: LongTableSchema,
): Promise<void> {
  const time = schema.time;
  if (time === undefined) {
    return;
  }
  const bad = findNonPeriod(
    await readTimeValues(
      connection,
      time.column,
      quoteIdentifier(LONG_TABLE_VIEW),
    ),
    time.grain,
  );
  if (bad !== undefined) {
    throw new Error(
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

// allowed_directories first, then the irreversible lockdown: after it,
// read_parquet reaches only the parquets' directories, never a URL. The time
// zone is fixed before the lockdown so a TIMESTAMP WITH TIME ZONE column
// cast to text reads the same on every machine.
async function lockDown(
  connection: DuckDBConnection,
  paths: string[],
): Promise<void> {
  const directories = [...new Set(paths.map(parentDirectory))];
  await connection.run("SET TimeZone = 'UTC'");
  await connection.run(
    `SET allowed_directories = [${directories.map(quoteLiteral).join(", ")}]`,
  );
  await connection.run("SET enable_external_access = false");
}

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

type ViewColumn = { name: string; table: string; castToText: boolean };

// Every schema column matched to the physical column that backs it. A
// declared-text column over another type is cast; integer and number must be
// backed by a compatible type.
function resolveColumns(
  schema: LongTableSchema,
  sources: Map<string, ColumnSource>,
): ViewColumn[] {
  const physicalNames = [...sources.values()].map((c) => c.name);
  return schema.columns.map((column) => {
    const source = sources.get(foldName(column.name));
    if (source === undefined || source.name !== column.name) {
      throw new Error(
        `Schema column "${column.name}" is not in the parquet${
          caseHint(column.name, physicalNames)
        }`,
      );
    }
    const castToText = column.type === "text" &&
      normalizeDuckDbType(source.rawType) !== "text";
    if (!castToText && !isCompatibleType(column.type, source.rawType)) {
      throw new Error(
        `Schema column "${column.name}" is declared ${column.type} but the parquet holds ${source.rawType}`,
      );
    }
    return { name: column.name, table: source.table, castToText };
  });
}

// One flat view of the declared columns and nothing else: an undeclared
// physical column would otherwise share a namespace with the derived time
// dimensions, and DuckDB binds the first of two columns with one name.
// Declared-text columns are cast to VARCHAR when the file holds another
// type; each lookup is left-joined on its key.
function createViewSql(source: ParquetSource, columns: ViewColumn[]): string {
  const selects = columns.map((c) => {
    const ref = `${c.table}.${quoteIdentifier(c.name)}`;
    return c.castToText
      ? `CAST(${ref} AS VARCHAR) AS ${quoteIdentifier(c.name)}`
      : `${ref} AS ${quoteIdentifier(c.name)}`;
  });
  const joins = (source.lookups ?? []).map((lookup, i) => {
    const alias = lookupAlias(i);
    const key = quoteIdentifier(lookup.key);
    return `LEFT JOIN ${
      readParquet(lookup.parquet)
    } ${alias} ON ${MAIN_ALIAS}.${key} = ${alias}.${key}`;
  });
  return `CREATE VIEW ${quoteIdentifier(LONG_TABLE_VIEW)} AS SELECT ${
    selects.join(", ")
  } FROM ${readParquet(source.parquet)} ${MAIN_ALIAS} ${joins.join(" ")}`;
}
