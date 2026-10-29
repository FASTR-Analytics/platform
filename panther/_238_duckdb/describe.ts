// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  foldName,
  getTimeConventions,
  inferLongTableSchema,
  isOutsideSafeRange,
  validateLongTableSchema,
} from "./deps.ts";
import type {
  DescribedColumn,
  DuckDBConnection,
  InferConventions,
  LongTableSchema,
} from "./deps.ts";
import {
  describeStatement,
  readIntegerBounds,
  readParquet,
  readTimeValues,
  validateParquetPath,
  withConnection,
} from "./instance.ts";
import { normalizeDuckDbType } from "./physical_types.ts";

export type ParquetDescription = {
  columns: DescribedColumn[];
  rowCount: number;
};

export async function describeParquet(
  path: string,
): Promise<ParquetDescription> {
  const resolved = await validateParquetPath(path);
  return await withConnection((connection) =>
    describeWith(connection, resolved)
  );
}

async function describeWith(
  connection: DuckDBConnection,
  path: string,
): Promise<ParquetDescription> {
  const columns = (await describeStatement(
    connection,
    `SELECT * FROM ${readParquet(path)}`,
  )).map((c): DescribedColumn => ({
    name: c.name,
    type: normalizeDuckDbType(c.rawType),
    rawType: c.rawType,
  }));
  const count = await connection.runAndReadAll(
    `SELECT COUNT(*) AS n FROM ${readParquet(path)}`,
  );
  return { columns, rowCount: Number(count.getRowObjects()[0]?.n ?? 0) };
}

// The described columns, with the distinct values of each convention-named
// integer column (a time column candidate), then panther's inference over
// them. The schema returned is one validateLongTableSchema accepts.
export async function describeLongTable(
  given: string,
  conventions?: InferConventions,
): Promise<LongTableSchema> {
  const path = await validateParquetPath(given);
  const candidates = new Set(
    Object.keys(getTimeConventions(conventions)).map(foldName),
  );
  const schema = await withConnection(async (connection) => {
    const { columns } = await describeWith(connection, path);
    await retypeWideIntegers(connection, columns, readParquet(path));
    for (const column of columns) {
      if (column.type === "integer" && candidates.has(foldName(column.name))) {
        column.sample = await readTimeValues(
          connection,
          column.name,
          readParquet(path),
        );
      }
    }
    return inferLongTableSchema(columns, conventions);
  });
  validateLongTableSchema(schema);
  return schema;
}

// Only BIGINT and UBIGINT can hold an integer a JSON cell cannot carry; every
// narrower type fits. Such a column is described as text, so inference makes
// it a dimension rather than a value and the view casts it, which keeps an id
// of 19 digits exact. The bounds come from the parquet's statistics, and the
// raw type still says what the file holds.
const WIDE_INTEGER_TYPES = new Set(["BIGINT", "UBIGINT"]);

async function retypeWideIntegers(
  connection: DuckDBConnection,
  columns: DescribedColumn[],
  source: string,
): Promise<void> {
  const wide = columns.filter((c) =>
    WIDE_INTEGER_TYPES.has(c.rawType.toUpperCase())
  );
  if (wide.length === 0) {
    return;
  }
  const bounds = await readIntegerBounds(
    connection,
    wide.map((c) => c.name),
    source,
  );
  for (const column of wide) {
    if (bounds.get(column.name)?.some(isOutsideSafeRange) === true) {
      column.type = "text";
    }
  }
}
