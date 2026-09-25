// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DuckDBConnection, LongTableColumnType } from "./deps.ts";
import { describeStatement, withConnection } from "./instance.ts";
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
// CSV header must be declared and is read as that type.
export async function writeParquetFromCsv(
  opts: WriteParquetFromCsvOptions,
): Promise<ParquetDescription> {
  if (!opts.csv.startsWith("/") || !opts.parquet.startsWith("/")) {
    throw new Error("CSV and parquet paths must be absolute");
  }
  const csv = quoteLiteral(opts.csv);
  return await withConnection(async (connection) => {
    const types = opts.columns === undefined
      ? opts.types ?? {}
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
    if (opts.nullStrings !== undefined && opts.nullStrings.length > 0) {
      options.push(
        `nullstr = [${opts.nullStrings.map(quoteLiteral).join(", ")}]`,
      );
    }
    const select = `SELECT * FROM read_csv(${csv}, ${options.join(", ")})`;
    const copied = await connection.runAndReadAll(
      `COPY (${select}) TO ${quoteLiteral(opts.parquet)} (FORMAT PARQUET)`,
    );
    const rowCount = Number(copied.getRowObjects()[0]?.Count ?? 0);
    const columns = (await describeStatement(
      connection,
      `SELECT * FROM read_parquet(${quoteLiteral(opts.parquet)})`,
    )).map((c) => ({
      name: c.name,
      type: normalizeDuckDbType(c.rawType),
      rawType: c.rawType,
    }));
    return { columns, rowCount };
  });
}

async function declaredTypes(
  connection: DuckDBConnection,
  csv: string,
  columns: { name: string; type: LongTableColumnType }[],
): Promise<Record<string, string>> {
  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column.name.toLowerCase())) {
      throw new Error(
        `Column "${column.name}" is declared twice (names are case-insensitive)`,
      );
    }
    seen.add(column.name.toLowerCase());
  }
  const headers = await describeStatement(
    connection,
    `SELECT * FROM read_csv(${csv}, header = true, all_varchar = true)`,
  );
  const declared = new Map(columns.map((c) => [c.name, c.type]));
  for (const header of headers) {
    if (!declared.has(header.name)) {
      throw new Error(`CSV column "${header.name}" is not declared`);
    }
  }
  return Object.fromEntries(
    columns.map((c) => [c.name, DUCKDB_TYPE[c.type]]),
  );
}
