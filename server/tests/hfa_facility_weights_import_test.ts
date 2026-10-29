// Pins the HFA weights import's checks in the order they run, whose contract
// is the Weights paragraph of SYSTEM_05_facilities_indicators.md. Runs the
// real import on a throwaway database built from _main_database.sql on the
// dev postgres (the .env the test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/hfa_facility_weights_import_test.ts

import {
  assertEquals,
  assertNotMatch,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import { encodeRawCsvHeader } from "lib";
import { _ASSETS_DIR_PATH } from "../exposed_env_vars.ts";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import { importHfaFacilityWeights } from "../db/instance/hfa_facility_weights.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "hfa_weights_import_test_";

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

await db`
  INSERT INTO hfa_time_points (label, period_id, sort_order)
  VALUES ('Round 1', '202401', 1)
`;

// Unsorted, so the message's three example ids pin the registry read's ORDER BY.
const REGISTRY = ["F05", "F01", "F04", "F02", "F03"];

async function seedRegistry() {
  await db`INSERT INTO admin_areas_hfa_1 (admin_area_1) VALUES ('A1')`;
  await db`INSERT INTO admin_areas_hfa_2 (admin_area_2, admin_area_1) VALUES ('A2', 'A1')`;
  await db`INSERT INTO admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1) VALUES ('A3', 'A2', 'A1')`;
  await db`INSERT INTO admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES ('A4', 'A3', 'A2', 'A1')`;
  for (const id of REGISTRY) {
    await db`
      INSERT INTO facilities_hfa (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1)
      VALUES (${id}, 'A4', 'A3', 'A2', 'A1')
    `;
  }
}

const CSV_NAME = `${dbName}.csv`;
const CSV_PATH = join(_ASSETS_DIR_PATH, CSV_NAME);
const HEADERS = ["uid", "facility_id", "wgt"];
const UID_COLUMN = encodeRawCsvHeader(0, "uid");
const DHIS2_COLUMN = encodeRawCsvHeader(1, "facility_id");
const WEIGHT_COLUMN = encodeRawCsvHeader(2, "wgt");

async function writeCsv(rows: string[][]) {
  await Deno.writeTextFile(
    CSV_PATH,
    [HEADERS, ...rows].map((r) => r.join(",")).join("\n") + "\n",
  );
}

async function importFrom(facilityIdColumn: string) {
  return await importHfaFacilityWeights(
    db,
    CSV_NAME,
    facilityIdColumn,
    WEIGHT_COLUMN,
    undefined,
    "Round 1",
  );
}

function errorOf(res: Awaited<ReturnType<typeof importFrom>>): string {
  if (res.success) throw new Error("expected the import to refuse");
  return res.err;
}

async function storedWeights(): Promise<number> {
  const [{ n }] = await db<{ n: number }[]>`
    SELECT count(*)::int AS n FROM hfa_facility_weights
  `;
  return n;
}

// uid holds the registry's ids; facility_id holds DHIS2 codes the registry
// lacks, with one repeated: the shape of the file that produced the bare
// "appear more than once" message.
const NIGERIA_SHAPE = [
  ["F01", "D100", "1.5"],
  ["F02", "D200", "1.5"],
  ["F03", "D100", "2.0"],
  ["F04", "D300", ""],
  ["F05", "D400", "1.0"],
];

Deno.test("an empty registry refuses, saying only to import the time point's data first", async () => {
  await writeCsv(NIGERIA_SHAPE);
  const err = errorOf(await importFrom(UID_COLUMN));
  assertStringIncludes(err, "import the time point's data first");
  assertNotMatch(err, /Col \d+:/);
  assertEquals(await storedWeights(), 0);
});

Deno.test("a weight that is not positive refuses before any facility id is checked", async () => {
  await writeCsv([["F01", "D100", "0"], ...NIGERIA_SHAPE.slice(1)]);
  const err = errorOf(await importFrom(DHIS2_COLUMN));
  assertStringIncludes(err, "weight must be a positive number");
  assertStringIncludes(err, "D100: 0");
});

Deno.test("a column whose ids are all unknown names the column, the file's ids and the registry's, not the repeat", async () => {
  await seedRegistry();
  await writeCsv(NIGERIA_SHAPE);
  const err = errorOf(await importFrom(DHIS2_COLUMN));
  assertStringIncludes(err, `None of the 3 facility ID(s)`);
  assertStringIncludes(err, `"${DHIS2_COLUMN}"`);
  assertStringIncludes(err, "D100, D200, D400");
  assertStringIncludes(err, "F01, F02, F03");
  assertStringIncludes(err, "Check that the facility ID column is right");
  assertStringIncludes(err, "import the time point's data first");
  assertNotMatch(err, /more than once/);
  assertEquals(await storedWeights(), 0);
});

Deno.test("known ids with one repeated refuses, naming the repeated id", async () => {
  await writeCsv([...NIGERIA_SHAPE, ["F02", "D500", "1.2"]]);
  const err = errorOf(await importFrom(UID_COLUMN));
  assertStringIncludes(err, "1 facility ID(s) appear more than once");
  assertStringIncludes(err, "F02");
  assertEquals(await storedWeights(), 0);
});

Deno.test("a clean file with one blank weight imports the weighted rows and counts the blank", async () => {
  await writeCsv(NIGERIA_SHAPE);
  const res = await importFrom(UID_COLUMN);
  assertEquals(res.success, true);
  if (!res.success) return;
  assertEquals(res.data.rowsImported, 4);
  assertEquals(res.data.rowsSkippedNoWeight, 1);
  assertEquals(res.data.facilitiesNotInRegistry, { count: 0, sample: [] });
  assertEquals(await storedWeights(), 4);
});

Deno.test("cleanup: drop the throwaway database and the asset", async () => {
  await Deno.remove(CSV_PATH).catch(() => {});
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
