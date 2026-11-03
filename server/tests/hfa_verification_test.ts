// Pins the HFA indicator verification. The rules list: one entry per rule
// id, each with its text in every language and the field it shows beside,
// every group and severity labelled, and the app rules exactly the status
// core's issue kinds. The builders: the instruction block names the model
// rules and no app rule, the schemas take the model's shapes, the hash
// ignores the display rows and the dismissed section, the context block is
// one text per snapshot, and a fix becomes an editor patch. The save, the
// dismissal, the rule switches and the version stamp run on a throwaway
// database built from _main_database.sql on the dev postgres (the .env the
// test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/hfa_verification_test.ts

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  buildHfaVerificationBlocks,
  buildHfaVerificationInstructionBlock,
  buildHfaVerificationMessages,
  fixToPatch,
  HFA_VERIFICATION_MODEL_RULE_IDS,
  HFA_VERIFICATION_RULE_GROUPS,
  HFA_VERIFICATION_RULES,
  HFA_VERIFICATION_SEVERITIES,
  type HfaCodeIssueKind,
  hfaFixOutputSchema,
  type HfaIndicator,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
  type HfaVerificationFinding,
  hfaVerificationInputHash,
  hfaVerificationOutputSchema,
  type HfaVerificationRule,
} from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  getHfaVerification,
  getHfaVerificationRulesOff,
  getHfaVerificationVersion,
  saveHfaIndicatorVerifications,
  setHfaVerificationFindingsDismissed,
  setHfaVerificationRulesOff,
} from "../db/instance/hfa_verification.ts";

type Equal<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;

Deno.test("rules: ids unique, every rule with en, fr and pt text and a field, every group and severity labelled", () => {
  const ids = HFA_VERIFICATION_RULES.map((r) => r.id);
  assertEquals(new Set(ids).size, ids.length);
  for (const r of HFA_VERIFICATION_RULES) {
    for (const lang of ["en", "fr", "pt"] as const) {
      assert(r.text[lang].trim() !== "", `${r.id} has no ${lang} text`);
    }
    assert(r.field.trim() !== "", `${r.id} has no field`);
    assert(r.group in HFA_VERIFICATION_RULE_GROUPS, `${r.id}: ${r.group}`);
    assert(r.severity in HFA_VERIFICATION_SEVERITIES, `${r.id}: ${r.severity}`);
  }
  for (
    const label of [
      ...Object.values(HFA_VERIFICATION_RULE_GROUPS),
      ...Object.values(HFA_VERIFICATION_SEVERITIES),
    ]
  ) {
    for (const lang of ["en", "fr", "pt"] as const) {
      assert(label[lang].trim() !== "", `${label.en} has no ${lang} label`);
    }
  }
  assertEquals(
    HFA_VERIFICATION_MODEL_RULE_IDS,
    HFA_VERIFICATION_RULES.filter((r) => r.checker === "model").map((r) =>
      r.id
    ),
  );
});

Deno.test("rules: the app rules are the status core's issue kinds", () => {
  const appRulesAreIssueKinds: Equal<
    Extract<HfaVerificationRule, { checker: "app" }>["id"],
    HfaCodeIssueKind
  > = true;
  assert(appRulesAreIssueKinds);
});

const ind = (indicatorId: string, definition: string): HfaIndicator => ({
  indicatorId,
  categoryId: "cat_a",
  subCategoryId: null,
  serviceCategoryIds: [],
  shortLabel: "",
  definition,
  type: "binary",
  aggregation: "avg",
  sortOrder: 0,
  variantGroupId: null,
});

