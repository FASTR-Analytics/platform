// Pins the save-time check of a typed DHIS2 element id: createIndicators and
// updateIndicator ask the check they are given once, with exactly the typed
// ids, after every local refusal and before the transaction; a refused id,
// a missing verdict and a throw each refuse the save with the message that
// says why, and nothing is written; an id that is not typed never asks;
// nothing is cached. Runs on a throwaway database built from
// _main_database.sql on the dev postgres (the .env the test task loads),
// dropped afterwards.
//
//   deno test -A --env-file server/tests/indicator_dhis2_id_check_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Dhis2ElementRefusal, Dhis2ElementVerdict } from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  createIndicators,
  type Dhis2ElementIdCheck,
  getHmisIndicators,
  type NewIndicator,
  updateIndicator,
} from "../db/instance/indicators.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url)
    .pathname;
const DB_PREFIX = "dhis2_id_check_test_";

const ANC1 = "AbCdEfGhIj1";
const ANC1_FEMALE = "AbCdEfGhIj1.CocFemale01";
const ANC4 = "KlMnOpQrSt2";
const FORMULA = "InDiCaToR01";

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

async function reset(): Promise<void> {
  await db`DELETE FROM indicator_sum_members`;
  await db`DELETE FROM indicators`;
}

function indicator(
  id: string,
  definition: NewIndicator["definition"],
): NewIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: `Label ${id}`,
    definition,
    include_in_analysis: true,
    format_as: definition.type === "calculated" ? "percent" : "number",
    thresholds: null,
    direction: "higher-is-better",
    target: null,
    expected_low_counts: false,
  };
}

function element(id: string, dataId: string): NewIndicator {
  return indicator(id, { type: "dhis2_element", data_id: dataId });
}

const ACCEPTED: Dhis2ElementVerdict = { accepted: true };

function refused(refusal: Dhis2ElementRefusal): Dhis2ElementVerdict {
  return { accepted: false, refusal };
}

// A check that records every call and answers each id from `answers`,
// or with no verdict where an id is not listed.
function recording(
  answers: Record<string, Dhis2ElementVerdict> = {},
): { check: Dhis2ElementIdCheck; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    check: (ids) => {
      calls.push([...ids]);
      return Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const verdict = answers[id];
            return verdict === undefined ? [] : [[id, verdict] as const];
          }),
        ),
      );
    },
  };
}

function acceptAll(): { check: Dhis2ElementIdCheck; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    check: (ids) => {
      calls.push([...ids]);
      return Promise.resolve(new Map(ids.map((id) => [id, ACCEPTED])));
    },
  };
}

async function ids(): Promise<string[]> {
  return (await getHmisIndicators(db)).map((i) => i.indicator_common_id)
    .sort();
}

async function dataIdOf(id: string): Promise<string | null> {
  const rows = await db<{ data_id: string | null }[]>`
    SELECT data_id FROM indicators WHERE indicator_common_id = ${id}
  `;
  return rows[0].data_id;
}

Deno.test("check: a create asks once with exactly the typed ids and saves when every verdict accepts", async () => {
  await reset();
  const { check, calls } = acceptAll();
  const res = await createIndicators(db, [
    indicator("uploaded", { type: "uploaded" }),
    element("anc1", ANC1),
    element("anc1_female", ANC1_FEMALE),
    indicator("sum", { type: "sum", members: ["anc1", "uploaded"] }),
  ], check);
  assert(res.success, res.success ? "" : res.err);
  assertEquals(calls, [[ANC1, ANC1_FEMALE]]);
  assertEquals(await ids(), ["anc1", "anc1_female", "sum", "uploaded"]);
});

Deno.test("check: a create with no DHIS2 element never asks", async () => {
  await reset();
  const { check, calls } = acceptAll();
  const res = await createIndicators(db, [
    indicator("uploaded", { type: "uploaded" }),
    indicator("rate", { type: "calculated", expression: "uploaded / 2" }),
  ], check);
  assert(res.success, res.success ? "" : res.err);
  assertEquals(calls, []);
});

