// Pins PLAN_A6 ruling 2: CSV staging resolves nothing. Each value the
// file's indicator column says is looked up in the run's mapping: a value
// mapped to a data id lands under it, a value mapped to null is counted in
// skippedByMapping and dropped, and a value absent from the mapping fails
// the run. The value is derived from the cell exactly as the scan derives
// it (trimmed), so the scan's list is the mapping's key set. Runs the real
// stage leg and the real scan on a throwaway database built from
// _main_database.sql on the dev postgres (the .env the test task loads),
// dropped afterwards.
//
//   deno test -A --env-file server/tests/csv_mapping_staging_test.ts

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { encodeRawCsvHeader, type HmisCsvMapping } from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  hmisCsvStagingTableNames,
  stageHmisCsvIntoTables,
} from "../worker_routines/import_hmis_data_csv/stage_csv.ts";
import { scanHmisCsvIndicatorValues } from "../worker_routines/import_hmis_data_csv/scan_indicator_values.ts";

const SCHEMA_PATH = new URL("../db/instance/_main_database.sql", import.meta.url)
  .pathname;
const DB_PREFIX = "mapping_test_";

const ELEMENT = "AbCdEfGhIj1";
const OPD_KEY = "u_opd";

const admin = getPgConnection("postgres", { max: 1 });
for (
  const { datname } of await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE ${DB_PREFIX + "%"}
  `
) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
}
const dbName = `${DB_PREFIX}${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${dbName}`);
const db = getPgConnection(dbName, { max: 2 });
await db.file(SCHEMA_PATH);

await db`INSERT INTO admin_areas_hmis_1 (admin_area_1) VALUES ('A1')`;
await db`INSERT INTO admin_areas_hmis_2 (admin_area_2, admin_area_1) VALUES ('A2', 'A1')`;
await db`INSERT INTO admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1) VALUES ('A3', 'A2', 'A1')`;
await db`INSERT INTO admin_areas_hmis_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES ('A4', 'A3', 'A2', 'A1')`;
await db`
  INSERT INTO facilities_hmis (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1)
  VALUES ('FacAaaaaaa1', 'A4', 'A3', 'A2', 'A1')
`;
await db`
  INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type, data_id, expression)
  VALUES
    ('anc1', 'ANC 1', 'dhis2_element', ${ELEMENT}, NULL),
    ('opd', 'OPD', 'uploaded', ${OPD_KEY}, NULL)
`;

const COLUMNS = {
  facility_id: encodeRawCsvHeader(0, "facility"),
  data_id: encodeRawCsvHeader(1, "indicator"),
  period_id: encodeRawCsvHeader(2, "period"),
  count: encodeRawCsvHeader(3, "count"),
};

let runId = 0;

async function withCsv<T>(
  values: string[],
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const path = await Deno.makeTempFile({ prefix: "mapping_", suffix: ".csv" });
  // One month per row, so the dedup step (facility x data id x month) keeps
  // every row and the counts below are the file's.
  const lines = ["facility,indicator,period,count"];
  values.forEach((value, i) =>
    lines.push(`FacAaaaaaa1,${value},2024${String((i % 12) + 1).padStart(2, "0")},${i + 1}`)
  );
  await Deno.writeTextFile(path, lines.join("\n") + "\n");
  try {
    return await fn(path);
  } finally {
    await Deno.remove(path);
  }
}

async function stage(values: string[], mapping: HmisCsvMapping) {
  runId++;
  return await withCsv(values, async (path) => {
    const result = await stageHmisCsvIntoTables({
      importDb: db,
      csvFilePath: path,
      csvFileName: "test.csv",
      columns: COLUMNS,
      mapping,
      runId,
      onProgress: () => {},
    });
    const staged = await db<{ data_id: string; count: number }[]>`
      SELECT data_id, count FROM ${db(hmisCsvStagingTableNames(runId).final)} ORDER BY data_id, count
    `;
    await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).final}`);
    return { result, staged: staged.map((r) => ({ data_id: r.data_id, count: r.count })) };
  });
}

Deno.test("a mapped value lands under the data id the mapping names, whatever the value says", async () => {
  const { result, staged } = await stage(["ANC first", "OPD_VISITS", "anc1"], {
    "ANC first": ELEMENT,
    OPD_VISITS: OPD_KEY,
    anc1: ELEMENT,
  });
  assertEquals(staged, [
    { data_id: ELEMENT, count: 1 },
    { data_id: ELEMENT, count: 3 },
    { data_id: OPD_KEY, count: 2 },
  ]);
  assertEquals(result.finalStagingRowCount, 3);
  assertEquals(result.validation!.skippedByMapping, { rowsDropped: 0 });
});

Deno.test("a value mapped to null is counted in skippedByMapping and dropped", async () => {
  const { result, staged } = await stage(["SKIP_ME", "OPD_VISITS", "SKIP_ME"], {
    SKIP_ME: null,
    OPD_VISITS: OPD_KEY,
  });
  assertEquals(staged, [{ data_id: OPD_KEY, count: 2 }]);
  assertEquals(result.finalStagingRowCount, 1);
  assertEquals(result.validation!.skippedByMapping, { rowsDropped: 2 });
});

Deno.test("a value absent from the mapping fails the run, naming it", async () => {
  const err = await assertRejects(() => stage(["OPD_VISITS", "NOT_IN_MAPPING"], { OPD_VISITS: OPD_KEY }));
  const message = err instanceof Error ? err.message : String(err);
  assertStringIncludes(message, '"NOT_IN_MAPPING"');
  assertStringIncludes(message, "the mapping does not name");
  await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).mapping}`);
  await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).validFacilities}`);
});

Deno.test("the scan and the stage leg derive the value the same way: a padded cell is the trimmed value", async () => {
  const values = [" anc1", "anc1 ", "anc1", "OPD_VISITS"];
  const scanned = await withCsv(values, (path) =>
    scanHmisCsvIndicatorValues({ csvFilePath: path, columns: COLUMNS }));
  assertEquals(scanned, [
    { value: "anc1", rowCount: 3 },
    { value: "OPD_VISITS", rowCount: 1 },
  ]);
  const { staged } = await stage(values, { anc1: ELEMENT, OPD_VISITS: OPD_KEY });
  assertEquals(staged, [
    { data_id: ELEMENT, count: 1 },
    { data_id: ELEMENT, count: 2 },
    { data_id: ELEMENT, count: 3 },
    { data_id: OPD_KEY, count: 4 },
  ]);
});

Deno.test("the scan refuses above the distinct-value cap, naming the count and the column", async () => {
  const values = Array.from({ length: 2001 }, (_, i) => `v${i}`);
  const err = await assertRejects(() =>
    withCsv(values, (path) => scanHmisCsvIndicatorValues({ csvFilePath: path, columns: COLUMNS }))
  );
  const message = err instanceof Error ? err.message : String(err);
  assertStringIncludes(message, "2001 distinct values");
  assertStringIncludes(message, COLUMNS.data_id);
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
