// Pins the naming step's transaction (PLAN_A3 ruling 6, step 5):
// createIndicatorsFromDhis2 refuses a refused element or indicator and
// creates nothing; an accepted indicator creates its bases, their sources
// and the derived over them, or nothing; applyIndicatorNaming attaches to
// existing bases and rewrites derived expressions to the bases their
// operands land in. Runs on a throwaway database built from
// _main_database.sql on the dev postgres (the .env the test task loads),
// dropped afterwards.
//
//   deno test -A --env-file server/tests/indicator_naming_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Sql } from "postgres";
import {
  type Dhis2IndicatorDecomposition,
  type Dhis2SourceVerdict,
  type IndicatorWithSources,
} from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  applyIndicatorNaming,
  createIndicators,
  createIndicatorsFromDhis2,
  type Dhis2NamingSource,
  getIndicatorsWithSources,
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

const ACCEPTED: Dhis2SourceVerdict = { accepted: true };
const REFUSED: Dhis2SourceVerdict = {
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

function source(
  source_id: string,
  target: Dhis2NamingSource["target"],
  verdict: Dhis2SourceVerdict = ACCEPTED,
): Dhis2NamingSource {
  return { source_id, source_label: `Label ${source_id}`, target, verdict };
}

function decomposition(
  formula: { numerator: string; denominator: string; factor: number },
  verdicts: Record<string, Dhis2SourceVerdict> = {},
): Dhis2IndicatorDecomposition {
  const parse = parseDhis2Indicator({ ...formula, annualized: false });
  const operands = parse.accepted
    ? parse.operands.map((o) => ({
      ...o,
      verdict: verdicts[o.source_id] ?? ACCEPTED,
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

async function seedBase(id: string, sourceIds: string[]): Promise<void> {
  const res = await createIndicators(db, [{
    indicator_common_id: id,
    indicator_common_label: id,
    sources: sourceIds.map((source_id) => ({ source_id, source_label: source_id })),
    definition: { type: "base" },
    format_as: "number",
    thresholds: null,
  }]);
  assert(res.success, res.success ? "" : res.err);
}

async function seedDerived(id: string, expression: string): Promise<void> {
  const res = await createIndicators(db, [{
    indicator_common_id: id,
    indicator_common_label: id,
    sources: [],
    definition: { type: "derived", expression },
    format_as: "percent",
    thresholds: null,
  }]);
  assert(res.success, res.success ? "" : res.err);
}

async function dictionary(): Promise<Map<string, IndicatorWithSources>> {
  return new Map(
    (await getIndicatorsWithSources(db)).map((i) => [i.indicator_common_id, i]),
  );
}

async function sourceCount(): Promise<number> {
  return (await db<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM indicator_sources`)[0].n;
}

Deno.test("dhis2: a refused element creates nothing", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    sources: [
      source(ANC1_ELEMENT, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
      source(OTHER_ELEMENT, { kind: "new", indicator_id: "other", label: "Other" }, REFUSED),
    ],
    indicators: [],
  });
  assert(!res.success);
  assertStringIncludes(res.err, `${OTHER_ELEMENT} cannot be a source`);
  assertStringIncludes(res.err, "none is monthly");
  assertEquals((await dictionary()).size, 0);
  assertEquals(await sourceCount(), 0);
});

Deno.test("dhis2: a decomposed indicator creates its bases, sources and derived", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    sources: [
      source(ANC4_ELEMENT, { kind: "new", indicator_id: "anc4", label: "ANC 4" }),
      source(ANC1_ELEMENT, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
      source(ANC1_OPERAND, { kind: "new", indicator_id: "anc1", label: "ignored" }),
    ],
    indicators: [{
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 3, attached: 0 });
  const d = await dictionary();
  assertEquals([...d.keys()], ["anc4", "anc1", "anc4_rate"]);
  assertEquals(d.get("anc4")!.sources.map((s) => s.source_id), [ANC4_ELEMENT]);
  assertEquals(d.get("anc4")!.indicator_common_label, "ANC 4");
  assertEquals(
    d.get("anc1")!.sources.map((s) => s.source_id),
    [ANC1_ELEMENT, ANC1_OPERAND],
  );
  assertEquals(d.get("anc1")!.indicator_common_label, "ANC 1");
  assertEquals(d.get("anc4_rate")!.definition, {
    type: "derived",
    expression: "(anc4 / (anc1 + anc1))",
  });
  assertEquals(d.get("anc4_rate")!.format_as, "percent");
  assertEquals(d.get("anc4_rate")!.sources, []);
});

Deno.test("dhis2: a refused operand creates nothing", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    sources: [
      source(ANC4_ELEMENT, { kind: "new", indicator_id: "anc4", label: "ANC 4" }),
      source(ANC1_ELEMENT, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
      source(ANC1_OPERAND, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
    ],
    indicators: [{
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE, { [ANC1_OPERAND]: REFUSED }),
    }],
  });
  assert(!res.success);
  assertStringIncludes(res.err, `operand ${ANC1_OPERAND} cannot be a source`);
  assertEquals((await dictionary()).size, 0);
  assertEquals(await sourceCount(), 0);
});

Deno.test("dhis2: a refused formula creates nothing", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    sources: [
      source(ANC4_ELEMENT, { kind: "new", indicator_id: "anc4", label: "ANC 4" }),
    ],
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
    sources: [
      source(ANC4_ELEMENT, { kind: "new", indicator_id: "anc4", label: "ANC 4" }),
    ],
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
  await seedBase("anc4_rate", []);
  const res = await createIndicatorsFromDhis2(db, {
    sources: [
      source(ANC4_ELEMENT, { kind: "new", indicator_id: "anc4", label: "ANC 4" }),
      source(ANC1_ELEMENT, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
      source(ANC1_OPERAND, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
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
  assertEquals(await sourceCount(), 0);
});

Deno.test("dhis2: a derived under a special id is refused", async () => {
  await reset();
  const res = await createIndicatorsFromDhis2(db, {
    sources: [
      source(ANC4_ELEMENT, { kind: "new", indicator_id: "anc4", label: "ANC 4" }),
      source(ANC1_ELEMENT, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
      source(ANC1_OPERAND, { kind: "new", indicator_id: "anc1", label: "ANC 1" }),
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

Deno.test("dhis2: operands attached to existing bases rename the expression to them", async () => {
  await reset();
  await seedBase("anc1", [ANC1_ELEMENT]);
  await seedBase("first_visits", []);
  const res = await createIndicatorsFromDhis2(db, {
    sources: [
      source(ANC4_ELEMENT, { kind: "new", indicator_id: "anc4", label: "ANC 4" }),
      source(ANC1_ELEMENT, { kind: "attach", indicator_id: "anc1" }),
      source(ANC1_OPERAND, { kind: "attach", indicator_id: "first_visits" }),
    ],
    indicators: [{
      dhis2_id: DHIS2_INDICATOR,
      indicator_id: "anc4_rate",
      label: "ANC 4 rate",
      decomposition: decomposition(RATE),
    }],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 2, attached: 1 });
  const d = await dictionary();
  assertEquals(d.get("anc1")!.sources.map((s) => s.source_id), [ANC1_ELEMENT]);
  assertEquals(
    d.get("first_visits")!.sources.map((s) => s.source_id),
    [ANC1_OPERAND],
  );
  assertEquals(d.get("anc4_rate")!.definition, {
    type: "derived",
    expression: "(anc4 / (anc1 + first_visits))",
  });
});

Deno.test("naming: attaching to an existing base adds the source and keeps the rest", async () => {
  await reset();
  await seedBase("anc1", [ANC1_ELEMENT]);
  const res = await applyIndicatorNaming(db, {
    sources: [{
      source_id: ANC1_OPERAND,
      source_label: "ANC 1 (operand)",
      target: { kind: "attach", indicator_id: "anc1" },
    }],
    derived: [],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 0, attached: 1 });
  const d = await dictionary();
  assertEquals(d.get("anc1")!.sources, [
    { source_id: ANC1_ELEMENT, source_label: ANC1_ELEMENT },
    { source_id: ANC1_OPERAND, source_label: "ANC 1 (operand)" },
  ]);
});

Deno.test("naming: attaching to a derived, to a missing indicator, or a source owned elsewhere is refused", async () => {
  await reset();
  await seedBase("anc1", [ANC1_ELEMENT]);
  await seedDerived("anc1_share", "anc1 / 2");
  const before = await sourceCount();
  for (
    const [target, needle] of [
      [{ kind: "attach", indicator_id: "anc1_share" }, "is derived"],
      [{ kind: "attach", indicator_id: "nope" }, "does not exist"],
      [{ kind: "new", indicator_id: "anc1", label: "ANC 1" }, "already exists"],
    ] as const
  ) {
    const res = await applyIndicatorNaming(db, {
      sources: [{ source_id: ANC4_ELEMENT, source_label: "x", target }],
      derived: [],
    });
    assert(!res.success);
    assertStringIncludes(res.err, needle);
  }
  const owned = await applyIndicatorNaming(db, {
    sources: [{
      source_id: ANC1_ELEMENT,
      source_label: "x",
      target: { kind: "new", indicator_id: "anc1_again", label: "ANC 1 again" },
    }],
    derived: [],
  });
  assert(!owned.success);
  assertStringIncludes(owned.err, "already belong to another");
  assertEquals(await sourceCount(), before);
  assertEquals((await dictionary()).size, 2);
});

Deno.test("naming: a source already under its target base is nothing to write", async () => {
  await reset();
  await seedBase("anc1", [ANC1_ELEMENT]);
  const res = await applyIndicatorNaming(db, {
    sources: [{
      source_id: ANC1_ELEMENT,
      source_label: "renamed",
      target: { kind: "attach", indicator_id: "anc1" },
    }],
    derived: [],
  });
  assert(res.success, res.success ? "" : res.err);
  assertEquals(res.data, { created: 0, attached: 0 });
  assertEquals((await dictionary()).get("anc1")!.sources[0].source_label, ANC1_ELEMENT);
});

Deno.test("naming: a reserved new id is refused, a special id is a base like any other", async () => {
  await reset();
  const reserved = await applyIndicatorNaming(db, {
    sources: [{
      source_id: ANC1_ELEMENT,
      source_label: "x",
      target: { kind: "new", indicator_id: "population_total", label: "Population" },
    }],
    derived: [],
  });
  assert(!reserved.success);
  assertStringIncludes(reserved.err, "reserved word");
  const special = await applyIndicatorNaming(db, {
    sources: [{
      source_id: ANC1_ELEMENT,
      source_label: "x",
      target: { kind: "new", indicator_id: "penta1", label: "Penta 1" },
    }],
    derived: [],
  });
  assert(special.success, special.success ? "" : special.err);
  assertEquals([...(await dictionary()).keys()], ["penta1"]);
});

Deno.test("naming: a derived naming a source that was not listed is refused", async () => {
  await reset();
  const res = await applyIndicatorNaming(db, {
    sources: [{
      source_id: ANC4_ELEMENT,
      source_label: "x",
      target: { kind: "new", indicator_id: "anc4", label: "ANC 4" },
    }],
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
