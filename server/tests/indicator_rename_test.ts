// Pins PLAN_A5 rulings 4 and 5: updateIndicator renames an indicator in one
// transaction, rewriting the sums that name it (the junction follows by ON
// UPDATE CASCADE), every derived expression that names it (text kept as
// written) and every schedule's selection; run rows are history and stay;
// a taken id and a reserved id are refused, and a special id renames like
// any other. The data id is fixed once rows exist under it; Uploaded and DHIS2 element switch either
// way with rows. And the lib text renamer agrees with the SQL one 086
// carries. Runs on a throwaway database built from _main_database.sql on
// the dev postgres (the .env the test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/indicator_rename_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { type HmisIndicator, renameIdentifierInExpression } from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  createIndicators,
  getHmisIndicators,
  type NewIndicator,
  updateIndicator,
} from "../db/instance/indicators.ts";

const SCHEMA_PATH = new URL("../db/instance/_main_database.sql", import.meta.url)
  .pathname;
const DB_PREFIX = "rename_test_";

const ELEMENT = "AbCdEfGhIj1";
const OTHER_ELEMENT = "KlMnOpQrSt2";

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
  definition: HmisIndicator["definition"],
): NewIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: `Label ${id}`,
    definition,
    include_in_analysis: true,
    format_as: definition.type === "derived" ? "percent" : "number",
    thresholds: null,
  };
}

async function reset(): Promise<void> {
  await db`DELETE FROM dataset_hmis_import_runs`;
  await db`DELETE FROM dataset_hmis_scheduled_imports`;
  await db`DELETE FROM dataset_hmis`;
  await db`DELETE FROM dataset_hmis_versions`;
  await db`DELETE FROM indicator_sum_members`;
  await db`DELETE FROM indicators`;
  const res = await createIndicators(db, [
    indicator("visits", { type: "dhis2_element", data_id: ELEMENT }),
    indicator("visits_file", { type: "uploaded", data_id: "VISITS_FILE" }),
    indicator("visits_all", { type: "sum", members: ["visits", "visits_file"] }),
    indicator("visits_share", { type: "derived", expression: "visits / visits_all" }),
    indicator("chain", { type: "derived", expression: "[visits] * 2 + visits_share" }),
  ]);
  assert(res.success, res.success ? "" : res.err);
  await db`
    INSERT INTO dataset_hmis_scheduled_imports (kind, enabled, selection, created_by)
    VALUES ('recurring', true, ${JSON.stringify({ kind: "last_n_months", indicatorIds: ["visits", "visits_all"], monthsBack: 3 })}, 'test')
  `;
  await db`
    INSERT INTO dataset_hmis_import_runs (trigger, route, status, selection)
    VALUES ('manual', 'dhis2', 'complete', ${
    JSON.stringify({
      kind: "window",
      indicatorIds: ["visits"],
      startPeriod: 202401,
      endPeriod: 202401,
      dataIds: [ELEMENT],
      populationTermsDropped: [],
      uploadedIndicatorsDropped: [],
    })
  })
  `;
}

