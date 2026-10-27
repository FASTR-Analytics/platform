// Pins parseDhis2Indicator as a pure function: a DHIS2 indicator formula is
// accepted by whitelist (`#{uid}` / `#{uid.coc}`, numeric literals, + - * /,
// parentheses, whitespace), its factor maps to a display format, every
// operand carries the side it is named on, and every other form is refused
// with the offending term. The expression it emits must re-parse in the app's
// own grammar. Also pins foldDefaultCombos (an operand written with its
// element's default combo is the element itself) and the import sentences a
// refused picker row shows.
//
//   deno test -A --env-file server/tests/dhis2_decompose_indicator_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  collectIdentifiers,
  describeDhis2ElementImportRefusal,
  describeDhis2IndicatorImportRefusal,
  type DHIS2DataElement,
  type Dhis2ElementRefusal,
  type Dhis2IndicatorDecomposition,
  type Dhis2IndicatorParse,
  parseIndicatorExpression,
} from "lib";
import { foldDefaultCombos } from "../dhis2/goal2_indicators/attach_verdicts.ts";
import { parseDhis2Indicator } from "../dhis2/goal2_indicators/decompose_indicator.ts";

const A = "AbCdEfGhIj1";
const B = "KlMnOpQrSt2";
const C = "UvWxYzAbCd3";
const COC = "CoCoCoCoCo4";

function parse(numerator: string, denominator: string, factor = 100) {
  return parseDhis2Indicator({ numerator, denominator, factor });
}

function accepted(numerator: string, denominator: string, factor = 100) {
  const result = parse(numerator, denominator, factor);
  assert(result.accepted, JSON.stringify(result));
  return result;
}

function refused(numerator: string, denominator: string, factor = 100) {
  const result = parse(numerator, denominator, factor);
  assert(!result.accepted, JSON.stringify(result));
  return result.refusal;
}

Deno.test("decomposition: a simple ratio becomes operands, an expression and a percent", () => {
  const result = accepted(`#{${A}}`, `#{${B}}`);
  assertEquals(result.operands, [
    { data_id: A, data_element_id: A, side: "numerator" },
    { data_id: B, data_element_id: B, side: "denominator" },
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
    data_id: `${A}.${COC}`,
    data_element_id: A,
    category_option_combo_id: COC,
    side: "numerator",
  });
});

Deno.test("decomposition: an operand used on both sides is listed once, on both", () => {
  const result = accepted(`#{${A}}`, `#{${A}} + #{${B}}`);
  assertEquals(result.operands.map((o) => [o.data_id, o.side]), [
    [A, "both"],
    [B, "denominator"],
  ]);
});

Deno.test("decomposition: each operand carries the side the formula names it on", () => {
  const result = accepted(`#{${A}} + #{${B}}`, `#{${C}} * #{${A}.${COC}}`);
  assertEquals(result.operands.map((o) => [o.data_id, o.side]), [
    [A, "numerator"],
    [B, "numerator"],
    [C, "denominator"],
    [`${A}.${COC}`, "denominator"],
  ]);
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
  assertEquals(refused(`#{${A}}`, `#{${B}}`, 12), {
    kind: "factor",
    value: 12,
  });
  assertEquals(refused(`#{${A}}`, `#{${B}}`, 100000), {
    kind: "factor",
    value: 100000,
  });
  const noFactor = parseDhis2Indicator({
    numerator: `#{${A}}`,
    denominator: `#{${B}}`,
  });
  assert(!noFactor.accepted);
  assertEquals(noFactor.refusal, { kind: "factor", value: undefined });
});

Deno.test("decomposition: an empty side is refused", () => {
  assertEquals(refused("", `#{${B}}`), { kind: "empty", side: "numerator" });
  assertEquals(refused(`#{${A}}`, "   "), {
    kind: "empty",
    side: "denominator",
  });
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
  assert(
    accepted(ids.slice(0, 7).map((id) => `#{${id}}`).join(" + "), `#{${B}}`)
      .accepted,
  );
});

Deno.test("decomposition: a formula naming no data element is refused as a constant", () => {
  assertEquals(refused("-1", "1"), { kind: "no_operands" });
  assertEquals(refused("100", "(2 + 3)"), { kind: "no_operands" });
});

