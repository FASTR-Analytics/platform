// Pins the naming step's transaction (PLAN_A4 ruling 6): an element becomes
// a new base under the chosen id, or assigns its UID to an existing base
// that has no dhis2_id; any other existing id is refused; an element whose
// UID already belongs to an indicator creates nothing; a decomposed DHIS2
// indicator becomes bases for its operands and a derived over their ids;
// createIndicatorsFromDhis2 refuses a refused element or indicator and
// creates nothing. Runs on a throwaway database built from
// _main_database.sql on the dev postgres (the .env the test task loads),
// dropped afterwards.
//
//   deno test -A --env-file server/tests/indicator_naming_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  type CommonIndicator,
  type Dhis2IndicatorDecomposition,
  type Dhis2ElementVerdict,
} from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  applyIndicatorNaming,
  createIndicators,
  createIndicatorsFromDhis2,
  type Dhis2NamingElement,
  getCommonIndicators,
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
  await db`DELETE FROM indicators`;
}

function element(
  dhis2_id: string,
  indicator_id: string,
  label = `Label ${dhis2_id}`,
  verdict: Dhis2ElementVerdict = ACCEPTED,
): Dhis2NamingElement {
  return { dhis2_id, indicator_id, label, verdict };
}

function decomposition(
  formula: { numerator: string; denominator: string; factor: number },
  verdicts: Record<string, Dhis2ElementVerdict> = {},
): Dhis2IndicatorDecomposition {
  const parse = parseDhis2Indicator({ ...formula, annualized: false });
  const operands = parse.accepted
    ? parse.operands.map((o) => ({
      ...o,
      verdict: verdicts[o.dhis2_id] ?? ACCEPTED,
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

async function seedBase(id: string, dhis2Id: string | null): Promise<void> {
  const res = await createIndicators(db, [{
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "base", dhis2_id: dhis2Id },
    include_in_analysis: true,
    format_as: "number",
    thresholds: null,
  }]);
  assert(res.success, res.success ? "" : res.err);
}

async function seedDerived(id: string, expression: string): Promise<void> {
  const res = await createIndicators(db, [{
    indicator_common_id: id,
    indicator_common_label: id,
    definition: { type: "derived", expression },
    include_in_analysis: true,
    format_as: "percent",
    thresholds: null,
  }]);
  assert(res.success, res.success ? "" : res.err);
}

async function dictionary(): Promise<Map<string, CommonIndicator>> {
  return new Map(
    (await getCommonIndicators(db)).map((i) => [i.indicator_common_id, i]),
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

Deno.test("dhis2: a decomposed indicator creates its bases and the derived over them", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4", "ANC 4"),
      element(ANC1_ELEMENT, "anc1", "ANC 1"),
      element(ANC1_OPERAND, "anc1_repeat", "ANC 1 repeat"),
    ],
    indicators: [{
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 4, assigned: 0 });
  const d = await dictionary();
  assertEquals([...d.keys()], ["anc4", "anc1", "anc1_repeat", "anc4_rate"]);
  assertEquals(d.get("anc4")!.definition, { type: "base", dhis2_id: ANC4_ELEMENT });
  assertEquals(d.get("anc4")!.indicator_common_label, "ANC 4");
  assertEquals(d.get("anc1")!.definition, { type: "base", dhis2_id: ANC1_ELEMENT });
  assertEquals(d.get("anc1_repeat")!.definition, {
    type: "base",
    dhis2_id: ANC1_OPERAND,
  });
  assertEquals(d.get("anc4_rate")!.definition, {
    type: "derived",
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
      dhis2_id: DHIS2_INDICATOR,
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
      dhis2_id: DHIS2_INDICATOR,
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
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, `operand ${ANC1_ELEMENT} was not named`);
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: a derived id already taken creates nothing, bases included", async () => {
  await reset();
  await seedBase("anc4_rate", null);
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4"),
      element(ANC1_ELEMENT, "anc1"),
      element(ANC1_OPERAND, "anc1_repeat"),
    ],
    indicators: [{
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, "already exist");
  assertEquals([...(await dictionary()).keys()], ["anc4_rate"]);
});

Deno.test("dhis2: a derived under a special id is refused", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4"),
      element(ANC1_ELEMENT, "anc1"),
      element(ANC1_OPERAND, "anc1_repeat"),
    ],
    indicators: [{
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "penta1",
      label: "Penta 1 as a rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, "special indicator id");
  assertEquals((await dictionary()).size, 0);
});

Deno.test("dhis2: operands assigned to empty bases or already imported rename the expression to them", async () => {
  await reset();
  await seedBase("anc1", null);
  await seedBase("first_visits", ANC1_OPERAND);
  const res = await createIndicatorsFromDhis2(db, {
    elements: [
      element(ANC4_ELEMENT, "anc4"),
      element(ANC1_ELEMENT, "anc1"),
      element(ANC1_OPERAND, "whatever"),
    ],
    indicators: [{
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 2, assigned: 1 });
  const d = await dictionary();
  assertEquals(d.get("anc1")!.definition, { type: "base", dhis2_id: ANC1_ELEMENT });
  assertEquals(d.get("first_visits")!.definition, {
    type: "base",
    dhis2_id: ANC1_OPERAND,
  });
  assertEquals(d.has("whatever"), false);
  assertEquals(d.get("anc4_rate")!.definition, {
    type: "derived",
    expression: "(anc4 / (anc1 + first_visits))",
  });
});

Deno.test("naming: assigning to an empty base sets its dhis2_id and keeps the rest", async () => {
  await reset();
  await seedBase("anc1", null);
  const res = await applyIndicatorNaming(db, {
    elements: [{ dhis2_id: ANC1_ELEMENT, indicator_id: "anc1", label: "ignored" }],
    uploaded: [],
    derived: [],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 0, assigned: 1 });
  const anc1 = (await dictionary()).get("anc1")!;
  assertEquals(anc1.definition, { type: "base", dhis2_id: ANC1_ELEMENT });
  assertEquals(anc1.indicator_common_label, "anc1");
});

Deno.test("naming: a taken id (a base with a dhis2_id, a sum, a derived) is refused", async () => {
  await reset();
  await seedBase("anc1", ANC1_ELEMENT);
  await seedDerived("anc1_share", "anc1 / 2");
  const sumRes = await createIndicators(db, [{
    indicator_common_id: "anc_all",
    indicator_common_label: "ANC all",
    definition: { type: "sum", members: ["anc1"] },
    include_in_analysis: true,
    format_as: "number",
    thresholds: null,
  }]);
  assert(sumRes.success, sumRes.success ? "" : sumRes.err);
  for (const taken of ["anc1", "anc1_share", "anc_all"]) {
    const res = await applyIndicatorNaming(db, {
      elements: [{ dhis2_id: ANC4_ELEMENT, indicator_id: taken, label: "x" }],
      uploaded: [],
      derived: [],
    });
    assert(!res.success, taken);
    assertStringIncludes(res.err, "already exists and cannot take");
  }
  assertEquals((await dictionary()).size, 3);
});

Deno.test("naming: a UID that already belongs to an indicator is skipped and creates nothing", async () => {
  await reset();
  await seedBase("anc1", ANC1_ELEMENT);
  const res = await applyIndicatorNaming(db, {
    elements: [{ dhis2_id: ANC1_ELEMENT, indicator_id: "anc1_again", label: "x" }],
    uploaded: [],
    derived: [],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 0, assigned: 0 });
  assertEquals([...(await dictionary()).keys()], ["anc1"]);
});

Deno.test("naming: an uploaded base takes the file's id, and an existing id is refused", async () => {
  await reset();
  await seedBase("anc1", null);
  const res = await applyIndicatorNaming(db, {
    elements: [],
    uploaded: [{ indicator_id: "opd_csv", label: "OPD (file)" }],
    derived: [],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 1, assigned: 0 });
  assertEquals((await dictionary()).get("opd_csv")!.definition, {
    type: "base",
    dhis2_id: null,
  });
  const dup = await applyIndicatorNaming(db, {
    elements: [],
    uploaded: [{ indicator_id: "anc1", label: "x" }],
    derived: [],
  });
  assert(!dup.success);
  assertStringIncludes(dup.err, "already exists");
});

Deno.test("naming: a reserved new id is refused, a special id is a base like any other", async () => {
  await reset();
  const reserved = await applyIndicatorNaming(db, {
    elements: [{ dhis2_id: ANC1_ELEMENT, indicator_id: "population_total", label: "x" }],
    uploaded: [],
    derived: [],
  });
  assert(!reserved.success);
  assertStringIncludes(reserved.err, "reserved word");
  const special = await applyIndicatorNaming(db, {
    elements: [{ dhis2_id: ANC1_ELEMENT, indicator_id: "penta1", label: "Penta 1" }],
    uploaded: [],
    derived: [],
  });
  assert(special.success, special.success ? "" : special.err);
  assertEquals([...(await dictionary()).keys()], ["penta1"]);
});

Deno.test("naming: a derived naming a DHIS2 id that was not listed is refused", async () => {
  await reset();
  const res = await applyIndicatorNaming(db, {
    elements: [{ dhis2_id: ANC4_ELEMENT, indicator_id: "anc4", label: "ANC 4" }],
    uploaded: [],
    derived: [{
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
