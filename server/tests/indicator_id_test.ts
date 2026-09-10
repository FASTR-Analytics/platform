// Pins PLAN_A3 rulings 5 and 10 as pure functions: the id generator
// (lib/indicator_id.ts) and the validator (lib/types/indicators.ts). Migration
// 086 restates the generator in PL/pgSQL, so a change here is a change there.
//
//   deno test -A --env-file server/tests/indicator_id_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  EXPRESSION_FUNCTION_NAMES,
  GENERATED_INDICATOR_ID_MAX_LENGTH,
  generateIndicatorId,
  getNewIndicatorIdIssue,
  getNewSourceIdIssue,
  getSpecialIndicatorTypeIssue,
  INDICATOR_ID_MAX_LENGTH,
  POPULATION_TYPE_IDS,
  RESERVED_WORDS,
  SPECIAL_INDICATOR_IDS,
} from "lib";

function generate(
  label: string,
  existingIds: string[] = [],
  sourceId = "AbCdEfGhIj1",
) {
  return generateIndicatorId({ label, sourceId, existingIds });
}

Deno.test("generator: NFKD-folds accents and lowercases", () => {
  assertEquals(
    generate("Consultation prénatale 1"),
    "consultation_prenatale_1",
  );
  assertEquals(generate("Vacina contra o Sarampo"), "vacina_contra_o_sarampo");
  assertEquals(generate("Ñandú ÀÉÎÕÜ"), "nandu_aeiou");
});

Deno.test("generator: punctuation and whitespace runs become one underscore, trimmed", () => {
  assertEquals(generate("  ANC (1st visit) / total  "), "anc_1st_visit_total");
  assertEquals(generate("OPD - new & repeat!!"), "opd_new_repeat");
  assertEquals(generate("a.b.c"), "a_b_c");
});

Deno.test("generator: a leading digit takes the i_ prefix", () => {
  assertEquals(generate("1st ANC visit"), "i_1st_anc_visit");
  assertEquals(generate("2024 deliveries"), "i_2024_deliveries");
});

Deno.test("generator: an empty result falls back to i_ + the slugged source id", () => {
  assertEquals(generate("", [], "AbCdEfGhIj1"), "i_abcdefghij1");
  assertEquals(
    generate("!!! ???", [], "AbCdEfGhIj1.KlMnOpQrSt2"),
    "i_abcdefghij1_klmnopqrst2",
  );
  assertEquals(generate("", [], "12abc"), "i_12abc");
});

Deno.test("generator: collision with an existing id takes _2, then _3", () => {
  assertEquals(generate("Penta 2", ["penta_2"]), "penta_2_2");
  assertEquals(generate("Penta 2", ["penta_2", "penta_2_2"]), "penta_2_3");
  assertEquals(generate("Penta 2", ["penta_2_2"]), "penta_2");
});

Deno.test("generator: collision with a reserved word takes _2", () => {
  assertEquals(generate("ANC1"), "anc1_2");
  assertEquals(generate("coalesce"), "coalesce_2");
  assertEquals(generate("population_total"), "population_total_2");
  assertEquals(generate("ANC1", ["anc1_2"]), "anc1_3");
  for (const word of RESERVED_WORDS) {
    assert(!RESERVED_WORDS.includes(generate(word)));
  }
});

Deno.test("generator: the stem is capped at 64 before the suffix", () => {
  const long = "x".repeat(100);
  assertEquals(generate(long), "x".repeat(GENERATED_INDICATOR_ID_MAX_LENGTH));
  assertEquals(
    generate(long, ["x".repeat(GENERATED_INDICATOR_ID_MAX_LENGTH)]),
    `${"x".repeat(GENERATED_INDICATOR_ID_MAX_LENGTH)}_2`,
  );
  const digits = "9".repeat(70);
  assertEquals(
    generate(digits),
    `i_${"9".repeat(GENERATED_INDICATOR_ID_MAX_LENGTH - 2)}`,
  );
});