async function seedRows(dataId: string): Promise<void> {
  await db`
    INSERT INTO admin_areas_hmis_1 (admin_area_1) VALUES ('A1') ON CONFLICT DO NOTHING
  `;
  await db`
    INSERT INTO admin_areas_hmis_2 (admin_area_2, admin_area_1) VALUES ('A2', 'A1') ON CONFLICT DO NOTHING
  `;
  await db`
    INSERT INTO admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1) VALUES ('A3', 'A2', 'A1') ON CONFLICT DO NOTHING
  `;
  await db`
    INSERT INTO admin_areas_hmis_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES ('A4', 'A3', 'A2', 'A1') ON CONFLICT DO NOTHING
  `;
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

async function dictionary(): Promise<Map<string, HmisIndicator>> {
  return new Map(
    (await getHmisIndicators(db)).map((i) => [i.indicator_common_id, i]),
  );
}

async function rename(
  from: string,
  to: string,
  patch: Partial<NewIndicator> = {},
) {
  const current = (await dictionary()).get(from)!;
  return await updateIndicator(db, from, {
    indicator_common_id: to,
    indicator_common_label: current.indicator_common_label,
    definition: current.definition,
    include_in_analysis: current.include_in_analysis,
    format_as: current.format_as,
    thresholds: current.thresholds,
    ...patch,
  });
}

Deno.test("rename: members, expressions and schedule selections rewritten in one transaction; run rows untouched", async () => {
  await reset();
  await seedRows(ELEMENT);
  const res = await rename("visits", "first_visits");
  assert(res.success, res.success ? "" : res.err);
  const d = await dictionary();
  assertEquals(d.has("visits"), false);
  assertEquals(d.get("first_visits")!.definition, { type: "dhis2_element", data_id: ELEMENT });
  assertEquals(d.get("visits_all")!.definition, { type: "sum", members: ["first_visits", "visits_file"] });
  assertEquals(d.get("visits_share")!.definition, { type: "derived", expression: "first_visits / visits_all" });
  assertEquals(d.get("chain")!.definition, { type: "derived", expression: "[first_visits] * 2 + visits_share" });
  const schedule = await db<{ selection: string }[]>`SELECT selection FROM dataset_hmis_scheduled_imports`;
  assertEquals(JSON.parse(schedule[0].selection).indicatorIds, ["first_visits", "visits_all"]);
  const run = await db<{ selection: string }[]>`SELECT selection FROM dataset_hmis_import_runs`;
  assertEquals(JSON.parse(run[0].selection).indicatorIds, ["visits"]);
  assertEquals(JSON.parse(run[0].selection).dataIds, [ELEMENT]);
  const rows = await db<{ data_id: string }[]>`SELECT data_id FROM dataset_hmis`;
  assertEquals(rows.map((r) => r.data_id), [ELEMENT]);
});

Deno.test("rename: a new id that is not bare-shaped is written bracketed in expressions", async () => {
  await reset();
  const res = await rename("visits", "Visits 1st");
  assert(res.success, res.success ? "" : res.err);
  const d = await dictionary();
  assertEquals(d.get("visits_share")!.definition, { type: "derived", expression: "[Visits 1st] / visits_all" });
  assertEquals(d.get("chain")!.definition, { type: "derived", expression: "[Visits 1st] * 2 + visits_share" });
});

Deno.test("rename: a taken id and a reserved id are refused; a special id renames like any other", async () => {
  await reset();
  const special = await createIndicators(db, [indicator("penta1", { type: "uploaded", data_id: null })]);
  assert(special.success, special.success ? "" : special.err);
  const fromSpecial = await rename("penta1", "penta_one");
  assert(fromSpecial.success, fromSpecial.success ? "" : fromSpecial.err);
  const taken = await rename("visits", "visits_file");
  assert(!taken.success);
  assertStringIncludes(taken.err, "already taken");
  const reserved = await rename("visits", "population_total");
  assert(!reserved.success);
  assertStringIncludes(reserved.err, "reserved word");
  const toSpecialDerived = await rename("visits_share", "penta3");
  assert(!toSpecialDerived.success);
  assertStringIncludes(toSpecialDerived.err, "special indicator id");
  assertEquals(
    [...(await dictionary()).keys()].toSorted(),
    ["chain", "penta_one", "visits", "visits_all", "visits_file", "visits_share"],
  );
});

Deno.test("data id: fixed once rows exist, free without; Uploaded and DHIS2 element switch either way with rows", async () => {
  await reset();
  await seedRows(ELEMENT);
  const changed = await rename("visits", "visits", {
    definition: { type: "dhis2_element", data_id: OTHER_ELEMENT },
  });
  assert(!changed.success);
  assertStringIncludes(changed.err, "Cannot change the DHIS2 id of an indicator that has data");
  const toUploaded = await rename("visits", "visits", {
    definition: { type: "uploaded", data_id: ELEMENT },
  });
  assert(toUploaded.success, toUploaded.success ? "" : toUploaded.err);
  assertEquals((await dictionary()).get("visits")!.definition, { type: "uploaded", data_id: ELEMENT });
  const backToElement = await rename("visits", "visits", {
    definition: { type: "dhis2_element", data_id: ELEMENT },
  });
  assert(backToElement.success, backToElement.success ? "" : backToElement.err);
  const toSum = await rename("visits", "visits", {
    definition: { type: "sum", members: ["visits_file"] },
  });
  assert(!toSum.success);
  assertStringIncludes(toSum.err, "Cannot change the type of an indicator that has data");
  // No rows under VISITS_FILE: its data id may change or clear, but a
  // switch to DHIS2 element needs a DHIS2-shaped id.
  const freed = await rename("visits_file", "visits_file", {
    definition: { type: "uploaded", data_id: "VISITS_OTHER_FILE" },
  });
  assert(freed.success, freed.success ? "" : freed.err);
  const badShape = await rename("visits_file", "visits_file", {
    definition: { type: "dhis2_element", data_id: "VISITS_OTHER_FILE" },
  });
  assert(!badShape.success);
  assertStringIncludes(badShape.err, "must be a data element UID");
  const takenDataId = await rename("visits_file", "visits_file", {
    definition: { type: "dhis2_element", data_id: ELEMENT },
  });
  assert(!takenDataId.success);
  assertStringIncludes(takenDataId.err, "belongs to exactly one indicator");
  const namedBySum = await rename("visits_file", "visits_file", {
    definition: { type: "derived", expression: "visits * 2" },
    format_as: "percent",
  });
  assert(!namedBySum.success);
  assertStringIncludes(namedBySum.err, "a sum names");
});

Deno.test("renamer: whole identifiers and exact [id] only, text kept, as 086 does", () => {
  assertEquals(renameIdentifierInExpression("anc1 / anc1_all", "anc1", "x"), "x / anc1_all");
  assertEquals(renameIdentifierInExpression("[anc1] + [anc1 total]", "anc1", "x"), "[x] + [anc1 total]");
  assertEquals(renameIdentifierInExpression("coalesce(anc1,0)/anc1", "anc1", "x"), "coalesce(x,0)/x");
  assertEquals(renameIdentifierInExpression("anc1 / anc4", "anc1", "anc 1"), "[anc 1] / anc4");
  assertEquals(renameIdentifierInExpression("anc1 / anc4", "anc4", "abs"), "anc1 / [abs]");
  assertEquals(renameIdentifierInExpression("[a.b] * 2", "a.b", "ab"), "[ab] * 2");
  assertEquals(renameIdentifierInExpression("anc1 * 2", "anc", "x"), "anc1 * 2");
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