Deno.test("fold: an operand written with its element's default combo becomes the element", () => {
  const combo = (
    isDefault: boolean,
    cocs: string[],
  ): Pick<DHIS2DataElement, "categoryCombo"> => ({
    categoryCombo: {
      id: "CcCcCcCcCc1",
      name: isDefault ? "default" : "Age",
      isDefault,
      categoryOptionCombos: cocs.map((id) => ({ id, name: "default" })),
    },
  });
  const parse = accepted(`#{${A}.${COC}} + #{${B}.${COC}}`, `#{${A}}`);

  const folded = foldDefaultCombos(
    parse,
    new Map([[A, combo(true, [COC])], [B, combo(false, [COC])]]),
  );
  assert(folded.accepted);
  assertEquals(folded.operands, [
    { data_id: A, data_element_id: A, side: "both" },
    {
      data_id: `${B}.${COC}`,
      data_element_id: B,
      category_option_combo_id: COC,
      side: "numerator",
    },
  ]);
  assertEquals(folded.expression, `(([${A}] + [${B}.${COC}]) / [${A}])`);

  const unlisted = foldDefaultCombos(
    parse,
    new Map([[A, combo(true, ["OtherCoc001"])]]),
  );
  assertEquals(unlisted, parse);
  assertEquals(foldDefaultCombos(parse, new Map()), parse);
});

// ----------------------------------------------------------------------------
// The import sentences
// ----------------------------------------------------------------------------

const NAMES: Record<string, string> = {
  [A]: "ANC 1 visits",
  [B]: "Expected pregnancies",
  [C]: "Live births",
};

function decomposition(
  parse: Dhis2IndicatorParse,
  options: {
    annualized?: boolean;
    refuse?: Record<string, Dhis2ElementRefusal>;
  } = {},
): Dhis2IndicatorDecomposition {
  const operands = parse.accepted
    ? parse.operands.map((o) => {
      const refusal = options.refuse?.[o.data_id];
      return {
        ...o,
        verdict: refusal === undefined
          ? { accepted: true as const }
          : { accepted: false as const, refusal },
        label: NAMES[o.data_id] ?? o.data_id,
      };
    })
    : [];
  return { parse, operands, annualized: options.annualized ?? false };
}

function sentence(
  parse: Dhis2IndicatorParse,
  options: {
    annualized?: boolean;
    refuse?: Record<string, Dhis2ElementRefusal>;
  } = {},
): string | undefined {
  return describeDhis2IndicatorImportRefusal(decomposition(parse, options))?.en;
}

const NOT_SUM: Dhis2ElementRefusal = {
  kind: "aggregation_type",
  value: "AVERAGE_SUM_ORG_UNIT",
};

Deno.test("import sentence: an operand that is not a monthly count is named by its role and its DHIS2 name", () => {
  assertEquals(
    sentence(parse(`#{${A}}`, `#{${B}} + #{${C}}`), {
      refuse: { [A]: NOT_SUM },
    }),
    'This indicator cannot be imported: its numerator, "ANC 1 visits", is not a monthly count, and the platform only imports monthly counts from DHIS2.',
  );
});

Deno.test("import sentence: a refused denominator over one numerator says to add the numerator instead", () => {
  assertEquals(
    sentence(parse(`#{${A}}`, `#{${B}}`), { refuse: { [B]: NOT_SUM } }),
    'This indicator cannot be imported: its denominator, "Expected pregnancies", is not a monthly count, and the platform only imports monthly counts from DHIS2. Add its numerator, "ANC 1 visits", as a data element instead.',
  );
});

Deno.test("import sentence: a numerator of two operands is not offered as a data element", () => {
  assertEquals(
    sentence(parse(`#{${A}} + #{${C}}`, `#{${B}}`), {
      refuse: { [B]: NOT_SUM },
    }),
    'This indicator cannot be imported: its denominator, "Expected pregnancies", is not a monthly count, and the platform only imports monthly counts from DHIS2.',
  );
});

Deno.test("import sentence: an operand on both sides is the numerator the sentence offers", () => {
  assertEquals(
    sentence(parse(`#{${A}}`, `#{${A}} * #{${B}}`), {
      refuse: { [B]: NOT_SUM },
    }),
    'This indicator cannot be imported: its denominator, "Expected pregnancies", is not a monthly count, and the platform only imports monthly counts from DHIS2. Add its numerator, "ANC 1 visits", as a data element instead.',
  );
});