Deno.test("check: a locally refused create never asks", async () => {
  await reset();
  const { check, calls } = acceptAll();
  const shape = await createIndicators(
    db,
    [element("anc1", "not-a-uid")],
    check,
  );
  assert(!shape.success);
  assertStringIncludes(shape.err, "must be a data element UID");
  const twice = await createIndicators(
    db,
    [element("anc1", ANC1), element("anc1", ANC4)],
    check,
  );
  assert(!twice.success);
  assertStringIncludes(twice.err, "Duplicate indicator IDs");
  const sameDataId = await createIndicators(
    db,
    [element("a", ANC1), element("b", ANC1)],
    check,
  );
  assert(!sameDataId.success);
  assertStringIncludes(sameDataId.err, "appear more than once");
  assertEquals(calls, []);
  assertEquals(await ids(), []);
});

Deno.test("check: each refusal refuses the create with the shared message naming the indicator, and nothing is saved", async () => {
  const cases: [Dhis2ElementRefusal, string][] = [
    [{ kind: "formula" }, "DHIS2 has it as a DHIS2 formula"],
    [{ kind: "element_not_found" }, "is not on the DHIS2 server"],
    [{ kind: "aggregation_type", value: "AVERAGE" }, "AVERAGE, not SUM"],
    [{ kind: "value_type", value: "TEXT" }, "TEXT, not a count"],
    [{ kind: "period_type", value: "Yearly" }, "none is monthly"],
    [{ kind: "combo_not_found", value: "CocFemale01" }, "no category option"],
    [{ kind: "default_combo", value: ANC1 }, `bare id ${ANC1}`],
  ];
  for (const [refusal, text] of cases) {
    await reset();
    const { check } = recording({ [ANC1]: refused(refusal) });
    const res = await createIndicators(db, [element("anc1", ANC1)], check);
    assert(!res.success);
    assertStringIncludes(
      res.err,
      `anc1: DHIS2 id "${ANC1}" cannot be imported: `,
    );
    assertStringIncludes(res.err, text);
    assertEquals(await ids(), []);
  }
});

Deno.test("check: in a batch the first refused id names its indicator", async () => {
  await reset();
  const { check, calls } = recording({
    [ANC1]: ACCEPTED,
    [FORMULA]: refused({ kind: "formula" }),
    [ANC4]: refused({ kind: "element_not_found" }),
  });
  const res = await createIndicators(db, [
    element("anc1", ANC1),
    element("coverage", FORMULA),
    element("anc4", ANC4),
  ], check);
  assert(!res.success);
  assertStringIncludes(res.err, `coverage: DHIS2 id "${FORMULA}"`);
  assertEquals(calls, [[ANC1, FORMULA, ANC4]]);
  assertEquals(await ids(), []);
});

Deno.test("check: a typed id with no verdict is refused as unconfirmed", async () => {
  await reset();
  const { check } = recording({ [ANC1]: ACCEPTED });
  const res = await createIndicators(db, [
    element("anc1", ANC1),
    element("anc4", ANC4),
  ], check);
  assert(!res.success);
  assertEquals(
    res.err,
    `DHIS2 could not confirm DHIS2 id "${ANC4}": no verdict was returned for it`,
  );
  assertEquals(await ids(), []);
});

Deno.test("check: a throw refuses the save and says DHIS2 could not confirm the id and why", async () => {
  await reset();
  const check: Dhis2ElementIdCheck = () =>
    Promise.reject(new Error("No stored DHIS2 credentials."));
  const one = await createIndicators(db, [
    indicator("uploaded", { type: "uploaded" }),
    element("anc1", ANC1),
  ], check);
  assert(!one.success);
  assertEquals(
    one.err,
    `DHIS2 could not confirm DHIS2 id "${ANC1}": No stored DHIS2 credentials.`,
  );
  const two = await createIndicators(db, [
    element("anc1", ANC1),
    element("anc4", ANC4),
  ], check);
  assert(!two.success);
  assertEquals(
    two.err,
    `DHIS2 could not confirm DHIS2 ids "${ANC1}", "${ANC4}": No stored DHIS2 credentials.`,
  );
  assertEquals(await ids(), []);
});

