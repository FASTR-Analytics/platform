// Pins PLAN_A3 ruling 8 as a pure function: a DHIS2 indicator formula is
// accepted by whitelist (`#{uid}` / `#{uid.coc}`, numeric literals, + - * /,
// parentheses, whitespace), its factor maps to a display format, and every
// other form is refused with the offending term. The expression it emits must
// re-parse in the app's own grammar.
//
//   deno test -A --env-file server/tests/dhis2_decompose_indicator_test.ts

import { assert, assertEquals } from "@std/assert";
import { collectIdentifiers, parseIndicatorExpression } from "lib";
import { parseDhis2Indicator } from "../dhis2/goal2_indicators/decompose_indicator.ts";

const A = "AbCdEfGhIj1";
const B = "KlMnOpQrSt2";
const C = "UvWxYzAbCd3";
const COC = "CoCoCoCoCo4";

function parse(
  numerator: string,
  denominator: string,
  factor = 100,
  annualized = false,
) {
  return parseDhis2Indicator({ numerator, denominator, annualized, factor });
}

function accepted(numerator: string, denominator: string, factor = 100) {
  const result = parse(numerator, denominator, factor);
  assert(result.accepted, JSON.stringify(result));
  return result;
}

function refused(
  numerator: string,
  denominator: string,
  factor = 100,
  annualized = false,
) {
  const result = parse(numerator, denominator, factor, annualized);
  assert(!result.accepted, JSON.stringify(result));
  return result.refusal;
}

Deno.test("decomposition: a simple ratio becomes operands, an expression and a percent", () => {
  const result = accepted(`#{${A}}`, `#{${B}}`);
  assertEquals(result.operands, [
    { source_id: A, data_element_id: A },
    { source_id: B, data_element_id: B },
  ]);
  assertEquals(result.expression, `([${A}] / [${B}])`);
  assertEquals(result.format_as, "percent");
  assertEquals(result.note, undefined);
});

Deno.test("decomposition: the expression re-parses in the app grammar and names exactly the operands", () => {
  const result = accepted(
    `( #{${A}} + #{${B}.${COC}} ) * 2`,
    `#{${C}} - 0.5`,
  );
  const node = parseIndicatorExpression(result.expression);
  assertEquals(collectIdentifiers(node), [A, `${B}.${COC}`, C]);
  assertEquals(
    result.expression,
    `((([${A}] + [${B}.${COC}]) * 2) / ([${C}] - 0.5))`,
  );
});

Deno.test("decomposition: an operand with a category option combo keeps both ids", () => {
  const result = accepted(`#{${A}.${COC}}`, `#{${B}}`);
  assertEquals(result.operands[0], {
    source_id: `${A}.${COC}`,
    data_element_id: A,
    category_option_combo_id: COC,
  });
});

Deno.test("decomposition: an operand used on both sides is listed once", () => {
  const result = accepted(`#{${A}}`, `#{${A}} + #{${B}}`);
  assertEquals(result.operands.map((o) => o.source_id), [A, B]);
});

Deno.test("decomposition: any whitespace between tokens is accepted", () => {
  const result = accepted(
    `\n\t#{${A}}   +\r\n#{${B}}\t`,
    `  (  #{${C}}  )  `,
  );
  assertEquals(result.expression, `(([${A}] + [${B}]) / [${C}])`);
});

Deno.test("decomposition: unary minus and precedence follow the formula", () => {
  const result = accepted(`-#{${A}} + #{${B}} * #{${C}}`, `1`);
  assertEquals(result.expression, `((-[${A}] + ([${B}] * [${C}])) / 1)`);
});

Deno.test("decomposition: factor 1 is a number, 100 a percent, 10000 a rate per 10k", () => {
  assertEquals(accepted(`#{${A}}`, `#{${B}}`, 1).format_as, "number");
  assertEquals(accepted(`#{${A}}`, `#{${B}}`, 100).format_as, "percent");
  assertEquals(
    accepted(`#{${A}}`, `#{${B}}`, 10000).format_as,
    "rate_per_10k",
  );
  assertEquals(
    accepted(`#{${A}}`, `#{${B}}`, 10000).expression,
    `([${A}] / [${B}])`,
  );
});

Deno.test("decomposition: factor 1000 is a number with the scaling in the expression and a note", () => {
  const result = accepted(`#{${A}}`, `#{${B}}`, 1000);
  assertEquals(result.format_as, "number");
  assertEquals(result.expression, `(([${A}] / [${B}]) * 1000)`);
  assert(result.note !== undefined);
  assert(result.note.en.includes("1000"));
  parseIndicatorExpression(result.expression);
});

Deno.test("decomposition: another factor is refused", () => {
  assertEquals(refused(`#{${A}}`, `#{${B}}`, 12), { kind: "factor", value: 12 });
  assertEquals(refused(`#{${A}}`, `#{${B}}`, 100000), {
    kind: "factor",
    value: 100000,
  });
  const noFactor = parseDhis2Indicator({
    numerator: `#{${A}}`,
    denominator: `#{${B}}`,
    annualized: false,
  });
  assert(!noFactor.accepted);
  assertEquals(noFactor.refusal, { kind: "factor", value: undefined });
});

