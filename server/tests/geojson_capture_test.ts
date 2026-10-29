// Pins the geojson capture into a run package (SYSTEM_08 "inputs/geojson"):
// generation copies every boundary file verbatim and gzipped and lists it as
// an input file, the copies reach no module reuse key, and the two run-keyed
// routes serve the stamp and the file. prepareRunInputs runs over a throwaway
// database built from _main_database.sql on the dev postgres (the .env the
// test task loads), dropped afterwards; its tmp run directories are removed.
// The routes run through a Hono app with the clerk leg of
// products_routes_test.ts against the dev database, because every guard binds
// the dev database, over scratch packages written under the runs root and
// removed afterwards.
//
//   BYPASS_AUTH= deno test -A --env-file server/tests/geojson_capture_test.ts

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Hono } from "hono";
import type { RunManifest } from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import { prepareRunInputs } from "../worker_routines/generate_run/prepare_inputs.ts";
import { runDirPath, runTmpDirPath } from "../runs/mod.ts";
import { routesRunGeneration } from "../routes/instance/run_generation.ts";

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

const APPROVED_EMAIL = "geojson-capture-test@example.com";

// clerkMiddleware's output contract, as products_routes_test.ts simulates it.
function clerkLeg(email: string) {
  const auth = {
    userId: "user_geojson_capture_test",
    tokenType: "session_token",
    sessionClaims: { email, firstName: null, lastName: null },
  };
  return async (
    c: { set: (k: never, v: never) => void },
    next: () => Promise<void>,
  ) => {
    c.set("clerkAuth" as never, (() => auth) as never);
    await next();
  };
}

function scratchManifest(
  runId: string,
  version: number,
  geojsonMaps: RunManifest["geojsonMaps"] | undefined,
): Record<string, unknown> {
  return {
    manifestSchemaVersion: version,
    runId,
    createdAt: "2026-10-28T00:00:00.000Z",
    label: "geojson capture scratch",
    provenance: "wizard",
    appVersion: "0.0.0",
    rImageTag: null,
    calendar: "gregorian",
    countryIso3: null,
    structureSchemaHmis: null,
    structureSchemaHfa: null,
    datasets: [],
    facilitiesTables: [],
    assets: [],
    modules: [],
    metrics: [],
    resultsObjects: [],
    metricAvailability: [],
    indicators: [],
    hmisIndicators: [],
    population: null,
    ...(geojsonMaps === undefined ? {} : { geojsonMaps }),
    inputFiles: [],
  };
}

Deno.test("the run-keyed routes serve the stamp and the captured file", async () => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const captured = crypto.randomUUID();
  const preCapture = crypto.randomUUID();
  const stamp = [{
    family: "hmis" as const,
    adminAreaLevel: 2,
    featureCount: 2,
    uploadedAt: "2026-10-01T00:00:00.000Z",
  }];
  const gzipped = new Uint8Array(
    await new Response(
      new Blob([STORED.hmis2]).stream().pipeThrough(
        new CompressionStream("gzip"),
      ),
    ).arrayBuffer(),
  );
  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${APPROVED_EMAIL}, FALSE)
    ON CONFLICT DO NOTHING
  `;
  try {
    await Deno.mkdir(join(runDirPath(captured), "inputs", "geojson"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(runDirPath(captured), "manifest.json"),
      JSON.stringify(scratchManifest(captured, 15, stamp)),
    );
    await Deno.writeFile(
      join(runDirPath(captured), "inputs/geojson/hmis_level_2.geojson.gz"),
      gzipped,
    );
    await Deno.mkdir(runDirPath(preCapture), { recursive: true });
    await Deno.writeTextFile(
      join(runDirPath(preCapture), "manifest.json"),
      JSON.stringify(scratchManifest(preCapture, 14, undefined)),
    );

    const app = new Hono();
    app.use("*", clerkLeg(APPROVED_EMAIL) as never);
    app.route("/", routesRunGeneration);
    const stampOf = async (runId: string) =>
      await (await app.request(`/run_generation/run/${runId}/geojson`)).json();

    assertEquals(await stampOf(captured), {
      success: true,
      data: { found: true, geojsonMaps: stamp },
    });
    assertEquals(await stampOf(preCapture), {
      success: true,
      data: { found: true, geojsonMaps: null },
    });
    assertEquals(await stampOf(crypto.randomUUID()), {
      success: true,
      data: { found: false },
    });

    const file = await app.request(
      `/run_generation/run/${captured}/geojson/hmis/2`,
    );
    assertEquals(file.status, 200);
    assertEquals(file.headers.get("Content-Type"), "application/geo+json");
    assertEquals(file.headers.get("Content-Encoding"), "gzip");
    assertEquals(
      file.headers.get("Cache-Control"),
      "private, max-age=31536000, immutable",
    );
    assertEquals(new Uint8Array(await file.arrayBuffer()), gzipped);
    const missing = await app.request(
      `/run_generation/run/${captured}/geojson/hmis/3`,
    );
    assertEquals(missing.status, 404);
    await missing.body?.cancel();
  } finally {
    for (const runId of [captured, preCapture]) {
      await Deno.remove(runDirPath(runId), { recursive: true }).catch(() => {});
    }
    await mainDb`DELETE FROM users WHERE email = ${APPROVED_EMAIL}`;
  }
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
