// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { caseHint, foldName } from "./deps.ts";
import type { DuckDBConnection, LongTableColumnType } from "./deps.ts";
import {
  describeStatement,
  readParquet,
  requireFile,
  requirePlainPath,
  withConnection,
} from "./instance.ts";
import { normalizeDuckDbType } from "./physical_types.ts";
import { quoteLiteral } from "./_sql/quote.ts";
import type { ParquetDescription } from "./describe.ts";

export type WriteParquetFromCsvOptions = {
  csv: string;
  parquet: string;
  columns?: { name: string; type: LongTableColumnType }[];
  types?: Record<string, string>;
  nullStrings?: string[];
};

const DUCKDB_TYPE: Record<LongTableColumnType, string> = {
  text: "VARCHAR",
  integer: "BIGINT",
  number: "DOUBLE",
};

// CSV to parquet through DuckDB, file to file. `columns` absent means
// DuckDB's inference with `types` as a partial override; present means every
// CSV header must be declared and is read as that type. An empty cell is
// always NULL; `nullStrings` adds to that. The parquet is written beside its
// target under a name this module owns and renamed into place, so a failed
// write leaves nothing and an existing target is replaced whole.
export async function writeParquetFromCsv(
  opts: WriteParquetFromCsvOptions,
): Promise<ParquetDescription> {
  requirePlainPath(opts.csv, "CSV");
  requirePlainPath(opts.parquet, "Parquet");
  if (opts.csv === opts.parquet) {
    throw new Error("The CSV and the parquet are the same path");
  }
  if (opts.columns !== undefined && opts.types !== undefined) {
    throw new Error(
      "`types` is an override of inference; omit it with `columns`",
    );
  }
  await requireFile(opts.csv, "CSV");
  await requireHeaderLine(opts.csv);
  const csv = quoteLiteral(opts.csv);
  const partial = `${opts.parquet}.${crypto.randomUUID()}.partial`;
  try {
    const description = await withConnection(async (connection) => {
      const types = opts.columns === undefined
        ? checkedTypes(opts.types ?? {})
        : await declaredTypes(connection, csv, opts.columns);
      const options = ["header = true", "allow_quoted_nulls = false"];
      if (Object.keys(types).length > 0) {
        options.push(
          `types = {${
            Object.entries(types)
              .map(([name, type]) =>
                `${quoteLiteral(name)}: ${quoteLiteral(type)}`
              )
              .join(", ")
          }}`,
        );
      }
      const nullStrings = [...new Set(["", ...(opts.nullStrings ?? [])])];
      options.push(`nullstr = [${nullStrings.map(quoteLiteral).join(", ")}]`);
      const select = `SELECT * FROM read_csv(${csv}, ${options.join(", ")})`;
      // DuckDB's own temp file is tmp_<name> in the same directory, which
      // would overwrite and consume a parquet of that name.
      const copied = await connection.runAndReadAll(
        `COPY (${select}) TO ${
          quoteLiteral(partial)
        } (FORMAT PARQUET, USE_TMP_FILE false)`,
      );
      const rowCount = Number(copied.getRowObjects()[0]?.Count ?? 0);
      const columns = (await describeStatement(
        connection,
        `SELECT * FROM ${readParquet(partial)}`,
      )).map((c) => ({
        name: c.name,
        type: normalizeDuckDbType(c.rawType),
        rawType: c.rawType,
      }));
      return { columns, rowCount };
    });
    await Deno.rename(partial, opts.parquet);
    return description;
  } catch (cause) {
    await Deno.remove(partial).catch(() => {});
    throw cause;
  }
}

// DuckDB reads a file with no header line as a table with one invented
// column, column0.
async function requireHeaderLine(path: string): Promise<void> {
  const file = await Deno.open(path, { read: true });
  try {
    const head = new Uint8Array(4096);
    const read = await file.read(head) ?? 0;
    const text = new TextDecoder().decode(head.subarray(0, read));
    if (text.trim().length === 0) {
      throw new Error(`CSV "${path}" has no header line`);
    }
  } finally {
    file.close();
  }
}

function requireDistinct(names: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(foldName(name))) {
      throw new Error(
        `Column "${name}" is declared twice (names are case-insensitive)`,
      );
    }
    seen.add(foldName(name));
  }
}

function checkedTypes(types: Record<string, string>): Record<string, string> {
  requireDistinct(Object.keys(types));
  return types;
}

// The declared columns and the CSV's headers must be the same names, each
// spelled as the file spells it.
async function declaredTypes(
  connection: DuckDBConnection,
  csv: string,
  columns: { name: string; type: LongTableColumnType }[],
): Promise<Record<string, string>> {
  requireDistinct(columns.map((c) => c.name));
  const headers = (await describeStatement(
    connection,
    `SELECT * FROM read_csv(${csv}, header = true, all_varchar = true)`,
  )).map((h) => h.name);
  const declared = columns.map((c) => c.name);
  for (const header of headers) {
    if (!declared.includes(header)) {
      throw new Error(
        `CSV column "${header}" is not declared${caseHint(header, declared)}`,
      );
    }
  }
  for (const name of declared) {
    if (!headers.includes(name)) {
      throw new Error(`Declared column "${name}" is not in the CSV`);
    }
  }
  return Object.fromEntries(
    columns.map((c) => [c.name, DUCKDB_TYPE[c.type]]),
  );
}
