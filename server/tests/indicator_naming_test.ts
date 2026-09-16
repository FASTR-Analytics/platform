// Pins the naming step's transaction (PLAN_A6 ruling 7): an element becomes
// a new DHIS2 element under the chosen id; an existing id of any type is
// refused; an element whose UID some indicator already holds creates
// nothing; a decomposed DHIS2 indicator becomes DHIS2 elements for its
// operands and a calculated over their ids; createIndicatorsFromDhis2 refuses
// a refused element or indicator and creates nothing. Runs on a throwaway
// database built from _main_database.sql on the dev postgres (the .env the
// test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/indicator_naming_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  type Dhis2ElementVerdict,
  type Dhis2IndicatorDecomposition,
  type HmisIndicator,
} from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  applyIndicatorNaming,
  createIndicators,
  createIndicatorsFromDhis2,
  type Dhis2NamingElement,
  getHmisIndicators,
  type NewIndicator,
} from "../db/instance/indicators.ts";
import { parseDhis2Indicator } from "../dhis2/goal2_indicators/decompose_indicator.ts";

const SCHEMA_PATH = new URL("../db/instance/_main_database.sql", import.meta.url)
  .pathname;
const DB_PREFIX = "naming_test_";

const ANC1_ELEMENT = "AbCdEfGhIj1";
const ANC1_OPERAND = "AbCdEfGhIj1.CocAaaaaaa1";
const ANC4_ELEMENT = "KlMnOpQrSt2";
const OTHER_ELEMENT = "UvWxYzAbCd3";
const DHIS2_INDICATOR = "InDiCaToR01";

const ACCEPTED: Dhis2ElementVerdict = { accepted: true };
const REFUSED: Dhis2ElementVerdict = {
  accepted: false,
  refusal: { kind: "period_type", value: "Yearly" },
};

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

function element(
  data_id: string,
  indicator_id: string,
  label = `Label ${data_id}`,
  verdict: Dhis2ElementVerdict = ACCEPTED,
): Dhis2NamingElement {
  return { data_id, indicator_id, label, verdict };
}

function decomposition(
  formula: { numerator: string; denominator: string; factor: number },
  verdicts: Record<string, Dhis2ElementVerdict> = {},
): Dhis2IndicatorDecomposition {
  const parse = parseDhis2Indicator({ ...formula, annualized: false });
  const operands = parse.accepted
    ? parse.operands.map((o) => ({
      ...o,
      verdict: verdicts[o.data_id] ?? ACCEPTED,
    }))
    : [];
  return {
    accepted: parse.accepted && operands.every((o) => o.verdict.accepted),
    parse,
    operands,
  };
}

const RATE = {
  numerator: `#{${ANC4_ELEMENT}}`,
  denominator: `#{${ANC1_ELEMENT}} + #{${ANC1_OPERAND}}`,
  factor: 100,
};

async function seed(
  id: string,
  definition: NewIndicator["definition"],
): Promise<void> {
  const res = await createIndicators(db, [{
    indicator_common_id: id,
    indicator_common_label: id,
    definition,
    include_in_analysis: true,
    format_as: definition.type === "calculated" ? "percent" : "number",
    thresholds: null,
    direction: "higher-is-better",
    target: null,
    expected_low_counts: false,
  }]);
  assert(res.success, res.success ? "" : res.err);
}

async function dictionary(): Promise<Map<string, HmisIndicator>> {
  return new Map(
    (await getHmisIndicators(db)).map((i) => [i.indicator_common_id, i]),
  );
}

Deno.test("dhis2: a refused element creates nothing", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC1_ELEMENT, "anc1", "ANC 1"),
      element(OTHER_ELEMENT, "other", "Other", REFUSED),
    ],
    indicators: [],
  });
  assert(!res.success);
  assertStringIncludes(res.err, `${OTHER_ELEMENT} cannot be imported`);
  assertStringIncludes(res.err, "none is monthly");
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: a decomposed indicator creates its elements and the calculated over them", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4", "ANC 4"),
      element(ANC1_ELEMENT, "anc1", "ANC 1"),
      element(ANC1_OPERAND, "anc1_repeat", "ANC 1 repeat"),
    ],
    indicators: [{
      uid: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 4 });
  const d = await dictionary();
  assertEquals([...d.keys()], ["anc4", "anc1", "anc1_repeat", "anc4_rate"]);
  assertEquals(d.get("anc4")!.definition, { type: "dhis2_element", data_id: ANC4_ELEMENT });
  assertEquals(d.get("anc4")!.indicator_common_label, "ANC 4");
  assertEquals(d.get("anc1")!.definition, { type: "dhis2_element", data_id: ANC1_ELEMENT });
  assertEquals(d.get("anc1_repeat")!.definition, {
    type: "dhis2_element",
    data_id: ANC1_OPERAND,
  });
  assertEquals(d.get("anc4_rate")!.definition, {
    type: "calculated",
    expression: "(anc4 / (anc1 + anc1_repeat))",
  });
  assertEquals(d.get("anc4_rate")!.format_as, "percent");
  for (const i of d.values()) assertEquals(i.include_in_analysis, true);
});

