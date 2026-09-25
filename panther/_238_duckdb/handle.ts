// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { validateLongTableSchema } from "./deps.ts";
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
  validateParquetPath,
} from "./instance.ts";
import type { LongTableOpenOptions, PhysicalColumn } from "./instance.ts";
import { isCompatibleType, isIntegerFamily } from "./physical_types.ts";
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
  const lookups = source.lookups ?? [];
  await validateParquetPath(source.parquet);
  for (const lookup of lookups) {
    await validateParquetPath(lookup.parquet);
  }
  const instance = await createInstance(opts);
  const connection = await instance.connect();
  try {
    await lockDown(connection, [
      source.parquet,
      ...lookups.map((l) => l.parquet),
    ]);
    const main = await describeStatement(
      connection,
      `SELECT * FROM ${readParquet(source.parquet)}`,
    );
    const described = new Map<string, string>(
      main.map((c) => [c.name.toLowerCase(), c.rawType]),
    );
    for (const lookup of lookups) {
      await checkLookup(connection, lookup, main, described);
    }
    await connection.run(createViewSql(source, schema, main));
    const view = await describeStatement(
      connection,
      `SELECT * FROM ${quoteIdentifier(LONG_TABLE_VIEW)}`,
    );
    checkSchemaAgainstView(schema, view);
  } catch (cause) {
    connection.closeSync();
    instance.closeSync();
    throw cause;
  }
  return { instance, connection, schema, viewName: LONG_TABLE_VIEW };
}

export function closeLongTable(handle: LongTableHandle): void {
  handle.connection.closeSync();
  handle.instance.closeSync();
}

// allowed_directories first, then the irreversible lockdown: after it,
// read_parquet reaches only the parquets' directories, never a URL.
async function lockDown(
  connection: DuckDBConnection,
  paths: string[],
): Promise<void> {
  const directories = [...new Set(paths.map(parentDirectory))];
  await connection.run(
    `SET allowed_directories = [${directories.map(quoteLiteral).join(", ")}]`,
  );
  await connection.run("SET enable_external_access = false");
}

async function checkLookup(
  connection: DuckDBConnection,
  lookup: ParquetLookup,
  main: PhysicalColumn[],
  claimed: Map<string, string>,
): Promise<void> {
  const columns = await describeStatement(
    connection,
    `SELECT * FROM ${readParquet(lookup.parquet)}`,
  );
  const physical = new Map(columns.map((c) => [c.name, c.rawType]));
  const keyType = physical.get(lookup.key);
  if (keyType === undefined) {
    throw new Error(`Lookup key "${lookup.key}" is not in ${lookup.parquet}`);
  }
  const mainKeyType = main.find((c) => c.name === lookup.key)?.rawType;
  if (mainKeyType === undefined) {
    throw new Error(`Lookup key "${lookup.key}" is not in the main table`);
  }
  if (isIntegerFamily(keyType) !== isIntegerFamily(mainKeyType)) {
    throw new Error(
      `Lookup key "${lookup.key}" is ${keyType} in the lookup and ${mainKeyType} in the main table`,
    );
  }
  for (const column of lookup.columns) {
    if (!physical.has(column)) {
      throw new Error(`Lookup column "${column}" is not in ${lookup.parquet}`);
    }
    if (claimed.has(column.toLowerCase())) {
      throw new Error(
        `Lookup column "${column}" is already a column of the main table or another lookup`,
      );
    }
    claimed.set(column.toLowerCase(), physical.get(column) ?? "");
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

// One flat view: the main table's columns (declared-text columns cast to
// VARCHAR when the file holds another type) left-joined to each lookup's
// requested columns on its key.
function createViewSql(
  source: ParquetSource,
  schema: LongTableSchema,
  main: PhysicalColumn[],
): string {
  const mainTypes = new Map(main.map((c) => [c.name, c.rawType]));
  const casts = schema.columns
    .filter((c) =>
      c.type === "text" && mainTypes.has(c.name) &&
      mainTypes.get(c.name)?.toUpperCase() !== "VARCHAR"
    )
    .map((c) =>
      `CAST(r.${quoteIdentifier(c.name)} AS VARCHAR) AS ${
        quoteIdentifier(c.name)
      }`
    );
  const replace = casts.length === 0 ? "" : ` REPLACE (${casts.join(", ")})`;
  const selects = [`r.*${replace}`];
  const joins: string[] = [];
  (source.lookups ?? []).forEach((lookup, i) => {
    const alias = `l${i}`;
    for (const column of lookup.columns) {
      const declared = schema.columns.find((c) => c.name === column);
      const ref = `${alias}.${quoteIdentifier(column)}`;
      selects.push(
        declared?.type === "text"
          ? `CAST(${ref} AS VARCHAR) AS ${quoteIdentifier(column)}`
          : `${ref} AS ${quoteIdentifier(column)}`,
      );
    }
    joins.push(
      `LEFT JOIN ${readParquet(lookup.parquet)} ${alias} USING (${
        quoteIdentifier(lookup.key)
      })`,
    );
  });
  return `CREATE VIEW ${quoteIdentifier(LONG_TABLE_VIEW)} AS SELECT ${
    selects.join(", ")
  } FROM ${readParquet(source.parquet)} r ${joins.join(" ")}`;
}

function checkSchemaAgainstView(
  schema: LongTableSchema,
  view: PhysicalColumn[],
): void {
  const physical = new Map(view.map((c) => [c.name, c.rawType]));
  for (const column of schema.columns) {
    const rawType = physical.get(column.name);
    if (rawType === undefined) {
      throw new Error(`Schema column "${column.name}" is not in the parquet`);
    }
    if (!isCompatibleType(column.type, rawType)) {
      throw new Error(
        `Schema column "${column.name}" is declared ${column.type} but the parquet holds ${rawType}`,
      );
    }
  }
}
