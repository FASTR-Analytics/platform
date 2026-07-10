import { DuckDBInstance } from "@duckdb/node-api";
import { escapeSqlLiteral } from "./duckdb_executor.ts";

const SAFE_COLUMN_NAME = /^[a-z_][a-z0-9_]*$/;

export type CsvColumn = {
  name: string;
  duckDbType: string;
};

// Builds one parquet file from one CSV with an explicit (never inferred)
// schema — declared types are load-bearing for cross-run schema stability
// (PLAN_RESULTS_RUNS §2.3). `columns` must match the CSV's column order.
// `nullStrings` is caller-owned: raw R output uses 'NA'; a Postgres-sourced
// export should use a dedicated sentinel so real '' and 'NA' text survive.
// Quoted CSV values are never treated as null (matches Postgres COPY).
export async function writeParquetFromCsv(opts: {
  csvPath: string;
  parquetPath: string;
  columns: CsvColumn[];
  nullStrings: string[];
}): Promise<void> {
  if (opts.columns.length === 0) {
    throw new Error(`No columns given for CSV→parquet: ${opts.csvPath}`);
  }
  const columnSpec = opts.columns
    .map((col) => {
      if (!SAFE_COLUMN_NAME.test(col.name)) {
        throw new Error(`Unsafe CSV column name: ${col.name}`);
      }
      return `'${col.name}': '${escapeSqlLiteral(col.duckDbType)}'`;
    })
    .join(", ");
  const nullStrSpec = opts.nullStrings
    .map((s) => `'${escapeSqlLiteral(s)}'`)
    .join(", ");

  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    await conn.run(`SET memory_limit = '512MB'`);
    await conn.run(
      `COPY (SELECT * FROM read_csv('${escapeSqlLiteral(opts.csvPath)}',
        header=true,
        nullstr=[${nullStrSpec}],
        allow_quoted_nulls=false,
        columns={${columnSpec}}
      )) TO '${escapeSqlLiteral(opts.parquetPath)}' (FORMAT PARQUET)`,
    );
  } finally {
    conn.disconnectSync();
    instance.closeSync();
  }
}
