// Pins getCsvStreamComponents: the column-count check on whichever row
// fails it, the first data row included; a callback that throws rejects
// the stream with its own error and no later row is delivered; 500,000 rows
// arrive complete, in file order, each rowIndex its position. No database;
// the reader imports exposed_env_vars, so it runs with the .env the test
// task loads.
//
//   deno test -A --env-file server/tests/csv_stream_reader_test.ts

import { assert, assertEquals, assertRejects } from "@std/assert";
import { throwIfErrWithData } from "lib";
import {
  type CsvColumnValidation,
  getCsvStreamComponents,
  type StreamingCsvComponents,
} from "../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";

const tempPaths: string[] = [];

async function writeCsv(lines: string[]): Promise<string> {
  const csvPath = await Deno.makeTempFile({ suffix: ".csv" });
  tempPaths.push(csvPath);
  await Deno.writeTextFile(csvPath, lines.join("\n") + "\n");
  return csvPath;
}

async function openCsv(
  csvPath: string,
  columnValidation: CsvColumnValidation,
): Promise<StreamingCsvComponents> {
  const res = await getCsvStreamComponents(csvPath, columnValidation);
  throwIfErrWithData(res);
  return res.data;
}

async function readRows(
  lines: string[],
  columnValidation: CsvColumnValidation,
): Promise<string[][]> {
  const components = await openCsv(await writeCsv(lines), columnValidation);
  const rows: string[][] = [];
  await components.processRows((row) => {
    rows.push(row);
  });
  return rows;
}

// Spans several 2 MB chunks, so the callback's error has to cross a chunk
// boundary's await.
function largeCsvLines(nRows: number): string[] {
  const lines = ["id,facility,value"];
  for (let i = 0; i < nRows; i++) {
    lines.push(`${i},facility_${i},${i * 3}`);
  }
  return lines;
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

Deno.test("a callback that throws rejects the stream with its own error and stops delivery", async () => {
  const components = await openCsv(
    await writeCsv(largeCsvLines(200_000)),
    "strict",
  );
  let delivered = 0;
  await assertRejects(
    () =>
      components.processRows(async (_row, rowIndex) => {
        delivered++;
        await Promise.resolve();
        if (rowIndex === 1000) throw new Error("insert failed");
      }),
    Error,
    "insert failed",
  );
  assertEquals(delivered, 1001);
});

Deno.test("500,000 rows arrive complete, in file order, each rowIndex its position, in under 10 seconds", async () => {
  const nRows = 500_000;
  const components = await openCsv(
    await writeCsv(largeCsvLines(nRows)),
    "strict",
  );
  let expected = 0;
  const started = performance.now();
  await components.processRows((row, rowIndex) => {
    if (rowIndex !== expected || row[0] !== String(expected)) {
      throw new Error(
        `Row ${expected} arrived as rowIndex ${rowIndex} with id ${row[0]}`,
      );
    }
    expected++;
  });
  const elapsedMs = performance.now() - started;
  assertEquals(expected, nRows);
  assert(elapsedMs < 10_000, `took ${elapsedMs.toFixed(0)} ms`);
});

Deno.test("cleanup", async () => {
  for (const path of tempPaths) await Deno.remove(path);
});