Deno.test("check: an update that keeps its id never asks; one that changes it asks for the new id only", async () => {
  await reset();
  const seeded = await createIndicators(db, [
    element("anc1", ANC1),
    indicator("uploaded", { type: "uploaded" }),
  ], acceptAll().check);
  assert(seeded.success, seeded.success ? "" : seeded.err);

  const kept = acceptAll();
  const relabelled = await updateIndicator(db, "anc1", {
    ...element("anc1", ANC1),
    indicator_common_label: "First antenatal visit",
    include_in_analysis: false,
  }, kept.check);
  assert(relabelled.success, relabelled.success ? "" : relabelled.err);
  const renamed = await updateIndicator(
    db,
    "anc1",
    element("anc_first", ANC1),
    kept.check,
  );
  assert(renamed.success, renamed.success ? "" : renamed.err);
  assertEquals(kept.calls, []);

  const changed = recording({ [ANC4]: refused({ kind: "formula" }) });
  const refusedChange = await updateIndicator(
    db,
    "anc_first",
    element("anc_first", ANC4),
    changed.check,
  );
  assert(!refusedChange.success);
  assertEquals(changed.calls, [[ANC4]]);
  assertStringIncludes(
    refusedChange.err,
    `anc_first: DHIS2 id "${ANC4}" cannot be imported: `,
  );
  assertEquals(await dataIdOf("anc_first"), ANC1);

  const accepted = acceptAll();
  const acceptedChange = await updateIndicator(
    db,
    "anc_first",
    element("anc_first", ANC4),
    accepted.check,
  );
  assert(
    acceptedChange.success,
    acceptedChange.success ? "" : acceptedChange.err,
  );
  assertEquals(accepted.calls, [[ANC4]]);
  assertEquals(await dataIdOf("anc_first"), ANC4);
});

Deno.test("check: a retype to DHIS2 element asks; a retype away from it does not", async () => {
  await reset();
  const seeded = await createIndicators(db, [
    indicator("uploaded", { type: "uploaded" }),
    element("anc4", ANC4),
  ], acceptAll().check);
  assert(seeded.success, seeded.success ? "" : seeded.err);

  const toElement = recording({
    [ANC1]: refused({ kind: "element_not_found" }),
  });
  const refusedRetype = await updateIndicator(
    db,
    "uploaded",
    element("uploaded", ANC1),
    toElement.check,
  );
  assert(!refusedRetype.success);
  assertEquals(toElement.calls, [[ANC1]]);
  const key = await dataIdOf("uploaded");
  assert(key !== null && key.startsWith("u_"));

  const accepted = acceptAll();
  const retyped = await updateIndicator(
    db,
    "uploaded",
    element("uploaded", ANC1),
    accepted.check,
  );
  assert(retyped.success, retyped.success ? "" : retyped.err);
  assertEquals(accepted.calls, [[ANC1]]);
  assertEquals(await dataIdOf("uploaded"), ANC1);

  const away = acceptAll();
  const toUploaded = await updateIndicator(
    db,
    "anc4",
    indicator("anc4", { type: "uploaded" }),
    away.check,
  );
  assert(toUploaded.success, toUploaded.success ? "" : toUploaded.err);
  const toCalculated = await updateIndicator(
    db,
    "uploaded",
    indicator("uploaded", { type: "calculated", expression: "anc4 * 2" }),
    away.check,
  );
  assert(toCalculated.success, toCalculated.success ? "" : toCalculated.err);
  assertEquals(away.calls, []);
});

Deno.test("check: a locally refused update never asks", async () => {
  await reset();
  const seeded = await createIndicators(db, [
    element("anc1", ANC1),
    element("anc4", ANC4),
  ], acceptAll().check);
  assert(seeded.success, seeded.success ? "" : seeded.err);
  const { check, calls } = acceptAll();
  const taken = await updateIndicator(
    db,
    "anc1",
    element("anc1", ANC4),
    check,
  );
  assert(!taken.success);
  assertStringIncludes(taken.err, "already belong to another");
  const shape = await updateIndicator(
    db,
    "anc1",
    element("anc1", "not-a-uid"),
    check,
  );
  assert(!shape.success);
  assertStringIncludes(shape.err, "must be a data element UID");
  assertEquals(calls, []);
  assertEquals(await dataIdOf("anc1"), ANC1);
});

Deno.test("check: nothing is cached, so the same id is asked again on the next save", async () => {
  await reset();
  const { check, calls } = recording({
    [ANC1]: refused({ kind: "element_not_found" }),
  });
  const first = await createIndicators(db, [element("anc1", ANC1)], check);
  assert(!first.success);
  const second = await createIndicators(db, [element("anc1", ANC1)], check);
  assert(!second.success);
  assertEquals(calls, [[ANC1], [ANC1]]);
});
