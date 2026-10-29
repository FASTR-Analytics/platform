// Pins the geojson capture into a run package (SYSTEM_08 "inputs/geojson"):
// generation copies every boundary file verbatim and gzipped and lists it as
// an input file, and the copies reach no module reuse key. prepareRunInputs
// runs over a throwaway database built from _main_database.sql on the dev
// postgres (the .env the test task loads), dropped afterwards; its tmp run
// directories are removed.
//
//   deno test -A --env-file server/tests/geojson_capture_test.ts

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import { prepareRunInputs } from "../worker_routines/generate_run/prepare_inputs.ts";
import { runTmpDirPath } from "../runs/mod.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "geojson_capture_test_";

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

const geojsonOf = (name: string) =>
  JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [1, 2] },
        properties: { area_id: name, source_name: name },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [3, 4] },
        properties: { area_id: "", source_name: `${name} unmatched` },
      },
    ],
  });
const STORED = {
  hmis2: geojsonOf("Kindia"),
  hfa3: geojsonOf("Boké"),
};
await db`
  INSERT INTO geojson_maps (facility_family, admin_area_level, geojson, uploaded_at)
  VALUES ('hmis', 2, ${STORED.hmis2}, '2026-10-01T00:00:00.000Z'),
    ('hfa', 3, ${STORED.hfa3}, '2026-10-02T00:00:00.000Z')
`;

const NO_FAMILY = { hmis: false, hfa: false, iceh: false };
const runIds: string[] = [];
const prepare = async () => {
  const runId = crypto.randomUUID();
  runIds.push(runId);
  return {
    runId,
    prepared: await prepareRunInputs(db, NO_FAMILY, runId, async () => {}),
  };
};

const inflate = async (path: string) =>
  await new Response(
    (await Deno.open(path)).readable.pipeThrough(
      new DecompressionStream("gzip"),
    ),
  ).text();

Deno.test("every boundary file is copied verbatim, gzipped, and listed", async () => {
  const { runId, prepared } = await prepare();
  const tmp = runTmpDirPath(runId);
  assertEquals(prepared.extraInputFiles, [
    "inputs/geojson/hfa_level_3.geojson.gz",
    "inputs/geojson/hmis_level_2.geojson.gz",
  ]);
  assertEquals(
    await inflate(join(tmp, "inputs/geojson/hmis_level_2.geojson.gz")),
    STORED.hmis2,
  );
  assertEquals(
    await inflate(join(tmp, "inputs/geojson/hfa_level_3.geojson.gz")),
    STORED.hfa3,
  );
  assertEquals(prepared.geojsonMaps, [
    {
      family: "hfa",
      adminAreaLevel: 3,
      featureCount: 2,
      uploadedAt: "2026-10-02T00:00:00.000Z",
    },
    {
      family: "hmis",
      adminAreaLevel: 2,
      featureCount: 2,
      uploadedAt: "2026-10-01T00:00:00.000Z",
    },
  ]);
});

// inputHashes reach a reuse key through computeModuleInputs, and scriptInputs
// through the generated script text computeModuleKey hashes: equal with and
// without boundaries means the capture is outside every reuse key.
Deno.test("the capture reaches no reuse key", async () => {
  const withMaps = (await prepare()).prepared;
  await db`DELETE FROM geojson_maps`;
  const without = (await prepare()).prepared;
  assertEquals(without.geojsonMaps, []);
  assertEquals(withMaps.inputHashes, without.inputHashes);
  assertEquals(withMaps.scriptInputs, without.scriptInputs);
});

Deno.test("cleanup: drop the throwaway database and tmp run dirs", async () => {
  for (const runId of runIds) {
    await Deno.remove(runTmpDirPath(runId), { recursive: true }).catch(
      () => {},
    );
  }
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
