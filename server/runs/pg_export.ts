import { join } from "@std/path";
import { writeParquetFromCsv } from "../run_query/mod.ts";

// Exports rows to parquet with exact null fidelity: NULL is encoded as an
// unquoted sentinel and every real value is quoted, so '' and 'NA' text
// survive verbatim (allow_quoted_nulls=false on the DuckDB side).

const PG_NULL_SENTINEL = "__PG_NULL__";

export type ExportedColumn = { name: string; duckDbType: string };

// The wizard's dataset captures: instance-DB subsets already read into memory
// by prepare_inputs, never a whole table streamed off a cursor.
export async function exportRowsToParquet(
  rows: Record<string, unknown>[],
  columns: ExportedColumn[],
  parquetPath: string,
): Promise<void> {
  const csvPath = join(
    await Deno.makeTempDir({ prefix: "rows_export_" }),
    "rows.csv",
  );
  const file = await Deno.open(csvPath, { write: true, create: true, truncate: true });
  const writer = file.writable.getWriter();
  const enc = new TextEncoder();
  try {
    await writer.write(enc.encode(columns.map((c) => c.name).join(",") + "\n"));
    let chunk = "";
    for (const row of rows) {
      const fields = columns.map((c) => {
        const v = row[c.name];
        if (v === null || v === undefined) return PG_NULL_SENTINEL;
        return `"${String(v).replaceAll('"', '""')}"`;
      });
      chunk += fields.join(",") + "\n";
      if (chunk.length > 1_000_000) {
        await writer.write(enc.encode(chunk));
        chunk = "";
      }
    }
    if (chunk.length > 0) {
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
}