Deno.test("import sentence: an annualized indicator's formula parses like any other, and the sentence says what annualizing does", () => {
  const annualized = decomposition(parse(`#{${A}}`, `#{${B}}`), {
    annualized: true,
  });
  assert(annualized.parse.accepted);
  assertEquals(annualized.parse.operands.map((o) => o.data_id), [A, B]);
  assertEquals(annualized.parse.expression, `([${A}] / [${B}])`);
  assertEquals(
    describeDhis2IndicatorImportRefusal(annualized)?.en,
    "This indicator cannot be imported: it is annualized: DHIS2 scales each month up to a yearly rate, which the platform does not do.",
  );
});

Deno.test("import sentence: a non-count operand is said before the annualizing", () => {
  assertEquals(
    sentence(parse(`#{${A}}`, `#{${B}}`), {
      annualized: true,
      refuse: { [A]: NOT_SUM },
    }),
    'This indicator cannot be imported: its numerator, "ANC 1 visits", is not a monthly count, and the platform only imports monthly counts from DHIS2.',
  );
});

Deno.test("import sentence: an annualized indicator is said before a refused formula", () => {
  assertEquals(
    sentence(parse(`N{${A}}`, `#{${B}}`), { annualized: true }),
    "This indicator cannot be imported: it is annualized: DHIS2 scales each month up to a yearly rate, which the platform does not do.",
  );
});

Deno.test("import sentence: an operand DHIS2 no longer has is named, with nothing offered instead", () => {
  assertEquals(
    sentence(parse(`#{${A}}`, `#{${B}}`), {
      refuse: { [B]: { kind: "element_not_found" } },
    }),
    'This indicator cannot be imported: its denominator, "Expected pregnancies", no longer exists in DHIS2.',
  );
  assertEquals(
    sentence(parse(`#{${A}.${COC}}`, `#{${B}}`), {
      refuse: {
        [`${A}.${COC}`]: { kind: "combo_not_found", value: COC },
      },
    }),
    `This indicator cannot be imported: its numerator, "${A}.${COC}", no longer exists in DHIS2.`,
  );
});

Deno.test("import sentence: each refused formula has its own sentence", () => {
  assertEquals(
    sentence(parse(`if(#{${A}} > 0, 1, 0)`, `#{${B}}`)),
    "This indicator cannot be imported: its formula uses DHIS2 functions or constants the platform does not read.",
  );
  assertEquals(
    sentence(parse(`#{${A}} +`, `#{${B}}`)),
    "This indicator cannot be imported: its formula uses DHIS2 functions or constants the platform does not read.",
  );
  assertEquals(
    sentence(parse(`#{${A}}`, `#{${B}}`, 12)),
    "This indicator cannot be imported: its factor is not 1, 100, 1000 or 10000.",
  );
  assertEquals(
    sentence(parse("", `#{${B}}`)),
    "This indicator cannot be imported: its numerator is empty.",
  );
  assertEquals(
    sentence(parse(`#{${A}}`, "  ")),
    "This indicator cannot be imported: its denominator is empty.",
  );
  assertEquals(
    sentence(parse("1", "2")),
    "This indicator cannot be imported: its formula names no data element.",
  );
  assertEquals(
    sentence(
      parse(
        [
          "AaAaAaAaAa1",
          "BbBbBbBbBb1",
          "CcCcCcCcCc1",
          "DdDdDdDdDd1",
          "EeEeEeEeEe1",
          "FfFfFfFfFf1",
          "GgGgGgGgGg1",
          "HhHhHhHhHh1",
          "IiIiIiIiIi1",
        ].map((id) => `#{${id}}`).join(" + "),
        `#{${B}}`,
      ),
    ),
    "This indicator cannot be imported: its formula names more than 8 data elements.",
  );
});

Deno.test("import sentence: an importable indicator has none", () => {
  assertEquals(sentence(parse(`#{${A}}`, `#{${B}}`)), undefined);
});

Deno.test("import sentence: a refused data element reads as one sentence, whatever refused it", () => {
  const expected =
    "This data element cannot be imported: it is not a monthly count, and the platform only imports monthly counts from DHIS2.";
  for (
    const refusal of [NOT_SUM, { kind: "value_type", value: "PERCENTAGE" }, {
      kind: "period_type",
      value: "Yearly",
    }] as Dhis2ElementRefusal[]
  ) {
    assertEquals(
      describeDhis2ElementImportRefusal({ accepted: false, refusal })?.en,
      expected,
    );
  }
  assertEquals(
    describeDhis2ElementImportRefusal({ accepted: true }),
    undefined,
  );
});
