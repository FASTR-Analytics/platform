import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";

// The DuckDB query engine for results-run parquet files (PLAN_RESULTS_RUNS §2.4).
// Serving model: a fresh in-memory instance per call (cold open→query→close is
// ~5 ms), read-only views over parquet, bounded memory. The Postgres→DuckDB
// dialect deltas are owned HERE, never in the S9 SQL builders:
//   - `SET integer_division = true` restores Postgres int/int truncation
//     (without it, period arithmetic puts August in Q4 — wrong data, no error).
//   - BIGINT/HUGEINT aggregate results arrive as JS BigInt; convertValue
//     resolves them to number (or throws outside the safe-integer range).
//   - Text ORDER BY is binary, not collation — option-list callers must
//     re-sort in TS; row-set consumers are order-insensitive already.

const DUCKDB_MEMORY_LIMIT = "512MB";

const SAFE_VIEW_NAME = /^[a-z_][a-z0-9_]*$/;

export type ParquetView = {
  viewName: string;
  parquetPath: string;
};

export type DuckDbRow = Record<string, string | number | boolean | null>;

export function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

export async function executeSqlOverParquet(
  views: ParquetView[],
  sql: string,
): Promise<DuckDbRow[]> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    await conn.run("SET integer_division = true");
    await conn.run(`SET memory_limit = '${DUCKDB_MEMORY_LIMIT}'`);
    for (const view of views) {
      if (!SAFE_VIEW_NAME.test(view.viewName)) {
        throw new Error(`Unsafe DuckDB view name: ${view.viewName}`);
      }
      await conn.run(
        `CREATE VIEW ${view.viewName} AS SELECT * FROM read_parquet('${
          escapeSqlLiteral(view.parquetPath)
        }')`,
      );
    }
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjects().map(convertRow);
  } finally {
    conn.disconnectSync();
    instance.closeSync();
  }
}

function convertRow(row: Record<string, DuckDBValue>): DuckDbRow {
  const out: DuckDbRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = convertValue(key, value);
  }
  return out;
}

function convertValue(
  columnName: string,
  value: DuckDBValue,
): string | number | boolean | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    if (!Number.isSafeInteger(asNumber)) {
      throw new Error(
        `DuckDB BIGINT value out of safe integer range in column ${columnName}: ${value}`,
      );
    }
    return asNumber;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error(
    `Unsupported DuckDB value type in column ${columnName}: ${typeof value}`,
  );
}
