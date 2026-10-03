// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  foldName,
  getTimeConventions,
  inferLongTableSchema,
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
