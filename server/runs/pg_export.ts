import { join } from "@std/path";
import type { Sql } from "postgres";
import { writeParquetFromCsv, duckDbTypeForPgType } from "../run_query/mod.ts";

// Exports one Postgres table to parquet with exact null fidelity: NULL is
// encoded as an unquoted sentinel and every real value is quoted, so '' and
// 'NA' text survive verbatim (allow_quoted_nulls=false on the DuckDB side).
// Streams via a cursor — postgres.js's COPY .readable() buffers the whole
// result and OOMs on large tables.

const PG_NULL_SENTINEL = "__PG_NULL__";
const EXPORT_BATCH_SIZE = 20000;

export type ExportedColumn = { name: string; duckDbType: string };

export async function exportPgTableToParquet(
  db: Sql,
  tableName: string,
  parquetPath: string,
): Promise<ExportedColumn[] | undefined> {
  const cols = await db<{ column_name: string; data_type: string }[]>`
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = ${tableName}
ORDER BY ordinal_position
`;
  if (cols.length === 0) {
    return undefined;
  }
  const columns: ExportedColumn[] = cols.map((c) => ({
    name: c.column_name,
    duckDbType: duckDbTypeForPgType(c.data_type),
  }));

  const csvPath = join(
    await Deno.makeTempDir({ prefix: "pg_export_" }),
    `${tableName}.csv`,
  );
  const file = await Deno.open(csvPath, { write: true, create: true, truncate: true });
  const writer = file.writable.getWriter();
  const enc = new TextEncoder();
  try {
    await writer.write(enc.encode(columns.map((c) => c.name).join(",") + "\n"));
    const selectList = columns.map((c) => `"${c.name}"`).join(", ");
    const cursor = db
      .unsafe(`SELECT ${selectList} FROM "${tableName}"`)
      .cursor(EXPORT_BATCH_SIZE);
    for await (const rows of cursor) {
      let chunk = "";
      for (const row of rows as Record<string, unknown>[]) {
        const fields = columns.map((c) => {
          const v = row[c.name];
          if (v === null || v === undefined) return PG_NULL_SENTINEL;
          return `"${String(v).replaceAll('"', '""')}"`;
        });
        chunk += fields.join(",") + "\n";
      }
      await writer.write(enc.encode(chunk));
    }
  } finally {
    await writer.close();
  }

  await writeParquetFromCsv({
    csvPath,
    parquetPath,
    columns,
    nullStrings: [PG_NULL_SENTINEL],
  });
  await Deno.remove(csvPath);
  return columns;
}
