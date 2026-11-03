// Pins the HFA indicator verification's rules list: one entry per rule id,
// each with its text in every language and the field it shows beside, every
// group and severity labelled, and the app rules exactly the status core's
// issue kinds.
//
//   deno test -A --env-file server/tests/hfa_verification_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  HFA_VERIFICATION_MODEL_RULE_IDS,
  HFA_VERIFICATION_RULE_GROUPS,
  HFA_VERIFICATION_RULES,
  HFA_VERIFICATION_SEVERITIES,
  type HfaCodeIssueKind,
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
