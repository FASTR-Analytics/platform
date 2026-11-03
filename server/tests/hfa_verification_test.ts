// Pins the HFA indicator verification. The rules list: one entry per rule
// id, each with its text in every language and the field it shows beside,
// every group and severity labelled, and the app rules exactly the status
// core's issue kinds. The builders: the instruction block names the model
// rules and no app rule, the schemas take the model's shapes, the hash
// ignores the display rows and the dismissed section, the context block is
// one text per snapshot, and a fix becomes an editor patch.
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
