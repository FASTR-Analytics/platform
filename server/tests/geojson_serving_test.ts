// Pins the geojson serving route's response (SYSTEM_05 "Geojson boundaries"):
// the stored text is the body, byte for byte, under a content-addressed and
// immutable URL, gzipped when the request accepts it, and a stale stamp is a
// 404. The read runs on a throwaway database built from _main_database.sql on
// the dev postgres (the .env the test task loads), dropped afterwards; the
// route itself is not driven through Hono, whose guards bind the dev database.
//
//   deno test -A --env-file server/tests/geojson_serving_test.ts

import { assertEquals } from "@std/assert";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import { getStoredGeoJson } from "../db/instance/geojson_maps.ts";
import { buildGeoJsonLevelResponse } from "../routes/instance/geojson_maps.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "geojson_serving_test_";

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

const GEOJSON = JSON.stringify({
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    geometry: { type: "Point", coordinates: [10.5, -2.25] },
    properties: { area_id: "Boké", source_name: "Boke" },
  }],
});
// Microseconds the client's millisecond ISO string cannot carry.
await db`
  INSERT INTO geojson_maps (facility_family, admin_area_level, geojson, uploaded_at)
  VALUES ('hmis', 2, ${GEOJSON}, '2026-10-28T12:00:00.123456Z')
`;
const STAMP = "2026-10-28T12:00:00.123Z";

Deno.test("the serving read returns the stored text and its ISO stamp", async () => {
  assertEquals(await getStoredGeoJson(db, "hmis", 2), {
    geojson: GEOJSON,
    uploadedAt: STAMP,
  });
  assertEquals(await getStoredGeoJson(db, "hmis", 3), undefined);
});

Deno.test("the response is the stored bytes with immutable headers", async () => {
  const stored = await getStoredGeoJson(db, "hmis", 2);
  const res = await buildGeoJsonLevelResponse(stored, STAMP, undefined);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/geo+json");
  assertEquals(
    res.headers.get("Cache-Control"),
    "private, max-age=31536000, immutable",
  );
  assertEquals(res.headers.get("Vary"), "Accept-Encoding");
  assertEquals(res.headers.get("Content-Encoding"), null);
  assertEquals(await res.text(), GEOJSON);
});

Deno.test("a gzip-accepting request gets a body that inflates to the stored bytes", async () => {
  const stored = await getStoredGeoJson(db, "hmis", 2);
  const res = await buildGeoJsonLevelResponse(stored, STAMP, "gzip, deflate");
  assertEquals(res.headers.get("Content-Encoding"), "gzip");
  assertEquals(res.headers.get("Content-Type"), "application/geo+json");
  assertEquals(
    res.headers.get("Cache-Control"),
    "private, max-age=31536000, immutable",
  );
  const inflated = await new Response(
    res.body!.pipeThrough(new DecompressionStream("gzip")),
  ).text();
  assertEquals(inflated, GEOJSON);
});

Deno.test("a stale or missing stamp is a 404", async () => {
  const stored = await getStoredGeoJson(db, "hmis", 2);
  assertEquals(
    (await buildGeoJsonLevelResponse(
      stored,
      "2026-10-27T00:00:00.000Z",
      "gzip",
    ))
      .status,
    404,
  );
  assertEquals(
    (await buildGeoJsonLevelResponse(undefined, STAMP, "gzip")).status,
    404,
  );
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
