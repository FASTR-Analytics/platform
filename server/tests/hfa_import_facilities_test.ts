// Pins the HFA data import's facility write, whose contract is SYSTEM_06 "HFA
// import runs" and SYSTEM_05 "HFA registry writes": the stage leg reads each
// kept row's facility values and checks the decisions, the integrate leg
// writes the approved facilities and the round's data in one transaction, and
// migration 213 brings stored runs to the current shape. Runs the real legs on
// a throwaway database built from _main_database.sql on the dev postgres (the
// .env the test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/hfa_import_facilities_test.ts

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  type DatasetHfaCsvStagingResult,
  encodeRawCsvHeader,
  type HfaCsvMappingParams,
  type HfaFacilityChangeGroupDecision,
} from "lib";
import { utils, write } from "xlsx/xlsx.mjs";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import { hfaRunDiagnosticsFacilityChanges } from "../db/migrations/instance/213_hfa_run_diagnostics_facility_changes.ts";
import {
  dropHfaStagingTables,
  isCleanHfaStaging,
  stageHfaCsvIntoTables,
} from "../worker_routines/import_hfa_data_csv/stage_csv.ts";
import { integrateStagedHfaData } from "../worker_routines/import_hfa_data_csv/integrate_staged.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url)
    .pathname;
const DB_PREFIX = "hfa_import_facilities_test_";

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
const db = getPgConnection(dbName, { max: 3 });
await db.file(SCHEMA_PATH);

await db`
  INSERT INTO instance_config (config_key, config_json_value)
  VALUES ('structure_schema_hfa', ${
  JSON.stringify({
    adminDepth: 2,
    includeNames: false,
    includeTypes: true,
    includeOwnership: false,
    includeCustom1: false,
    includeCustom2: false,
    includeCustom3: false,
    includeCustom4: false,
    includeCustom5: false,
  })
})
`;
await db`
  INSERT INTO hfa_time_points (label, period_id, sort_order)
  VALUES ('R1', '202401', 1)
`;

const SL = "Sierra Leone";
const tempPaths: string[] = [];

const workbook = utils.book_new();
utils.book_append_sheet(
  workbook,
  utils.aoa_to_sheet([
    ["type", "name", "label"],
    ["text", "id_fac", "Facility"],
    ["select_one region", "id_admin1_name", "Region"],
    ["select_one ftype", "id_fac_type", "Type"],
    ["integer", "hr_01", "Staff"],
  ]),
  "survey",
);
utils.book_append_sheet(
  workbook,
  utils.aoa_to_sheet([
    ["list_name", "name", "label"],
    ["region", "1", "North"],
    ["region", "2", "East"],
    ["ftype", "1", "Hospital"],
    ["ftype", "2", "Clinic"],
  ]),
  "choices",
);
const xlsFormPath = await Deno.makeTempFile({ suffix: ".xlsx" });
tempPaths.push(xlsFormPath);
await Deno.writeFile(
  xlsFormPath,
  new Uint8Array(write(workbook, { type: "array", bookType: "xlsx" })),
);

const HEADERS = ["id_fac", "id_admin1_name", "id_fac_type", "hr_01"];
const enc = (name: string) => encodeRawCsvHeader(HEADERS.indexOf(name), name);

// F1 is re-typed from Hospital to Clinic; F2 is new, in East.
const LINES = ["F1,1,2,4", "F2,2,1,5"];

const TAKE_F1_TYPE: HfaFacilityChangeGroupDecision = {
  column: "facility_type",
  from: "Hospital",
  to: "Clinic",
  facilityIds: ["F1"],
  decision: "take",
  exceptions: [],
};

function mappings(
  facilityChanges: HfaFacilityChangeGroupDecision[],
): HfaCsvMappingParams {
  return {
    facilityIdColumn: enc("id_fac"),
    timePoint: "R1",
    rowFilters: [],
    dedupStrategy: "first",
    dedupOverrides: [],
    facilityColumns: {
      adminArea1: { value: SL },
      adminAreas: [{ level: 2, header: enc("id_admin1_name") }],
      optional: { facility_type: { header: enc("id_fac_type") } },
    },
    facilityChanges,
    recodes: {},
  };
}

