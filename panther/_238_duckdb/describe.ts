// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { inferLongTableSchema } from "./deps.ts";
import type {
  DescribedColumn,
  DuckDBConnection,
  InferConventions,
  LongTableSchema,
} from "./deps.ts";
import {
  describeStatement,
  readParquet,
  validateParquetPath,
  withConnection,
} from "./instance.ts";
import { normalizeDuckDbType } from "./physical_types.ts";
import { quoteIdentifier } from "./_sql/quote.ts";

export type ParquetDescription = {
  columns: DescribedColumn[];
  rowCount: number;
};

const SAMPLE_SIZE = 20;

export async function describeParquet(
  path: string,
): Promise<ParquetDescription> {
  await validateParquetPath(path);
  return await withConnection((connection) => describeWith(connection, path));
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

// The described columns with up to 20 distinct non-null values sampled per
// integer column, then panther's inference over them.
export async function describeLongTable(
  path: string,
  conventions?: InferConventions,
): Promise<LongTableSchema> {
  await validateParquetPath(path);
  return await withConnection(async (connection) => {
    const { columns } = await describeWith(connection, path);
    for (const column of columns) {
      if (column.type !== "integer") {
        continue;
      }
      const ref = quoteIdentifier(column.name);
      const reader = await connection.runAndReadAll(
        `SELECT DISTINCT ${ref} AS v FROM ${
          readParquet(path)
        } WHERE ${ref} IS NOT NULL LIMIT ${SAMPLE_SIZE}`,
      );
      column.sample = reader.getRowObjects().map((row) => Number(row.v));
    }
    return inferLongTableSchema(columns, conventions);
  });
}