function snapshot(withDisplayRows: boolean): HfaIndicatorsForAIInput {
  const indicators = [
    ind("ind001", "facilities with water"),
    ind("ind002", "facilities with power"),
  ];
  const code = [
    { indicatorId: "ind001", timePoint: "R1", code: "wat_01 == 1" },
    { indicatorId: "ind002", timePoint: "R1", code: "pow_01 != 2" },
  ];
  const dictionary = {
    timePoints: [{
      timePoint: "R1",
      variables: [
        {
          variableId: "wat_01",
          variableLabel: "Water",
          variableType: "select_one",
        },
        {
          variableId: "pow_01",
          variableLabel: "Power",
          variableType: "select_one",
        },
      ],
      values: [
        {
          variableId: "wat_01",
          value: "1",
          valueLabel: "Yes",
          sentinelClass: "" as const,
        },
        {
          variableId: "wat_01",
          value: "2",
          valueLabel: "No",
          sentinelClass: "" as const,
        },
      ],
    }],
  };
  const taxonomy = {
    categories: [{ id: "cat_a", label: "Infrastructure", sortOrder: 0 }],
    subCategories: [],
    serviceCategories: [],
    variantGroups: [],
    variantItems: [],
  };
  return {
    indicators,
    code,
    variantCode: [],
    taxonomy,
    dictionary,
    status: hfaIndicatorsStatus({
      indicators,
      code,
      variantCode: [],
      variantItems: [],
      dictionary,
    }),
    displayRows: withDisplayRows
      ? [{
        variableId: "wat_01",
        timePoint: "R1",
        count: 40,
        missing: 3,
        dataValues: "1, 2",
      }]
      : undefined,
  } as HfaIndicatorsForAIInput;
}

const dismissed: HfaVerificationFinding = {
  id: "f1",
  indicatorId: "ind002",
  rule: "positive_test",
  timePoint: "R1",
  message: "The code tests power by negation.",
  suggestion: null,
  dismissedAt: "2026-11-03T00:00:00.000Z",
  dismissedBy: "a@b.c",
  createdAt: "2026-11-02T00:00:00.000Z",
};

Deno.test("instruction block: every model rule by id, no app rule, one finding per rule and round, the instance language", () => {
  const block = buildHfaVerificationInstructionBlock("fr");
  for (const r of HFA_VERIFICATION_RULES) {
    assertEquals(
      block.includes(`\`${r.id}\``),
      r.checker === "model",
      `${r.id} (${r.checker})`,
    );
  }
  assert(block.includes("At most one finding per rule and round."));
  assert(block.includes("Write every text you return in French."));
});

Deno.test("output schema: takes findings of model rules, refuses an app rule and an unknown rule; the fix schema needs a note", () => {
  const finding = {
    rule: "positive_test",
    timePoint: "R1",
    message: "m",
    suggestion: null,
  };
  assert(hfaVerificationOutputSchema.safeParse({ findings: [] }).success);
  assert(
    hfaVerificationOutputSchema.safeParse({ findings: [finding] }).success,
  );
  assert(
    hfaVerificationOutputSchema.safeParse({
      findings: [{ ...finding, timePoint: null, suggestion: "s" }],
    }).success,
  );
  for (const rule of ["syntax", "no_such_rule"]) {
    assert(
      !hfaVerificationOutputSchema.safeParse({
        findings: [{ ...finding, rule }],
      }).success,
      rule,
    );
  }
  const fix = {
    shortLabel: null,
    definition: null,
    type: null,
    aggregation: null,
    categoryId: null,
    subCategoryId: null,
    serviceCategoryIds: null,
    variantGroupId: null,
    code: null,
    variantCode: null,
    note: "Nothing.",
  };
  assert(hfaFixOutputSchema.safeParse(fix).success);
  const { note: _, ...noNote } = fix;
  assert(!hfaFixOutputSchema.safeParse(noNote).success);
});

Deno.test("messages: the hash ignores the display rows and the dismissed section; the sent message ends with the dismissed section only when there is one", async () => {
  const instruction = buildHfaVerificationInstructionBlock("en");
  const withRows = buildHfaVerificationMessages(
    snapshot(true),
    new Map([["ind002", [dismissed]]]),
  );
  const withoutRows = buildHfaVerificationMessages(snapshot(false), new Map());
  const hash = (m: Map<string, { hashedMessage: string }>, id: string) =>
    hfaVerificationInputHash(instruction, m.get(id)!.hashedMessage);
  for (const id of ["ind001", "ind002"]) {
    assertEquals(await hash(withRows, id), await hash(withoutRows, id));
  }
  assertEquals(
    await hash(withRows, "ind001"),
    await hash(
      buildHfaVerificationMessages(snapshot(true), new Map()),
      "ind001",
    ),
  );
  assertNotEquals(
    await hash(withRows, "ind001"),
    await hash(withRows, "ind002"),
  );
  assertNotEquals(
    await hash(withRows, "ind001"),
    await hfaVerificationInputHash(
      buildHfaVerificationInstructionBlock("fr"),
      withRows.get("ind001")!.hashedMessage,
    ),
  );
  assert((await hash(withRows, "ind001")).match(/^[0-9a-f]{64}$/));

  const sent = withRows.get("ind002")!.message;
  assert(
    sent.endsWith(
      "## Findings the user dismissed\n- `positive_test`, round R1: The code tests power by negation.",
    ),
  );
  assert(sent.includes("data: no rows"));
  const undismissed = withRows.get("ind001")!.message;
  assert(undismissed.includes("data: 40 facilities"));
  assert(!undismissed.includes("dismissed"));
  assertEquals(
    withoutRows.get("ind001")!.message,
    withoutRows.get("ind001")!.hashedMessage,
  );
});

