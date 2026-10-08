// Pins the HFA stage leg's column match, whose contract is the "HFA XLSForm"
// bullet of SYSTEM_06_ingestion.md. Runs the real stage leg on a throwaway
// database built from _main_database.sql on the dev postgres (the .env the
// test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/hfa_csv_column_matching_test.ts

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { encodeRawCsvHeader } from "lib";
import { utils, write } from "xlsx/xlsx.mjs";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  dropHfaStagingTables,
  hfaStagingTableNames,
  stageHfaCsvIntoTables,
} from "../worker_routines/import_hfa_data_csv/stage_csv.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url)
    .pathname;
const DB_PREFIX = "hfa_column_matching_test_";

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

await db`INSERT INTO admin_areas_hfa_1 (admin_area_1) VALUES ('A1')`;
await db`INSERT INTO admin_areas_hfa_2 (admin_area_2, admin_area_1) VALUES ('A2', 'A1')`;
await db`INSERT INTO admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1) VALUES ('A3', 'A2', 'A1')`;
await db`INSERT INTO admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES ('A4', 'A3', 'A2', 'A1')`;
await db`
  INSERT INTO facilities_hfa (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1)
  VALUES ('F1', 'A4', 'A3', 'A2', 'A1')
`;

const SURVEY = [
  ["type", "name", "label"],
  ["select_one facname", "id_fac", "Facility"],
  ["calculate", "id_fac_name", "Facility name"],
  ["select_one yesno", "serv_08b", "Service 8b"],
  ["integer", "hr_01", "Staff"],
  ["integer", "hr_02", "Doctors"],
  ["text", "com_notes", "Notes"],
];
const CHOICES = [
  ["list_name", "name", "label"],
  ["facname", "F1", "Facility one"],
  ["yesno", "1", "Yes"],
  ["yesno", "0", "No"],
];

const tempPaths: string[] = [];
const xlsFormPath = await Deno.makeTempFile({ suffix: ".xlsx" });
tempPaths.push(xlsFormPath);
const workbook = utils.book_new();
utils.book_append_sheet(workbook, utils.aoa_to_sheet(SURVEY), "survey");
utils.book_append_sheet(workbook, utils.aoa_to_sheet(CHOICES), "choices");
await Deno.writeFile(
  xlsFormPath,
  new Uint8Array(write(workbook, { type: "array", bookType: "xlsx" })),
);

let runId = 0;

async function runStageLeg(lines: string[]) {
  runId++;
  const csvPath = await Deno.makeTempFile({ suffix: ".csv" });
  tempPaths.push(csvPath);
  await Deno.writeTextFile(csvPath, lines.join("\n") + "\n");
  const headers = lines[0].split(",");
  return await stageHfaCsvIntoTables({
    importDb: db,
    csvFilePath: csvPath,
    csvFileName: "round.csv",
    xlsFormFilePath: xlsFormPath,
    mappings: {
      facilityIdColumn: encodeRawCsvHeader(headers.indexOf("id_fac"), "id_fac"),
      timePoint: "Round 1",
      rowFilters: [],
      dedupStrategy: "first",
      dedupOverrides: [],
    },
    runId,
    onProgress: () => {},
  });
}

async function stage(lines: string[]) {
  try {
    const result = await runStageLeg(lines);
    const staged = await db<{ variable_id: string; value: string }[]>`
      SELECT variable_id, value FROM ${db(hfaStagingTableNames(runId).final)}
      ORDER BY variable_id
    `;
    return {
      result,
      staged: staged.map((r) => ({
        variable_id: r.variable_id,
        value: r.value,
      })),
    };
  } finally {
    await dropHfaStagingTables(db, runId, { keepFinal: false });
  }
}

Deno.test("a header in a different case is staged under the form's spelling", async () => {
  const { result, staged } = await stage([
    "id_fac,SERV_08B,hr_01,HR_02",
    "F1,1,4,2",
  ]);
  assertEquals(staged, [
    { variable_id: "hr_01", value: "4" },
    { variable_id: "hr_02", value: "2" },
    { variable_id: "serv_08b", value: "1" },
  ]);
  assertEquals(result.nCsvColsNotInXlsForm, 0);
  assertEquals(result.nXlsFormQuestionsNotInCsv, 0);
});

Deno.test("an ODK group path matches on its last segment, ignoring case", async () => {
  const { staged } = await stage([
    "id_fac,services/SERV_08B",
    "F1,0",
  ]);
  assertEquals(staged, [{ variable_id: "serv_08b", value: "0" }]);
});

Deno.test("the diagnostics name the unmatched columns and the importable questions with no column", async () => {
  const { result } = await stage([
    "id_fac,id_fac_name,serv_08b,extra_a,extra_b",
    "F1,Facility one,1,x,y",
  ]);
  assertEquals(result.nCsvColsNotInXlsForm, 2);
  assertEquals(result.csvColsNotInXlsFormSample, ["extra_a", "extra_b"]);
  assertEquals(result.nXlsFormQuestionsNotInCsv, 2);
  assertEquals(result.xlsFormQuestionsNotInCsvSample, ["hr_01", "hr_02"]);
});

Deno.test("two columns matching one question abort staging and name both", async () => {
  await assertRejects(
    () => stage(["id_fac,serv_08b,SERV_08B", "F1,1,0"]),
    Error,
    `The CSV columns "serv_08b" and "SERV_08B" both match the XLSForm question "serv_08b"`,
  );
});

Deno.test("a file whose only column matching a staged question is the facility id column aborts before any table is created", async () => {
  const error = await assertRejects(
    () => runStageLeg(["id_fac,FOO,bar", "F1,1,2"]),
    Error,
  );
  assertStringIncludes(
    error.message,
    "No CSV column matches a question in the XLSForm",
  );
  assertStringIncludes(
    error.message,
    "4 questions of a staged type in the form",
  );
  const created = await db<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE tablename = ANY(${Object.values(hfaStagingTableNames(runId))})
  `;
  assertEquals(created.length, 0);
});

Deno.test("cleanup", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  for (const path of tempPaths) await Deno.remove(path);
});