Deno.test("dhis2: two elements cannot share one new indicator", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC1_ELEMENT, "anc1", "ANC 1"),
      element(ANC1_OPERAND, "anc1", "ANC 1"),
    ],
    indicators: [],
  });
  assert(!res.success);
  assertStringIncludes(res.err, "more than one DHIS2 id");
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: a refused operand creates nothing", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4"),
      element(ANC1_ELEMENT, "anc1"),
      element(ANC1_OPERAND, "anc1_repeat"),
    ],
    indicators: [{
      uid: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE, { [ANC1_OPERAND]: REFUSED }),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, `operand ${ANC1_OPERAND} cannot be imported`);
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: a refused formula creates nothing", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [element(ANC4_ELEMENT, "anc4")],
    indicators: [{
      uid: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition({
        numerator: `#{${ANC4_ELEMENT}}`,
        denominator: "OUG{abcdefghij1}",
        factor: 100,
      }),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, "cannot be decomposed");
  assertStringIncludes(res.err, "OUG{abcdefghij1}");
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: an operand the naming step did not cover creates nothing", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [element(ANC4_ELEMENT, "anc4")],
    indicators: [{
      uid: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, `operand ${ANC1_ELEMENT} was not named`);
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: a calculated id already taken creates nothing, elements included", async () => {
  await reset();
  await seed("anc4_rate", { type: "uploaded" });
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4"),
      element(ANC1_ELEMENT, "anc1"),
      element(ANC1_OPERAND, "anc1_repeat"),
    ],
    indicators: [{
      uid: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, "already exist");
  assertEquals([...(await dictionary()).keys()], ["anc4_rate"]);
});

Deno.test("dhis2: a calculated under a special id is refused", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4"),
      element(ANC1_ELEMENT, "anc1"),
      element(ANC1_OPERAND, "anc1_repeat"),
    ],
    indicators: [{
      uid: DHIS2_INDICATOR,
      indicator_id: "penta1",
      label: "Penta 1 as a rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, "special indicator id");
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: an operand already imported renames the expression to its indicator and creates nothing for it", async () => {
  await reset();
  await seed("first_visits", { type: "dhis2_element", data_id: ANC1_OPERAND });
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4"),
      element(ANC1_ELEMENT, "anc1"),
      element(ANC1_OPERAND, "whatever"),
    ],
    indicators: [{
      uid: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 3 });
  const d = await dictionary();
  assertEquals(d.get("anc1")!.definition, { type: "dhis2_element", data_id: ANC1_ELEMENT });
  assertEquals(d.get("first_visits")!.definition, {
    type: "dhis2_element",
    data_id: ANC1_OPERAND,
  });
  assertEquals(d.has("whatever"), false);
  assertEquals(d.get("anc4_rate")!.definition, {
    type: "calculated",
    expression: "(anc4 / (anc1 + first_visits))",
  });
});

Deno.test("naming: a taken id (an Uploaded, a DHIS2 element, a sum, a calculated) is refused; nothing is assigned to", async () => {
  await reset();
  await seed("anc1", { type: "dhis2_element", data_id: ANC1_ELEMENT });
  await seed("anc1_file", { type: "uploaded" });
  await seed("anc1_share", { type: "calculated", expression: "anc1 / 2" });
  await seed("anc_all", { type: "sum", members: ["anc1"] });
  for (const taken of ["anc1", "anc1_file", "anc1_share", "anc_all"]) {
    const res = await applyIndicatorNaming(db, {
      elements: [{ data_id: ANC4_ELEMENT, indicator_id: taken, label: "x" }],
      calculated: [],
    });
    assert(!res.success, taken);
    assertStringIncludes(res.err, "already exists");
  }
  const d = await dictionary();
  assertEquals(d.size, 4);
  assertEquals(d.get("anc1_file")!.definition.type, "uploaded");
});

Deno.test("naming: a UID some indicator already holds is skipped and creates nothing", async () => {
  await reset();
  await seed("anc1", { type: "dhis2_element", data_id: ANC1_ELEMENT });
  const res = await applyIndicatorNaming(db, {
    elements: [{ data_id: ANC1_ELEMENT, indicator_id: "anc1_again", label: "x" }],
    calculated: [],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 0 });
  assertEquals([...(await dictionary()).keys()], ["anc1"]);
});

Deno.test("naming: a reserved new id is refused, a special id is a count like any other", async () => {
  await reset();
  const reserved = await applyIndicatorNaming(db, {
    elements: [{ data_id: ANC1_ELEMENT, indicator_id: "population_total", label: "x" }],
    calculated: [],
  });
  assert(!reserved.success);
  assertStringIncludes(reserved.err, "reserved word");
  const special = await applyIndicatorNaming(db, {
    elements: [{ data_id: ANC1_ELEMENT, indicator_id: "penta1", label: "Penta 1" }],
    calculated: [],
  });
  assert(special.success, special.success ? "" : special.err);
  assertEquals([...(await dictionary()).keys()], ["penta1"]);
});

Deno.test("naming: a calculated naming a DHIS2 id that was not listed is refused", async () => {
  await reset();
  const res = await applyIndicatorNaming(db, {
    elements: [{ data_id: ANC4_ELEMENT, indicator_id: "anc4", label: "ANC 4" }],
    calculated: [{
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      expression: `[${ANC4_ELEMENT}] / [${ANC1_ELEMENT}]`,
      format_as: "percent",
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, `not named: ${ANC1_ELEMENT}`);
  assertEquals((await dictionary()).size, 0);
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