Deno.test("context block: one text per snapshot, whichever indicator is sent", () => {
  const a = buildHfaVerificationBlocks(snapshot(true), "en");
  const b = buildHfaVerificationBlocks(snapshot(true), "en");
  assertEquals(a.contextBlock, b.contextBlock);
  assert(
    a.contextBlock.includes("ind001") && a.contextBlock.includes("ind002"),
  );
  assert(
    a.contextBlock.includes("wat_01") && a.contextBlock.includes("pow_01"),
  );
  assertEquals(a.instructionBlock, buildHfaVerificationInstructionBlock("en"));
});

Deno.test("fixToPatch: null fields absent, rounds and variant rows carried", () => {
  assertEquals(
    fixToPatch({
      shortLabel: null,
      definition: "Facilities with piped water",
      type: null,
      aggregation: "avg",
      categoryId: null,
      subCategoryId: null,
      serviceCategoryIds: [],
      variantGroupId: null,
      code: [
        { timePoint: "R1", code: "wat_01 == 1", filterCode: null },
        { timePoint: "R2", code: null, filterCode: "" },
      ],
      variantCode: [{ timePoint: "R1", itemId: "piped", code: "" }],
      note: "Narrows the label.",
    }),
    {
      definition: "Facilities with piped water",
      aggregation: "avg",
      serviceCategoryIds: [],
      code: [
        { timePoint: "R1", code: "wat_01 == 1" },
        { timePoint: "R2", filterCode: "" },
      ],
      variantCode: [{ timePoint: "R1", itemId: "piped", code: "" }],
    },
  );
});

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "hfa_verification_test_";

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
  VALUES ('R1', '202401', 0), ('R2', '202501', 1)
`;
await db`
  INSERT INTO hfa_indicators (indicator_id, type, aggregation)
  VALUES ('ind001', 'binary', 'avg'), ('ind002', 'binary', 'avg'),
    ('ind003', 'binary', 'avg')
