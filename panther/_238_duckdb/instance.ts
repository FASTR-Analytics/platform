// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { DuckDBInstance } from "./deps.ts";
import type { DuckDBConnection } from "./deps.ts";
import { quoteLiteral } from "./_sql/quote.ts";

export type LongTableOpenOptions = {
  memoryLimit?: string;
  threads?: number;
  tempDirectory?: string;
};

const MEMORY_LIMIT = /^\d+(\.\d+)?\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i;
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
    if (!Number.isInteger(opts.threads) || opts.threads < 1) {
      throw new Error(`threads must be a whole number of at least 1`);
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

// A parquet path this module will put in a statement: absolute, existing,
// and free of glob characters, since read_parquet expands globs.
export async function validateParquetPath(path: string): Promise<void> {
  if (!path.startsWith("/")) {
    throw new Error(`Parquet path "${path}" must be absolute`);
  }
  if (GLOB_CHARACTERS.test(path)) {
    throw new Error(`Parquet path "${path}" must not contain glob characters`);
  }
  const info = await Deno.stat(path).catch(() => undefined);
  if (info === undefined || !info.isFile) {
    throw new Error(`Parquet path "${path}" is not an existing file`);
  }
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
  const connection = await instance.connect();
  try {
    return await fn(connection);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
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
