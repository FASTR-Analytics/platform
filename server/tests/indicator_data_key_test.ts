// Pins PLAN_A6 ruling 1: an Uploaded indicator's data id is an opaque key.
// The table requires one; the key is generated as `u_` plus a UUID, outside
// the DHIS2 shapes; two creates never share one; no path accepts a key from
// a client (the route schema strips it, the route narrowing drops it, an
// update keeps the stored key); retyping keeps the key except Uploaded to
// DHIS2 element, which takes the typed UID and needs no rows under the old
// key; a retype from Sum or Derived to Uploaded generates a key. Runs on a
// throwaway database built from _main_database.sql on the dev postgres (the
// .env the test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/indicator_data_key_test.ts

import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  DHIS2_OPERAND_PATTERN,
  DHIS2_UID_PATTERN,
  generateDataKey,
  type HmisIndicator,
} from "lib";
import type { z } from "zod";
import { indicatorRouteRegistry } from "../../lib/api-routes/instance/indicators.ts";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  createIndicators,
  getHmisIndicators,
  type NewIndicator,
  updateIndicator,
} from "../db/instance/indicators.ts";
import { narrowIndicatorDefinition } from "../routes/instance/indicators.ts";

const SCHEMA_PATH = new URL("../db/instance/_main_database.sql", import.meta.url)
  .pathname;
const DB_PREFIX = "data_key_test_";

const ELEMENT = "AbCdEfGhIj1";
const KEY_SHAPE = /^u_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

function indicator(
  id: string,
  definition: NewIndicator["definition"],
  label = `Label ${id}`,
): NewIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: label,
    definition,
    include_in_analysis: true,
    format_as: definition.type === "derived" ? "percent" : "number",
    thresholds: null,
    direction: "higher-is-better",
    target: null,
    expected_low_counts: false,
  };
}

async function reset(): Promise<void> {
  await db`DELETE FROM dataset_hmis`;
  await db`DELETE FROM dataset_hmis_versions`;
  await db`DELETE FROM indicator_sum_members`;
  await db`DELETE FROM indicators`;
}

async function dictionary(): Promise<Map<string, HmisIndicator>> {
  return new Map(
    (await getHmisIndicators(db)).map((i) => [i.indicator_common_id, i]),
  );
}

function keyOf(i: HmisIndicator): string {
  assert(i.definition.type === "uploaded" || i.definition.type === "dhis2_element");
  return i.definition.data_id;
}

async function seedRows(dataId: string): Promise<void> {
  await db`INSERT INTO admin_areas_hmis_1 (admin_area_1) VALUES ('A1') ON CONFLICT DO NOTHING`;
  await db`INSERT INTO admin_areas_hmis_2 (admin_area_2, admin_area_1) VALUES ('A2', 'A1') ON CONFLICT DO NOTHING`;
  await db`INSERT INTO admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1) VALUES ('A3', 'A2', 'A1') ON CONFLICT DO NOTHING`;
  await db`INSERT INTO admin_areas_hmis_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES ('A4', 'A3', 'A2', 'A1') ON CONFLICT DO NOTHING`;
  await db`
    INSERT INTO facilities_hmis (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    VALUES ('FacAaaaaaa1', 'A4', 'A3', 'A2', 'A1') ON CONFLICT DO NOTHING
  `;
  await db`INSERT INTO dataset_hmis_versions (id, n_rows_total_imported) VALUES (1, 0) ON CONFLICT DO NOTHING`;
  await db`
    INSERT INTO dataset_hmis (facility_id, data_id, period_id, count, version_id)
    VALUES ('FacAaaaaaa1', ${dataId}, 202401, 3, 1)
  `;
}

Deno.test("the table requires a key on every Uploaded row", async () => {
  await reset();
  const err = await assertRejects(() =>
    db`INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type) VALUES ('keyless', 'Keyless', 'uploaded')`
  );
  assertStringIncludes(err instanceof Error ? err.message : String(err), "indicators_fields_check");
});

Deno.test("a generated key is u_ plus a UUID, outside both DHIS2 shapes, and never repeats", () => {
  const keys = new Set(Array.from({ length: 200 }, () => generateDataKey()));
  assertEquals(keys.size, 200);
  for (const key of keys) {
    assertMatch(key, KEY_SHAPE);
    assert(!DHIS2_UID_PATTERN.test(key));
    assert(!DHIS2_OPERAND_PATTERN.test(key));
  }
});

Deno.test("a create generates each Uploaded indicator's key; two creates never share one", async () => {
  await reset();
  const res = await createIndicators(db, [
    indicator("opd", { type: "uploaded" }),
    indicator("ipd", { type: "uploaded" }),
  ]);
  assert(res.success, res.success ? "" : res.err);
  const d = await dictionary();
  const opd = keyOf(d.get("opd")!);
  const ipd = keyOf(d.get("ipd")!);
  assertMatch(opd, KEY_SHAPE);
  assertMatch(ipd, KEY_SHAPE);
  assertNotEquals(opd, ipd);
});