Deno.test("generator: every output passes the validator as a base", () => {
  for (
    const label of [
      "Consultation prénatale 1",
      "",
      "1st",
      "!!!",
      "x".repeat(100),
      "anc1",
    ]
  ) {
    assertEquals(getNewIndicatorIdIssue(generate(label), "base"), undefined);
  }
});

Deno.test("reserved words: the union of specials, population types and function names, without duplicates", () => {
  assertEquals(RESERVED_WORDS, [
    ...SPECIAL_INDICATOR_IDS,
    ...POPULATION_TYPE_IDS,
    ...EXPRESSION_FUNCTION_NAMES,
  ]);
  assertEquals(new Set(RESERVED_WORDS).size, RESERVED_WORDS.length);
  for (const id of SPECIAL_INDICATOR_IDS) {
    assertEquals(getNewSourceIdIssue(id), undefined);
  }
});

Deno.test("validator: a reserved word is refused for a base and for a derived", () => {
  for (const word of [...POPULATION_TYPE_IDS, ...EXPRESSION_FUNCTION_NAMES]) {
    assertEquals(getNewIndicatorIdIssue(word, "base"), "reserved");
    assertEquals(getNewIndicatorIdIssue(word, "derived"), "reserved");
  }
});

Deno.test("validator: a special id is accepted as a base and refused as a derived, at create and at retype", () => {
  for (const id of SPECIAL_INDICATOR_IDS) {
    assertEquals(getNewIndicatorIdIssue(id, "base"), undefined);
    assertEquals(getNewIndicatorIdIssue(id, "derived"), "special_not_base");
    assertEquals(getSpecialIndicatorTypeIssue(id, "base"), undefined);
    assertEquals(
      getSpecialIndicatorTypeIssue(id, "derived"),
      "special_not_base",
    );
  }
  assertEquals(getSpecialIndicatorTypeIssue("anc4_rate", "derived"), undefined);
});

Deno.test("validator: an ordinary id passes for either type", () => {
  assertEquals(getNewIndicatorIdIssue("anc4_rate", "derived"), undefined);
  assertEquals(getNewIndicatorIdIssue("Penta 1 (DPT)", "base"), undefined);
});

Deno.test("validator: the charset rule for either kind", () => {
  assertEquals(getNewIndicatorIdIssue("", "base"), "empty");
  assertEquals(getNewIndicatorIdIssue(" anc", "base"), "untrimmed");
  assertEquals(getNewIndicatorIdIssue("a,b", "base"), "forbidden_chars");
  assertEquals(getNewIndicatorIdIssue("a;b", "derived"), "forbidden_chars");
  assertEquals(getNewIndicatorIdIssue("a:b", "derived"), "forbidden_chars");
  assertEquals(getNewIndicatorIdIssue("[a]", "base"), "forbidden_chars");
  assertEquals(
    getNewIndicatorIdIssue("x".repeat(INDICATOR_ID_MAX_LENGTH + 1), "base"),
    "too_long",
  );
  assertEquals(
    getNewIndicatorIdIssue("x".repeat(INDICATOR_ID_MAX_LENGTH), "base"),
    undefined,
  );
});

Deno.test("validator: a source id is checked by the charset rule only", () => {
  for (const word of RESERVED_WORDS) {
    assertEquals(getNewSourceIdIssue(word), undefined);
  }
  assertEquals(getNewSourceIdIssue("AbCdEfGhIj1.KlMnOpQrSt2"), undefined);
  assertEquals(getNewSourceIdIssue(""), "empty");
  assertEquals(getNewSourceIdIssue("a b "), "untrimmed");
  assertEquals(getNewSourceIdIssue("a,b"), "forbidden_chars");
  assertEquals(
    getNewSourceIdIssue("x".repeat(INDICATOR_ID_MAX_LENGTH + 1)),
    "too_long",
  );
});
