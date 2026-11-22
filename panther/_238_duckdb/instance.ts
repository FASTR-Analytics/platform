// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { DuckDBInstance, TIME_VALUES_LIMIT } from "./deps.ts";
import type { DuckDBConnection } from "./deps.ts";
import { quoteIdentifier, quoteLiteral } from "./_sql/quote.ts";

export type LongTableOpenOptions = {
  memoryLimit?: string;
  threads?: number;
  tempDirectory?: string;
};

const MEMORY_LIMIT = /^\d{1,9}(\.\d+)?[ \t]*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i;
const MAX_THREADS = 1024;
const GLOB_CHARACTERS = /[*?[\]{}]/;

export async function createInstance(
  opts: LongTableOpenOptions,
): Promise<DuckDBInstance> {
  // enable_external_access = false freezes temp_directory, so it is set at
  // create. DuckDB's default is `.tmp` under the working directory, with no
  // cap that holds; the empty string turns spilling off, so a statement that
  // does not fit the memory limit fails and writes nothing.
  const config: Record<string, string> = {
    temp_directory: opts.tempDirectory ?? "",
  };
  if (opts.memoryLimit !== undefined) {
    // DuckDB's own message for a unitless limit is the bare "Failed to set
    // config", so the unit is checked here.
    if (!MEMORY_LIMIT.test(opts.memoryLimit)) {
      throw new Error(
        `memoryLimit "${opts.memoryLimit}" must carry a unit, such as "512MB"`,
      );
    }
    config.memory_limit = opts.memoryLimit;
  }
  if (opts.threads !== undefined) {
    if (
      !Number.isInteger(opts.threads) || opts.threads < 1 ||
      opts.threads > MAX_THREADS
    ) {
      throw new Error(
        `threads must be a whole number from 1 to ${MAX_THREADS}`,
      );
    }
    config.threads = String(opts.threads);
  }
  if (opts.tempDirectory !== undefined) {
    // DuckDB does not create a missing temp directory.
    await Deno.mkdir(opts.tempDirectory, { recursive: true });
  }
  return await DuckDBInstance.create(":memory:", config);
}

// A path this module will put in a statement: absolute and free of glob
// characters, since DuckDB's readers expand globs and would read another
// file, or several.
export function requirePlainPath(path: string, what: string): void {
  if (!path.startsWith("/")) {
    throw new Error(`${what} path "${path}" must be absolute`);
  }
  if (GLOB_CHARACTERS.test(path)) {
    throw new Error(`${what} path "${path}" must not contain glob characters`);
  }
}

export async function requireFile(path: string, what: string): Promise<void> {
  const info = await Deno.stat(path).catch(() => undefined);
  if (info === undefined || !info.isFile) {
    throw new Error(`${what} path "${path}" is not an existing file`);
  }
}

// A parquet path to read: plain, and an existing file. Returns the path with
// symlinks resolved, which is the path to use from here on: DuckDB checks its
// allow-list against the file a link points to.
export async function validateParquetPath(path: string): Promise<string> {
  requirePlainPath(path, "Parquet");
  await requireFile(path, "Parquet");
  const resolved = await Deno.realPath(path);
  if (GLOB_CHARACTERS.test(resolved)) {
    throw new Error(
      `Parquet path "${path}" resolves to "${resolved}", which contains glob characters`,
    );
  }
  return resolved;
}

export function readParquet(path: string): string {
  return `read_parquet(${quoteLiteral(path)})`;
}

// allowed_paths first, then the irreversible lockdown: after it, DuckDB opens
// the listed files and nothing else, never a sibling, a directory listing, a
// new file or a URL. A directory is never allowed, since that would open
// every file under it. The time zone is fixed before the lockdown so a
// TIMESTAMP WITH TIME ZONE column cast to text reads the same on every
// machine.
export async function lockDown(
  connection: DuckDBConnection,
  paths: readonly string[],
): Promise<void> {
  const files = [...new Set(paths)];
  await connection.run("SET TimeZone = 'UTC'");
  await connection.run(
    `SET allowed_paths = [${files.map(quoteLiteral).join(", ")}]`,
  );
  await connection.run("SET enable_external_access = false");
}

// Open, run, close: for the one-shot statements (describe, write) that need
// no long-lived handle.
export async function withConnection<T>(
  fn: (connection: DuckDBConnection) => Promise<T>,
): Promise<T> {
  const instance = await createInstance({});
  try {
    const connection = await instance.connect();
    try {
      return await fn(connection);
    } finally {
      connection.closeSync();
    }
  } finally {
    instance.closeSync();
  }
}

// The distinct non-null values of an integer column, at most
// TIME_VALUES_LIMIT of them: all of them, or proof there are too many to be
// periods.
export async function readTimeValues(
  connection: DuckDBConnection,
  column: string,
  from: string,
): Promise<number[]> {
  const ref = quoteIdentifier(column);
  const reader = await connection.runAndReadAll(
    `SELECT DISTINCT ${ref} AS v FROM ${from} WHERE ${ref} IS NOT NULL LIMIT ${TIME_VALUES_LIMIT}`,
  );
  return reader.getRowObjects().map((row) => Number(row.v));
}

// The non-null MIN and MAX of each named integer column, in one pass that
// the parquet's statistics usually answer without reading a row. A column of
// nothing but NULL contributes no bound.
export async function readIntegerBounds(
  connection: DuckDBConnection,
  columns: string[],
  from: string,
): Promise<Map<string, bigint[]>> {
  const selects = columns.flatMap((column, i) => {
    const ref = quoteIdentifier(column);
    return [`MIN(${ref}) AS lo${i}`, `MAX(${ref}) AS hi${i}`];
  });
  const row = (await connection.runAndReadAll(
    `SELECT ${selects.join(", ")} FROM ${from}`,
  )).getRowObjects()[0];
  return new Map(columns.map((column, i) => [
    column,
    [row?.[`lo${i}`], row?.[`hi${i}`]].filter((v) => typeof v === "bigint"),
  ]));
}

export type PhysicalColumn = { name: string; rawType: string };

export async function describeStatement(
  connection: DuckDBConnection,
  select: string,
): Promise<PhysicalColumn[]> {
  const reader = await connection.runAndReadAll(`DESCRIBE ${select}`);
  return reader.getRowObjects().map((row) => ({
    name: String(row.column_name),
    rawType: String(row.column_type),
  }));
}