Deno.test("no path accepts a client-supplied Uploaded key: the route schema strips it, the narrowing drops it, an update keeps the stored key", async () => {
  // The registry types the body as its parsed shape; the runtime value is
  // the Zod schema the route middleware parses with.
  const bodySchema = indicatorRouteRegistry.createIndicators.body as unknown as z.ZodType<
    { indicators: { definition: unknown }[] }
  >;
  const parsed = bodySchema.parse({
    indicators: [{
      indicator_common_id: "opd",
      indicator_common_label: "OPD",
      definition: { type: "uploaded", data_id: "MINE" },
      include_in_analysis: true,
      format_as: "number",
      thresholds: null,
      direction: "higher-is-better",
      target: null,
      expected_low_counts: false,
    }],
  });
  assertEquals(parsed.indicators[0].definition, { type: "uploaded" });
  assertEquals(
    narrowIndicatorDefinition({ type: "uploaded", data_id: "MINE" }),
    { type: "uploaded" },
  );

  await reset();
  const created = await createIndicators(db, [indicator("opd", { type: "uploaded" })]);
  assert(created.success, created.success ? "" : created.err);
  const before = keyOf((await dictionary()).get("opd")!);
  const updated = await updateIndicator(db, "opd", indicator("opd_visits", { type: "uploaded" }, "OPD visits"));
  assert(updated.success, updated.success ? "" : updated.err);
  const after = (await dictionary()).get("opd_visits")!;
  assertEquals(keyOf(after), before);
  assertEquals(after.indicator_common_label, "OPD visits");
});

Deno.test("retyping keeps the key: a DHIS2 element made Uploaded keeps its UID, with rows; Uploaded made a DHIS2 element takes the UID and needs no rows", async () => {
  await reset();
  const created = await createIndicators(db, [
    indicator("anc1", { type: "dhis2_element", data_id: ELEMENT }),
    indicator("opd", { type: "uploaded" }),
  ]);
  assert(created.success, created.success ? "" : created.err);
  await seedRows(ELEMENT);
  const toUploaded = await updateIndicator(db, "anc1", indicator("anc1", { type: "uploaded" }));
  assert(toUploaded.success, toUploaded.success ? "" : toUploaded.err);
  assertEquals((await dictionary()).get("anc1")!.definition, { type: "uploaded", data_id: ELEMENT });
  const backToElement = await updateIndicator(db, "anc1", indicator("anc1", { type: "dhis2_element", data_id: ELEMENT }));
  assert(backToElement.success, backToElement.success ? "" : backToElement.err);

  const opdKey = keyOf((await dictionary()).get("opd")!);
  await seedRows(opdKey);
  const withRows = await updateIndicator(db, "opd", indicator("opd", { type: "dhis2_element", data_id: "KlMnOpQrSt2" }));
  assert(!withRows.success);
  assertStringIncludes(withRows.err, "Cannot make an indicator that has data a DHIS2 element");
  await db`DELETE FROM dataset_hmis WHERE data_id = ${opdKey}`;
  const withoutRows = await updateIndicator(db, "opd", indicator("opd", { type: "dhis2_element", data_id: "KlMnOpQrSt2" }));
  assert(withoutRows.success, withoutRows.success ? "" : withoutRows.err);
  assertEquals((await dictionary()).get("opd")!.definition, { type: "dhis2_element", data_id: "KlMnOpQrSt2" });
});

Deno.test("a retype from Sum or Derived to Uploaded generates a key", async () => {
  await reset();
  const created = await createIndicators(db, [
    indicator("anc1", { type: "dhis2_element", data_id: ELEMENT }),
    indicator("total", { type: "sum", members: ["anc1"] }),
    indicator("share", { type: "derived", expression: "anc1 / 2" }),
  ]);
  assert(created.success, created.success ? "" : created.err);
  const fromSum = await updateIndicator(db, "total", indicator("total", { type: "uploaded" }));
  assert(fromSum.success, fromSum.success ? "" : fromSum.err);
  const fromDerived = await updateIndicator(db, "share", indicator("share", { type: "uploaded" }));
  assert(fromDerived.success, fromDerived.success ? "" : fromDerived.err);
  const d = await dictionary();
  assertMatch(keyOf(d.get("total")!), KEY_SHAPE);
  assertMatch(keyOf(d.get("share")!), KEY_SHAPE);
  assertNotEquals(keyOf(d.get("total")!), keyOf(d.get("share")!));
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
