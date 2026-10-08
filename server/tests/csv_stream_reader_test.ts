// Pins the streaming CSV reader's column-count check as the
// getCsvStreamComponents bullet of SYSTEM_06_ingestion.md states it: a row
// with more columns than the header (under strict, a different count)
// rejects the stream naming the row, whichever row it is. No database; the
// reader reads the .env the test task loads.
//
//   deno test -A --env-file server/tests/csv_stream_reader_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import {
  type CsvColumnValidation,
  getCsvStreamComponents,
} from "../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";

async function readRows(
  lines: string[],
  columnValidation: CsvColumnValidation,
): Promise<string[][]> {
  const csvPath = await Deno.makeTempFile({ suffix: ".csv" });
  try {
    await Deno.writeTextFile(csvPath, lines.join("\n") + "\n");
    const res = await getCsvStreamComponents(csvPath, columnValidation);
    if (res.success === false) throw new Error(res.err);
    const rows: string[][] = [];
    await res.data.processRows((row) => {
      rows.push(row);
    });
    return rows;
  } finally {
    await Deno.remove(csvPath);
  }
}

Deno.test("a first row with more columns than the header rejects naming the row", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "1,2,3,4,5", "6,7,8"], "allow-fewer-columns"),
    Error,
    "Row 2 has 5 columns but header only has 3 columns",
  );
});

Deno.test("a second row with more columns than the header rejects naming the row", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "6,7,8", "1,2,3,4,5"], "allow-fewer-columns"),
    Error,
    "Row 3 has 5 columns but header only has 3 columns",
  );
});

Deno.test("under strict, a first row with fewer columns rejects naming the row", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "1,2", "6,7,8"], "strict"),
    Error,
    "Row 2 has 2 columns but header has 3 columns",
  );
});

Deno.test("under strict, a second row with fewer columns rejects naming the row", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "6,7,8", "1,2"], "strict"),
    Error,
    "Row 3 has 2 columns but header has 3 columns",
  );
});

Deno.test("a row with fewer columns is delivered when fewer are allowed", async () => {
  assertEquals(
    await readRows(["a,b,c", "1,2", "6,7,8"], "allow-fewer-columns"),
    [["1", "2"], ["6", "7", "8"]],
  );
});
