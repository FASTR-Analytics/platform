import { join } from "@std/path";
import {
  type DuckDBConnection,
  DuckDBInstance,
  type DuckDBValue,
} from "@duckdb/node-api";
import { _RUNS_DIR_PATH } from "../exposed_env_vars.ts";

// The DuckDB query engine for results-run parquet files (PLAN_RESULTS_RUNS §2.4).
// Serving model: a fresh in-memory instance per call (cold open→query→close is
// ~5 ms), read-only views over parquet, bounded memory. The Postgres→DuckDB
// dialect deltas are owned HERE, never in the S9 SQL builders:
//   - `SET integer_division = true` restores Postgres int/int truncation
//     (without it, period arithmetic puts August in Q4 — wrong data, no error).
//   - BIGINT/HUGEINT aggregate results arrive as JS BigInt; convertValue
//     resolves them to number (or throws outside the safe-integer range).
//   - Text ORDER BY is binary, not collation — option-list callers must
//     re-sort in TS.
//   - DuckDB group-by output order is nondeterministic run-to-run, and charts
//     with `sortIndicatorValues: "none"` render raw row order — the executor
//     pins a deterministic total order over every result set. Meaningful
//     ordering is the caller's job (as the option-list TS re-sort already is);
//     an ORDER BY inside the SQL still controls WHICH rows a LIMIT keeps.

// Sized empirically (review finding 11): the worst ordinary serving shape —
// a facility_name disaggregation over a 59.5M-row parquet, 1.92M groups —
// OOMs at 512MB (temp_directory or not, the grouped aggregate must fit),
// completes at 4GB in-memory in ~2s. temp_directory is the backstop for
// larger shapes; the cap is per-connection and queries peak far below it.
const DUCKDB_MEMORY_LIMIT = "4GB";

const SAFE_VIEW_NAME = /^[a-z_][a-z0-9_]*$/;

export type ParquetView = {
  viewName: string;
  parquetPath: string;
};

export type DuckDbRow = Record<string, string | number | boolean | null>;

export function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

export function duckDbSpillDirPath(): string {
  return join(_RUNS_DIR_PATH, ".duckdb-spill");
}

// Boot-time reset: DuckDB removes its spill files on clean close, but a
// crashed process leaves them behind — wipe and recreate the dir.
export async function resetDuckDbSpillDir(): Promise<void> {
  try {
    await Deno.remove(duckDbSpillDirPath(), { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }
  }
  await Deno.mkdir(duckDbSpillDirPath(), { recursive: true });
}

// Shared session settings for every DuckDB connection this app opens (the
// serving executor AND the parquet writer). DuckDB does NOT create a missing
// temp_directory — without the mkdir, spilling silently can't happen and a
// large query OOMs at the memory_limit (verified empirically).
export async function applyDuckDbSessionSettings(
  conn: DuckDBConnection,
): Promise<void> {
  await conn.run("SET integer_division = true");
  await conn.run(`SET memory_limit = '${DUCKDB_MEMORY_LIMIT}'`);
  await Deno.mkdir(duckDbSpillDirPath(), { recursive: true });
  await conn.run(
    `SET temp_directory = '${escapeSqlLiteral(duckDbSpillDirPath())}'`,
  );
}

export async function executeSqlOverParquet(
  views: ParquetView[],
  sql: string,
): Promise<DuckDbRow[]> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    await applyDuckDbSessionSettings(conn);
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
    return pinDeterministicRowOrder(reader.getRowObjects().map(convertRow));
  } finally {
    conn.disconnectSync();
    instance.closeSync();
  }
}

// Total order over all columns in result-schema order (code-unit string
// compare — determinism, not collation). Applied after LIMIT, so it never
// changes which rows a query returns.
function pinDeterministicRowOrder(rows: DuckDbRow[]): DuckDbRow[] {
  if (rows.length < 2) {
    return rows;
  }
  const keys = Object.keys(rows[0]);
  return rows.sort((a, b) => {
    for (const key of keys) {
      const cmp = compareCellValues(a[key], b[key]);
      if (cmp !== 0) {
        return cmp;
      }
    }
    return 0;
  });
}

function compareCellValues(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  const typeA = typeof a;
  const typeB = typeof b;
  if (typeA !== typeB) {
    return typeA < typeB ? -1 : 1;
  }
  if (typeA === "number") {
    const numA = a as number;
    const numB = b as number;
    if (Number.isNaN(numA)) {
      return Number.isNaN(numB) ? 0 : 1;
    }
    if (Number.isNaN(numB)) {
      return -1;
    }
    return numA < numB ? -1 : numA > numB ? 1 : 0;
  }
  return a < b ? -1 : 1;
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