`;

const found = (
  rule: HfaVerificationFinding["rule"],
  timePoint: string | null,
  message: string,
  suggestion: string | null = null,
) => ({ rule, timePoint, message, suggestion });

async function findingsOf(indicatorId: string) {
  const res = await getHfaVerification(db);
  assert(res.success);
  return res.data.findings
    .filter((f) => f.indicatorId === indicatorId)
    .map((f) => ({
      rule: f.rule,
      timePoint: f.timePoint,
      message: f.message,
      suggestion: f.suggestion,
      dismissed: f.dismissedAt !== null,
    }))
    .sort((a, b) =>
      `${a.rule}${a.timePoint}${a.dismissed}`.localeCompare(
        `${b.rule}${b.timePoint}${b.dismissed}`,
      )
    );
}

Deno.test("save: several results in one call, a round that is not a time point dropped, one rule and round merged, a deleted indicator skipped", async () => {
  const res = await saveHfaIndicatorVerifications(db, [
    {
      indicatorId: "ind001",
      inputHash: "h1",
      model: "m",
      findings: [
        found("positive_test", "R1", "First.", "Fix one."),
        found("positive_test", "R1", "Second.", "Fix two."),
        found("label_matches_code", "R9", "No such round."),
        found("category_fits", null, "Whole indicator."),
      ],
    },
    { indicatorId: "ind002", inputHash: "h2", model: "m", findings: [] },
    { indicatorId: "gone", inputHash: "h3", model: "m", findings: [] },
  ], "a@b.c");
  assert(res.success, res.success ? "" : res.err);
  const rows = await getHfaVerification(db);
  assert(rows.success);
  assertEquals(
    rows.data.verifications.map((v) => [v.indicatorId, v.inputHash]),
    [["ind001", "h1"], ["ind002", "h2"]],
  );
  assertEquals(await findingsOf("ind001"), [
    {
      rule: "category_fits",
      timePoint: null,
      message: "Whole indicator.",
      suggestion: null,
      dismissed: false,
    },
    {
      rule: "positive_test",
      timePoint: "R1",
      message: "First.\n\nSecond.",
      suggestion: "Fix one.\n\nFix two.",
      dismissed: false,
    },
  ]);
});

Deno.test("save: a dismissal suppresses its rule for an equal round, and for every round when it was about the whole indicator, but not a returned whole-indicator finding; undismissed findings are replaced", async () => {
  await saveHfaIndicatorVerifications(db, [{
    indicatorId: "ind003",
    inputHash: "a",
    model: "m",
    findings: [
      found("positive_test", "R1", "Negated."),
      found("category_fits", null, "Wrong category."),
      found("round_coverage", "R2", "No code in R2."),
    ],
  }], "a@b.c");
  const before = await getHfaVerification(db);
  assert(before.success);
  const dismissIds = before.data.findings
    .filter((f) => f.indicatorId === "ind003" && f.rule !== "round_coverage")
    .map((f) => f.id);
  await setHfaVerificationFindingsDismissed(db, dismissIds, true, "a@b.c");
  await saveHfaIndicatorVerifications(db, [{
    indicatorId: "ind003",
    inputHash: "b",
    model: "m",
    findings: [
      found("positive_test", "R1", "Negated again."),
      found("positive_test", null, "Negated everywhere."),
      found("category_fits", "R2", "Wrong category in R2."),
      found("threshold_matches_label", "R1", "Threshold."),
    ],
  }], "a@b.c");
  assertEquals(await findingsOf("ind003"), [
    {
      rule: "category_fits",
      timePoint: null,
      message: "Wrong category.",
      suggestion: null,
      dismissed: true,
    },
    {
      rule: "positive_test",
      timePoint: null,
      message: "Negated everywhere.",
      suggestion: null,
      dismissed: false,
    },
    {
      rule: "positive_test",
      timePoint: "R1",
      message: "Negated.",
      suggestion: null,
      dismissed: true,
    },
    {
      rule: "threshold_matches_label",
      timePoint: "R1",
      message: "Threshold.",
      suggestion: null,
      dismissed: false,
    },
  ]);
});

Deno.test("version: moves on a save, a dismissal, an undismissal and a rule switch", async () => {
  const rows = await getHfaVerification(db);
  assert(rows.success);
  const open = rows.data.findings.find((f) => f.dismissedAt === null)!;
  const v0 = await getHfaVerificationVersion(db);
  await setHfaVerificationFindingsDismissed(db, [open.id], true, "a@b.c");
  const v1 = await getHfaVerificationVersion(db);
  assertNotEquals(v1, v0);
  await setHfaVerificationFindingsDismissed(db, [open.id], false, "a@b.c");
  const v2 = await getHfaVerificationVersion(db);
  assertNotEquals(v2, v1);
  await saveHfaIndicatorVerifications(db, [{
    indicatorId: "ind002",
    inputHash: "h2",
    model: "m",
    findings: [],
  }], "a@b.c");
  const v3 = await getHfaVerificationVersion(db);
  assertNotEquals(v3, v2);
  await setHfaVerificationRulesOff(db, ["category_fits"]);
  assertNotEquals(await getHfaVerificationVersion(db), v3);
});

Deno.test("rules off: stored in the rules list's order without duplicates, and read back", async () => {
  assertEquals(await getHfaVerificationRulesOff(db), ["category_fits"]);
  await setHfaVerificationRulesOff(db, [
    "category_fits",
    "positive_test",
    "category_fits",
  ]);
  assertEquals(await getHfaVerificationRulesOff(db), [
    "positive_test",
    "category_fits",
  ]);
  const rows = await getHfaVerification(db);
  assert(rows.success);
  assertEquals(rows.data.rulesOff, ["positive_test", "category_fits"]);
  await setHfaVerificationRulesOff(db, []);
  assertEquals(await getHfaVerificationRulesOff(db), []);
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