async function resetRegistry() {
  await db`DELETE FROM hfa_import_runs`;
  await db`DELETE FROM hfa_data`;
  await db`DELETE FROM hfa_variables`;
  await db`DELETE FROM facilities_hfa`;
  for (let level = 4; level >= 1; level--) {
    await db`DELETE FROM ${db(`admin_areas_hfa_${level}`)}`;
  }
  await db`DELETE FROM instance_config WHERE config_key = 'structure_last_updated'`;
  await db`INSERT INTO admin_areas_hfa_1 VALUES (${SL})`;
  await db`INSERT INTO admin_areas_hfa_2 (admin_area_2, admin_area_1) VALUES ('North', ${SL})`;
  await db`INSERT INTO admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1) VALUES ('North', 'North', ${SL})`;
  await db`INSERT INTO admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES ('North', 'North', 'North', ${SL})`;
  await db`
    INSERT INTO facilities_hfa (facility_id, admin_area_1, admin_area_2, admin_area_3, admin_area_4, facility_type)
    VALUES ('F1', ${SL}, 'North', 'North', 'North', 'Hospital')
  `;
}

async function newRun(m: HfaCsvMappingParams): Promise<number> {
  const [{ id }] = await db<{ id: number }[]>`
    INSERT INTO hfa_import_runs (csv_config, time_point, status)
    VALUES (${JSON.stringify({ mappings: m })}, 'R1', 'running')
    RETURNING id
  `;
  return id;
}

async function stage(
  runId: number,
  m: HfaCsvMappingParams,
  lines: string[] = LINES,
): Promise<DatasetHfaCsvStagingResult> {
  const csvPath = await Deno.makeTempFile({ suffix: ".csv" });
  tempPaths.push(csvPath);
  await Deno.writeTextFile(csvPath, [HEADERS.join(","), ...lines].join("\n"));
  return await stageHfaCsvIntoTables({
    importDb: db,
    csvFilePath: csvPath,
    csvFileName: "round.csv",
    xlsFormFilePath: xlsFormPath,
    mappings: m,
    runId,
    onProgress: () => {},
  });
}

async function integrate(
  runId: number,
  m: HfaCsvMappingParams,
  stagingResult: DatasetHfaCsvStagingResult,
) {
  await integrateStagedHfaData({
    importDb: db,
    mainDb: db,
    runId,
    mappings: m,
    stagingResult,
    onProgress: () => {},
  });
}

async function registry() {
  return (await db<
    { facility_id: string; admin_area_2: string; facility_type: string }[]
  >`
    SELECT facility_id, admin_area_2, facility_type FROM facilities_hfa
    ORDER BY facility_id
  `).map((r) => `${r.facility_id} ${r.admin_area_2} ${r.facility_type}`);
}

async function staff() {
  return (await db<{ facility_id: string; value: string }[]>`
    SELECT facility_id, value FROM hfa_data
    WHERE variable_id = 'hr_01' ORDER BY facility_id
  `).map((r) => `${r.facility_id} ${r.value}`);
}

Deno.test("a clean run writes the approved facilities and the round's data together", async () => {
  await resetRegistry();
  const m = mappings([TAKE_F1_TYPE]);
  const runId = await newRun(m);
  const staged = await stage(runId, m);
  assertEquals(isCleanHfaStaging(staged), true);
  assertEquals(staged.facilityMatch, { known: 1, new: 1, absent: 0 });
  assertEquals(staged.facilityChanges, [
    { column: "facility_type", changed: 1, kept: 0, taken: 1 },
  ]);
  assertEquals(staged.labelResolution, [
    { column: "admin_area_2", resolvedCount: 2, unresolvedValues: [] },
    { column: "facility_type", resolvedCount: 2, unresolvedValues: [] },
  ]);
  assertEquals(staged.facilitiesWithoutAdminTuple, { count: 0, sample: [] });
  // Nothing reaches the registry before the integrate leg.
  assertEquals(await registry(), ["F1 North Hospital"]);

  await integrate(runId, m, staged);
  assertEquals(await registry(), ["F1 North Clinic", "F2 East Hospital"]);
  assertEquals(await staff(), ["F1 4", "F2 5"]);
  assertEquals(
    (await db<{ s: string }[]>`
      SELECT facility_id || ' ' || column_group || ' ' || kind || ' ' || time_point AS s
      FROM hfa_facility_sources ORDER BY facility_id, column_group
    `).map((r) => r.s),
    [
      "F1 admin round R1",
      "F1 facility_type round R1",
      "F2 admin round R1",
      "F2 facility_type round R1",
    ],
  );
  const run = (await db<
    { status: string; diagnostics: string; n_rows_integrated: number }[]
  >`
    SELECT status, diagnostics, n_rows_integrated FROM hfa_import_runs WHERE id = ${runId}
  `)[0];
  assertEquals(run.status, "complete");
  const diagnostics = JSON.parse(run.diagnostics) as DatasetHfaCsvStagingResult;
  assertEquals(diagnostics.facilityMatch, { known: 1, new: 1, absent: 0 });
  assertEquals(diagnostics.orphanedGeojsonAreaIds, []);
  assertEquals(diagnostics.orphanedScopeAreas, []);
  assertEquals(run.n_rows_integrated, staged.nRowsTotal);
  assertEquals(
    (await db`
      SELECT 1 FROM instance_config WHERE config_key = 'structure_last_updated'
    `).length,
    1,
  );
});

