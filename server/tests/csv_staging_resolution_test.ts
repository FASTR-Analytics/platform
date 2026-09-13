// Pins PLAN_A5 ruling 6: CSV staging resolves a file value two ways. A value
// that is an indicator's data id lands under it; otherwise a value that is
// the id of an indicator with rows and a data id lands under that data id;
// a value that is one indicator's data id and another's id, whatever that
// other's type, is refused with both named; an Uploaded indicator's own id
// with no data id (the adopt case) and a value matching nothing are held as
// unknown. Runs the real
// stage leg on a throwaway database built from _main_database.sql on the
// dev postgres (the .env the test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/csv_staging_resolution_test.ts

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { encodeRawCsvHeader } from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  hmisCsvStagingTableNames,
  stageHmisCsvIntoTables,
} from "../worker_routines/import_hmis_data_csv/stage_csv.ts";

const SCHEMA_PATH = new URL("../db/instance/_main_database.sql", import.meta.url)
  .pathname;
const DB_PREFIX = "staging_test_";

const ELEMENT = "AbCdEfGhIj1";

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

// The dictionary every case stages against: an element (data id ELEMENT),
// an Uploaded with a data id, an Uploaded with none, a sum and a derived,
// plus two shadows of a rename: `old_name` is the data id of `renamed` and
// the id of a later Uploaded indicator with a data id of its own;
// `old_empty` is the data id of `renamed2` and the id of a later Uploaded
// indicator with no data id.
await db`
  INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type, data_id, expression)
  VALUES
    ('anc1', 'ANC 1', 'dhis2_element', ${ELEMENT}, NULL),
    ('opd', 'OPD', 'uploaded', 'OPD_FILE', NULL),
    ('empty', 'Empty', 'uploaded', NULL, NULL),
    ('total', 'Total', 'sum', NULL, NULL),
    ('rate', 'Rate', 'derived', NULL, 'anc1 / opd'),
    ('renamed', 'Renamed', 'uploaded', 'old_name', NULL),
    ('old_name', 'Newer', 'uploaded', 'NEWER_FILE', NULL),
    ('renamed2', 'Renamed 2', 'uploaded', 'old_empty', NULL),
    ('old_empty', 'Newer, empty', 'uploaded', NULL, NULL)
`;
await db`UPDATE indicators SET format_as = 'percent' WHERE indicator_common_id = 'rate'`;
await db`INSERT INTO indicator_sum_members (sum_id, member_id) VALUES ('total', 'anc1'), ('total', 'opd')`;

let runId = 0;

async function stage(values: string[]) {
  runId++;
  const path = await Deno.makeTempFile({ prefix: "staging_", suffix: ".csv" });
  const lines = ["facility,indicator,period,count"];
  values.forEach((value, i) => lines.push(`FacAaaaaaa1,${value},202401,${i + 1}`));
  await Deno.writeTextFile(path, lines.join("\n") + "\n");
  try {
    const result = await stageHmisCsvIntoTables({
      importDb: db,
      csvFilePath: path,
      csvFileName: "test.csv",
      // The wizard's Columns step sends encoded headers.
      columns: {
        facility_id: encodeRawCsvHeader(0, "facility"),
        data_id: encodeRawCsvHeader(1, "indicator"),
        period_id: encodeRawCsvHeader(2, "period"),
        count: encodeRawCsvHeader(3, "count"),
      },
      runId,
      onProgress: () => {},
    });
    const staged = await db<{ data_id: string; count: number }[]>`
      SELECT data_id, count FROM ${db(hmisCsvStagingTableNames(runId).final)} ORDER BY data_id, count
    `;
    await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).final}`);
    return { result, staged: staged.map((r) => ({ data_id: r.data_id, count: r.count })) };
  } finally {
    await Deno.remove(path);
  }
}

Deno.test("a data id match lands under it; an indicator id match lands under that indicator's data id", async () => {
  const { result, staged } = await stage([ELEMENT, "OPD_FILE", "opd", "anc1"]);
  assertEquals(staged, [
    { data_id: ELEMENT, count: 1 },
    { data_id: ELEMENT, count: 4 },
    { data_id: "OPD_FILE", count: 2 },
    { data_id: "OPD_FILE", count: 3 },
  ]);
  const unknown = result.validation!.unknownIndicators;
  assertEquals([unknown.total, unknown.sample.length, unknown.ids, unknown.rowsDropped], [0, 0, [], 0]);
  assertEquals(result.finalStagingRowCount, 4);
});

Deno.test("an Uploaded indicator's id with no data id is held (the adopt case), as is a value matching nothing", async () => {
  const { result, staged } = await stage(["empty", "NOTHING", "OPD_FILE"]);
  assertEquals(staged, [{ data_id: "OPD_FILE", count: 3 }]);
  assertEquals(result.validation!.unknownIndicators.ids!.toSorted(), ["NOTHING", "empty"]);
  assertEquals(result.validation?.unknownIndicators.total, 2);
  assertEquals(result.validation?.unknownIndicators.rowsDropped, 2);
  assertEquals(
    result.validation?.unknownIndicators.sample.map((s) => s.data_id).toSorted(),
    ["NOTHING", "empty"],
  );
});

Deno.test("a sum's or a derived's id is unknown: neither has rows", async () => {
  const { result, staged } = await stage(["total", "rate"]);
  assertEquals(staged, []);
  assertEquals(result.validation!.unknownIndicators.ids!.toSorted(), ["rate", "total"]);
});

Deno.test("a value that is one indicator's data id and another's id is refused with both named", async () => {
  const err = await assertRejects(() => stage(["old_name", "OPD_FILE"]));
  const message = err instanceof Error ? err.message : String(err);
  assertStringIncludes(message, '"old_name" is the data id of renamed and the id of old_name');
  await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).resolved}`);
  await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).validFacilities}`);
});

Deno.test("the shadow is refused even when the later indicator has no data id: nothing lands under the renamed one", async () => {
  const err = await assertRejects(() => stage(["old_empty"]));
  const message = err instanceof Error ? err.message : String(err);
  assertStringIncludes(message, '"old_empty" is the data id of renamed2 and the id of old_empty');
  await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).resolved}`);
  await db.unsafe(`DROP TABLE IF EXISTS ${hmisCsvStagingTableNames(runId).validFacilities}`);
});

Deno.test("the ambiguous indicator's data id itself still resolves", async () => {
  const { staged } = await stage(["NEWER_FILE"]);
  assertEquals(staged, [{ data_id: "NEWER_FILE", count: 1 }]);
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
