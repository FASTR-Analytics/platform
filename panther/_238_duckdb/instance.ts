// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  const config: Record<string, string> = {};
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
    // enable_external_access = false freezes temp_directory, so it is set at
    // create; DuckDB does not create a missing one.
    await Deno.mkdir(opts.tempDirectory, { recursive: true });
    config.temp_directory = opts.tempDirectory;
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
  if (parentDirectory(resolved) === "/") {
    // The lockdown allows the parquet's directory, and "/" is everything.
    throw new Error(`Parquet path "${path}" must not sit directly under "/"`);
  }
  return resolved;
}

export function readParquet(path: string): string {
  return `read_parquet(${quoteLiteral(path)})`;
}

export function parentDirectory(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

// Open, run, close: for the one-shot statements (describe, write) that need
// no long-lived handle.
export async function withConnection<T>(
  fn: (connection: DuckDBConnection) => Promise<T>,
): Promise<T> {
  const instance = await DuckDBInstance.create(":memory:");
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