Deno.test("decisions that no longer match the file and the registry refuse the run, at staging and at integration", async () => {
  await resetRegistry();
  const undecided = mappings([]);
  const runA = await newRun(undecided);
  const errA = await assertRejects(() => stage(runA, undecided));
  assertStringIncludes(
    errA instanceof Error ? errA.message : String(errA),
    "1 facility: F1",
  );
  await dropHfaStagingTables(db, runA, { keepFinal: false });
  await db`UPDATE hfa_import_runs SET status = 'error' WHERE id = ${runA}`;

  const m = mappings([TAKE_F1_TYPE]);
  const runB = await newRun(m);
  const staged = await stage(runB, m);
  await db`UPDATE facilities_hfa SET facility_type = 'CHC' WHERE facility_id = 'F1'`;
  const errB = await assertRejects(() => integrate(runB, m, staged));
  assertStringIncludes(
    errB instanceof Error ? errB.message : String(errB),
    "1 facility: F1",
  );
  assertEquals(await registry(), ["F1 North CHC"]);
  assertEquals(await staff(), []);
  await dropHfaStagingTables(db, runB, { keepFinal: false });
});

Deno.test("a new facility with no complete admin areas holds the run, and integrating anyway leaves it out", async () => {
  await resetRegistry();
  const m = mappings([TAKE_F1_TYPE]);
  const runId = await newRun(m);
  const staged = await stage(runId, m, [...LINES, "F3,,1,6"]);
  assertEquals(isCleanHfaStaging(staged), false);
  assertEquals(staged.facilitiesWithoutAdminTuple, {
    count: 1,
    sample: ["F3"],
  });
  assertEquals(staged.nRowsValid, 2);

  await integrate(runId, m, staged);
  assertEquals(await registry(), ["F1 North Clinic", "F2 East Hospital"]);
  assertEquals(await staff(), ["F1 4", "F2 5"]);
});

Deno.test("migration 213: diagnostics lose the not-found fields, configs gain the facility fields, held runs are cancelled", async () => {
  await resetRegistry();
  const legacyConfig = JSON.stringify({
    csvFileName: "round.csv",
    mappings: {
      facilityIdColumn: enc("id_fac"),
      timePoint: "R1",
      rowFilters: [],
      dedupStrategy: "first",
      dedupOverrides: [],
    },
  });
  const legacyDiagnostics = JSON.stringify({
    nRowsTotal: 4,
    nRowsInvalidFacilityNotFound: 2,
    facilityNotFoundSample: ["F8", "F9"],
  });
  const [{ id: heldId }] = await db<{ id: number }[]>`
    INSERT INTO hfa_import_runs (csv_config, time_point, status, diagnostics)
    VALUES (${legacyConfig}, 'R1', 'needs_review', ${legacyDiagnostics})
    RETURNING id
  `;
  const [{ id: doneId }] = await db<{ id: number }[]>`
    INSERT INTO hfa_import_runs (csv_config, time_point, status, diagnostics)
    VALUES (${legacyConfig}, 'R1', 'complete', ${legacyDiagnostics})
    RETURNING id
  `;
  const heldTable =
    `uploaded_hfa_data_staging_ready_for_integration_run_${heldId}`;
  await db`CREATE TABLE ${db(heldTable)} (facility_id text)`;

  await db.begin((tx) => hfaRunDiagnosticsFacilityChanges(tx));

  const rows = await db<
    { id: number; status: string; csv_config: string; diagnostics: string }[]
  >`
    SELECT id, status, csv_config, diagnostics FROM hfa_import_runs ORDER BY id
  `;
  assertEquals(rows.map((r) => r.status), ["cancelled", "complete"]);
  for (const row of rows) {
    assertEquals(JSON.parse(row.diagnostics), { nRowsTotal: 4 });
    const config = JSON.parse(row.csv_config) as {
      mappings: HfaCsvMappingParams;
    };
    assertEquals(config.mappings.facilityColumns, {
      adminArea1: { value: "" },
      adminAreas: [],
      optional: {},
    });
    assertEquals(config.mappings.facilityChanges, []);
    assertEquals(config.mappings.recodes, {});
  }
  assertEquals(rows[1].id, doneId);
  assertEquals(
    (await db`SELECT to_regclass(${heldTable}) AS reg`)[0].reg,
    null,
  );
});

Deno.test("cleanup: drop the throwaway database and temp files", async () => {
  for (const path of tempPaths) {
    await Deno.remove(path).catch(() => {});
  }
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