Deno.test("decomposition: an annualized indicator is refused", () => {
  assertEquals(refused(`#{${A}}`, `#{${B}}`, 100, true), { kind: "annualized" });
});

Deno.test("decomposition: an empty side is refused", () => {
  assertEquals(refused("", `#{${B}}`), { kind: "empty", side: "numerator" });
  assertEquals(refused(`#{${A}}`, "   "), { kind: "empty", side: "denominator" });
});

Deno.test("decomposition: each non-whitelisted term is refused with the term shown", () => {
  const cases: Array<[string, string]> = [
    [`#{${A}.${COC}.${COC}}`, `#{${A}.${COC}.${COC}}`],
    [`#{${A}.*.${COC}}`, `#{${A}.*.${COC}}`],
    [`#{${A}}.aggregationType(SUM)`, `.aggregationType(SUM)`],
    [`#{${A}}.periodOffset(-1)`, `.periodOffset(-1)`],
    [`#{${A}}.yearToDate()`, `.yearToDate()`],
    [`#{${A}}.minDate(2024-01-01)`, `.minDate(2024-01-01)`],
    [`#{${A}}.maxDate(2024-12-31)`, `.maxDate(2024-12-31)`],
    [`N{${A}}`, `N{${A}}`],
    [`D{${A}.${B}}`, `D{${A}.${B}}`],
    [`A{${A}.${B}}`, `A{${A}.${B}}`],
    [`I{${A}}`, `I{${A}}`],
    [`R{${A}.REPORTING_RATE}`, `R{${A}.REPORTING_RATE}`],
    [`OUG{${A}}`, `OUG{${A}}`],
    [`C{${A}}`, `C{${A}}`],
    [`#{${A}} * [days]`, `[days]`],
    [`#{${A}} ^ 2`, `^`],
    [`#{${A}} % 2`, `%`],
    [`#{${A}} > 2`, `>`],
    [`#{${A}} == 2`, `==`],
    [`#{${A}} && #{${B}}`, `&&`],
    [`#{${A}} || #{${B}}`, `||`],
    [`if(#{${A}} > 0, 1, 0)`, `if`],
    [`isNull(#{${A}})`, `isNull`],
    [`greatest(#{${A}}, #{${B}})`, `greatest`],
    [`least(#{${A}}, #{${B}})`, `least`],
    [`log(#{${A}})`, `log`],
    [`firstNonNull(#{${A}}, #{${B}})`, `firstNonNull`],
    [`subExpression(#{${A}})`, `subExpression`],
    [`d2:zing(#{${A}})`, `d2:zing`],
    [`#{${A}} + 1e3`, `e3`],
    [`#{${A}} + .5`, `.`],
    [`#{${A}} + #{short}`, `#{short}`],
    [`#{${A}`, `#{${A}`],
  ];
  for (const [numerator, term] of cases) {
    assertEquals(
      refused(numerator, `#{${B}}`),
      { kind: "term", side: "numerator", term },
      numerator,
    );
  }
});

Deno.test("decomposition: the denominator is checked the same way", () => {
  assertEquals(refused(`#{${A}}`, `R{${B}.REPORTING_RATE}`), {
    kind: "term",
    side: "denominator",
    term: `R{${B}.REPORTING_RATE}`,
  });
});

Deno.test("decomposition: a malformed formula is refused as syntax with the token it stopped at", () => {
  assertEquals(refused(`#{${A}} +`, `#{${B}}`), {
    kind: "syntax",
    side: "numerator",
    term: "end of expression",
  });
  assertEquals(refused(`(#{${A}}`, `#{${B}}`), {
    kind: "syntax",
    side: "numerator",
    term: "end of expression",
  });
  assertEquals(refused(`#{${A}} #{${B}}`, `#{${C}}`), {
    kind: "syntax",
    side: "numerator",
    term: `#{${B}}`,
  });
  assertEquals(refused(`#{${A}}`, `#{${B}})`), {
    kind: "syntax",
    side: "denominator",
    term: ")",
  });
});

Deno.test("decomposition: more operands than an expression may carry is refused", () => {
  const ids = [
    "AaAaAaAaAa1",
    "BbBbBbBbBb1",
    "CcCcCcCcCc1",
    "DdDdDdDdDd1",
    "EeEeEeEeEe1",
    "FfFfFfFfFf1",
    "GgGgGgGgGg1",
    "HhHhHhHhHh1",
    "IiIiIiIiIi1",
  ];
  const numerator = ids.map((id) => `#{${id}}`).join(" + ");
  assertEquals(refused(numerator, `#{${B}}`), {
    kind: "too_many_operands",
    count: 10,
    max: 8,
  });
  assert(accepted(ids.slice(0, 7).map((id) => `#{${id}}`).join(" + "), `#{${B}}`).accepted);
});
