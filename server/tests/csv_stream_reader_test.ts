// Pins the column-count check of getCsvStreamComponents on whichever row
// fails it, the first data row included. No database; the reader imports
// exposed_env_vars, so it runs with the .env the test task loads.
//
//   deno test -A --env-file server/tests/csv_stream_reader_test.ts

import { assertEquals, assertRejects } from "@std/assert";
import { throwIfErrWithData } from "lib";
import {
  type CsvColumnValidation,
  getCsvStreamComponents,
} from "../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";

const tempPaths: string[] = [];

async function readRows(
  lines: string[],
  columnValidation: CsvColumnValidation,
): Promise<string[][]> {
  const csvPath = await Deno.makeTempFile({ suffix: ".csv" });
  tempPaths.push(csvPath);
  await Deno.writeTextFile(csvPath, lines.join("\n") + "\n");
  const res = await getCsvStreamComponents(csvPath, columnValidation);
  throwIfErrWithData(res);
  const rows: string[][] = [];
  await res.data.processRows((row) => {
    rows.push(row);
  });
  return rows;
}

Deno.test("allow-fewer-columns: a first row with more columns than the header rejects", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "1,2,3,4,5"], "allow-fewer-columns"),
    Error,
    "Row 2 has 5 columns",
  );
});

Deno.test("allow-fewer-columns: a second row with more columns than the header rejects", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "1,2,3", "1,2,3,4,5"], "allow-fewer-columns"),
    Error,
    "Row 3 has 5 columns",
  );
});

Deno.test("strict: a first row with fewer columns than the header rejects", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "1,2"], "strict"),
    Error,
    "Row 2 has 2 columns",
  );
});

Deno.test("strict: a second row with fewer columns than the header rejects", async () => {
  await assertRejects(
    () => readRows(["a,b,c", "1,2,3", "1,2"], "strict"),
    Error,
    "Row 3 has 2 columns",
  );
});

Deno.test("allow-fewer-columns: a row with fewer columns than the header is delivered", async () => {
  assertEquals(await readRows(["a,b,c", "1,2"], "allow-fewer-columns"), [[
    "1",
    "2",
  ]]);
});

Deno.test("cleanup", async () => {
  for (const path of tempPaths) await Deno.remove(path);
});
