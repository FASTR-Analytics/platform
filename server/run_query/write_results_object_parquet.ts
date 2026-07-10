import { DuckDBInstance } from "@duckdb/node-api";
import { escapeSqlLiteral } from "./duckdb_executor.ts";

// Builds the normalized query-store parquet for one results object from its
// raw R output CSV — the finalize step of PLAN_RESULTS_RUNS §2.3, reproducing
// exactly the four semantic normalizations Postgres ingest applies
// (storeResultsObject in run_module_iterator.ts — the two must not drift):
//   1. 'NA' → NULL (unquoted only, matching Postgres COPY)
//   2. schema = CSV headers ∩ declared columns, with DECLARED types (an
//      undeclared header is a hard error; types are never inferred)
//   3. drop redundant period columns and enabled facility columns
//   4. physical quarter_id normalized YYYY0Q (6-digit) → YYYYQ (5-digit)

const SAFE_COLUMN_NAME = /^[a-z_][a-z0-9_]*$/;

// The authored createTableStatementPossibleColumns vocabulary is closed:
// TEXT / INTEGER / NUMERIC, each optionally NOT NULL. NUMERIC → DOUBLE by
// decision (PLAN_RESULTS_RUNS §3.3).
export function duckDbTypeForDeclaredColumnType(declared: string): string {
  const base = declared.replace(/\s+NOT\s+NULL\s*$/i, "").trim().toUpperCase();
  switch (base) {
    case "TEXT":
      return "VARCHAR";
    case "INTEGER":
      return "INTEGER";
    case "NUMERIC":
      return "DOUBLE";
    default:
      throw new Error(`Unknown declared results-object column type: ${declared}`);
  }
}

export async function writeNormalizedResultsObjectParquet(opts: {
  csvPath: string;
  parquetPath: string;
  csvHeaders: string[];
  declaredColumns: Record<string, string>;
  columnsToExclude: string[];
}): Promise<void> {
  const undeclaredHeaders = opts.csvHeaders.filter(
    (h) => opts.declaredColumns[h] === undefined,
  );
  if (undeclaredHeaders.length > 0) {
    throw new Error(
      `CSV headers not found in table definition: ${undeclaredHeaders.join(", ")}`,
    );
  }

  const columnSpec = opts.csvHeaders
    .map((header) => {
      if (!SAFE_COLUMN_NAME.test(header)) {
        throw new Error(`Unsafe CSV column name: ${header}`);
      }
      return `'${header}': '${duckDbTypeForDeclaredColumnType(opts.declaredColumns[header])}'`;
    })
    .join(", ");

  const keptColumns = opts.csvHeaders.filter(
    (h) => !opts.columnsToExclude.includes(h),
  );
  if (keptColumns.length === 0) {
    throw new Error(`No columns left after exclusions for ${opts.csvPath}`);
  }
  const selectList = keptColumns
    .map((col) =>
      col === "quarter_id"
        ? `(CASE WHEN quarter_id >= 100000 THEN (quarter_id / 100) * 10 + (quarter_id % 100) ELSE quarter_id END) AS quarter_id`
        : col,
    )
    .join(", ");

  const tmpPath = `${opts.parquetPath}.tmp`;
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    await conn.run("SET integer_division = true");
    await conn.run(`SET memory_limit = '512MB'`);
    await conn.run(
      `COPY (SELECT ${selectList} FROM read_csv('${escapeSqlLiteral(opts.csvPath)}',
        header=true,
        nullstr='NA',
        allow_quoted_nulls=false,
        columns={${columnSpec}}
      )) TO '${escapeSqlLiteral(tmpPath)}' (FORMAT PARQUET)`,
    );
  } finally {
    conn.disconnectSync();
    instance.closeSync();
  }
  await Deno.rename(tmpPath, opts.parquetPath);
}
