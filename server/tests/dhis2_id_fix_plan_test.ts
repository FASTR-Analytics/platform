// Pins the pure planner of the DHIS2 id repair: the outcome of each broken
// DHIS2 element, created elements and their ids, the retarget-first rule,
// the rewrite of Sums that name a retyped indicator, and the action order.
//
//   deno test -A --env-file server/tests/dhis2_id_fix_plan_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import type {
  Dhis2ElementRefusal,
  Dhis2IndicatorDecomposition,
  HmisIndicator,
  HmisIndicatorDefinition,
} from "lib";
import { parseDhis2Indicator } from "../dhis2/goal2_indicators/decompose_indicator.ts";
import {
  type Dhis2IdFixAction,
  type Dhis2IdFixFacts,
  planDhis2IdFix,
  readDhis2FormulaShape,
} from "../dhis2_id_fix/mod.ts";
import type { ElementRoute } from "../worker_routines/import_hmis_data_dhis2/dispatch.ts";

const A = "ElemAaaaaa1";
const B = "ElemBbbbbb2";
const C = "ElemCccccc3";
const COC = "CocXxxxxxx1";
const F1 = "FormulaAa01";
const F2 = "FormulaBb02";
const F3 = "FormulaCc03";
const NF = "NotFound001";
const AT = "2026-10-21T10:00:00.000Z";

const FORMULA: ElementRoute = { kind: "unknown", reason: "dhis2_indicator" };
const NOT_FOUND: ElementRoute = { kind: "unknown", reason: "not_found" };
const DVS: ElementRoute = { kind: "dvs", dataElementId: A, coc: undefined };

function indicator(
  id: string,
  definition: HmisIndicatorDefinition,
  sortOrder = 1,
): HmisIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    definition,
    include_in_analysis: true,
    format_as: "number",
    thresholds: null,
    direction: "higher-is-better",
    target: null,
    expected_low_counts: false,
    sort_order: sortOrder,
  };
}

function element(id: string, dataId: string, sortOrder = 1): HmisIndicator {
  return indicator(
    id,
    { type: "dhis2_element", data_id: dataId, dhis2_label: null },
    sortOrder,
  );
}

function formula(
  numerator: string,
  options: {
    denominator?: string;
    factor?: number;
    annualized?: boolean;
    refuse?: Record<string, Dhis2ElementRefusal>;
  } = {},
): Dhis2IndicatorDecomposition {
  const parse = parseDhis2Indicator({
    numerator,
    denominator: options.denominator ?? "1",
    factor: options.factor ?? 1,
    annualized: options.annualized ?? false,
  });
  const operands = parse.accepted
    ? parse.operands.map((o) => {
      const refusal = options.refuse?.[o.data_id];
      return {
        ...o,
        verdict: refusal === undefined
          ? { accepted: true as const }
          : { accepted: false as const, refusal },
      };
    })
    : [];
  return {
    accepted: parse.accepted && operands.every((o) => o.verdict.accepted),
    parse,
    operands,
  };
}

function facts(partial: Partial<Dhis2IdFixFacts>): Dhis2IdFixFacts {
  return {
    dhis2Url: "https://dhis2.example.org",
    indicators: [],
    rows: {},
    routes: {},
    formulas: {},
    elements: {
      [A]: { name: "ANC first visit" },
      [B]: { name: "ANC first visit (repeat)" },
      [C]: {
        name: "Live births",
        categoryCombo: {
          id: "CcXxxxxxxx1",
          name: "Sex",
          categoryOptionCombos: [{ id: COC, name: "Female" }],
        },
      },
    },
    ...partial,
  };
}

function actionOf<K extends Dhis2IdFixAction["outcome"]>(
  actions: Dhis2IdFixAction[],
  id: string,
  outcome: K,
): Extract<Dhis2IdFixAction, { outcome: K }> {
  const action = actions.find((a) => a.indicatorId === id);
  if (action === undefined) throw new Error(`No action for ${id}`);
  assertEquals(action.outcome, outcome);
  return action as Extract<Dhis2IdFixAction, { outcome: K }>;
}

Deno.test("shape: single, sum, and everything else as other", () => {
  const shape = (numerator: string, denominator = "1", factor = 1) => {
    const parse = parseDhis2Indicator({ numerator, denominator, factor });
    if (!parse.accepted) throw new Error("expected an accepted parse");
    return readDhis2FormulaShape(parse);
  };
  assertEquals(shape(`#{${A}}`), { kind: "single", operand: A });
  assertEquals(shape(`#{${C}.${COC}}`), {
    kind: "single",
    operand: `${C}.${COC}`,
  });
  assertEquals(shape(`#{${A}} + #{${B}} + #{${C}}`), {
    kind: "sum",
    operands: [A, B, C],
  });
  assertEquals(shape(`(#{${A}} + #{${B}})`), { kind: "sum", operands: [A, B] });
  assertEquals(shape(`#{${A}} + #{${A}}`), { kind: "other" });
  assertEquals(shape(`#{${A}} - #{${B}}`), { kind: "other" });
  assertEquals(shape(`#{${A}} * 2`), { kind: "other" });
  assertEquals(shape(`#{${A}}`, `#{${B}}`), { kind: "other" });
  assertEquals(shape(`#{${A}}`, "2"), { kind: "other" });
  assertEquals(shape(`#{${A}}`, "1", 100), { kind: "other" });
  assertEquals(shape(`#{${A}}`, "1", 1000), { kind: "other" });
  assertEquals(shape(`#{${A}} + #{${B}}`, "1", 100), { kind: "other" });
});

Deno.test("a healthy element is counted and gets no action", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [element("anc_total", A)],
      routes: { [A]: DVS },
    }),
    AT,
  );
  assertEquals(plan.elementsChecked, 1);
  assertEquals(plan.elementsHealthy, 1);
  assertEquals(plan.actions, []);
  assertEquals(plan.createdElements, []);
  assertEquals(plan.sumRewrites, []);
  assertEquals(plan.plannedAt, AT);
  assertEquals(plan.dhis2Url, "https://dhis2.example.org");
});

Deno.test("not found: to_uploaded, rows kept and spanned", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [element("gone", NF)],
      routes: { [NF]: NOT_FOUND },
      rows: {
        [NF]: { count: 120, firstPeriodId: 202001, lastPeriodId: 202412 },
      },
    }),
    AT,
  );
  assertEquals(plan.elementsHealthy, 0);
  assertEquals(plan.actions, [{
    indicatorId: "gone",
    dataId: NF,
    rows: { count: 120, firstPeriodId: 202001, lastPeriodId: 202412 },
    outcome: "to_uploaded",
    reason: "not in DHIS2",
  }]);
});

Deno.test("a refused formula and a refused operand: to_uploaded with the reason", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [element("annual", F1), element("orphan", F2)],
      routes: { [F1]: FORMULA, [F2]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}}`, { annualized: true }),
        [F2]: formula(`#{${A}} + #{${B}}`, {
          refuse: { [B]: { kind: "element_not_found" } },
        }),
      },
    }),
    AT,
  );
  assertEquals(
    actionOf(plan.actions, "annual", "to_uploaded").reason,
    "its formula is refused: it is annualized",
  );
  assertEquals(
    actionOf(plan.actions, "orphan", "to_uploaded").reason,
    `its operand ${B} is refused: its data element no longer exists on the DHIS2 server`,
  );
  assertEquals(plan.createdElements, []);
});

Deno.test("single operand nobody holds: retarget to it with its DHIS2 name", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [element("anc1", F1), element("births_f", F2)],
      routes: { [F1]: FORMULA, [F2]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}}`),
        [F2]: formula(`#{${C}.${COC}}`),
      },
      rows: {
        [F1]: { count: 10, firstPeriodId: 202301, lastPeriodId: 202310 },
      },
    }),
    AT,
  );
  assertEquals(actionOf(plan.actions, "anc1", "retarget"), {
    indicatorId: "anc1",
    dataId: F1,
    rows: { count: 10, firstPeriodId: 202301, lastPeriodId: 202310 },
    outcome: "retarget",
    newDataId: A,
    dhis2Label: "ANC first visit",
  });
  assertEquals(actionOf(plan.actions, "births_f", "retarget"), {
    indicatorId: "births_f",
    dataId: F2,
    rows: { count: 0, firstPeriodId: null, lastPeriodId: null },
    outcome: "retarget",
    newDataId: `${C}.${COC}`,
    dhis2Label: "Live births - Female",
  });
  assertEquals(plan.createdElements, []);
});

Deno.test("single operand another indicator holds: to_sum with that one member, Uploaded holders included", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("anc_total", A),
        indicator("legacy_b", { type: "uploaded", data_id: B }),
        element("anc_formula", F1),
        element("repeat_formula", F2),
      ],
      routes: { [A]: DVS, [F1]: FORMULA, [F2]: FORMULA },
      formulas: { [F1]: formula(`#{${A}}`), [F2]: formula(`#{${B}}`) },
    }),
    AT,
  );
  assertEquals(plan.elementsHealthy, 1);
  assertEquals(actionOf(plan.actions, "anc_formula", "to_sum").members, [
    "anc_total",
  ]);
  assertEquals(actionOf(plan.actions, "repeat_formula", "to_sum").members, [
    "legacy_b",
  ]);
  assertEquals(plan.createdElements, []);
});

Deno.test("sum shape: to_sum over holders and created elements, created after the last sort order", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("anc_total", A, 7),
        element("anc_all", F1, 3),
      ],
      routes: { [A]: DVS, [F1]: FORMULA },
      formulas: { [F1]: formula(`#{${A}} + #{${B}} + #{${C}.${COC}}`) },
    }),
    AT,
  );
  assertEquals(actionOf(plan.actions, "anc_all", "to_sum").members, [
    "anc_first_visit_repeat",
    "anc_total",
    "live_births_female",
  ]);
  assertEquals(plan.createdElements, [
    {
      indicatorId: "anc_first_visit_repeat",
      label: "ANC first visit (repeat)",
      dataId: B,
      sortOrder: 8,
    },
    {
      indicatorId: "live_births_female",
      label: "Live births - Female",
      dataId: `${C}.${COC}`,
      sortOrder: 9,
    },
  ]);
});

Deno.test("other shape: to_calculated with the renamed expression and the factor's format", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("anc_total", A),
        element("coverage", F1),
        element("per_thousand", F2),
        element("difference", F3),
      ],
      routes: { [A]: DVS, [F1]: FORMULA, [F2]: FORMULA, [F3]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}}`, { denominator: `#{${B}}`, factor: 100 }),
        [F2]: formula(`#{${A}}`, { denominator: `#{${B}}`, factor: 1000 }),
        [F3]: formula(`#{${A}} - #{${B}}`),
      },
    }),
    AT,
  );
  assertEquals(actionOf(plan.actions, "coverage", "to_calculated"), {
    indicatorId: "coverage",
    dataId: F1,
    rows: { count: 0, firstPeriodId: null, lastPeriodId: null },
    outcome: "to_calculated",
    expression: "(anc_total / anc_first_visit_repeat)",
    formatAs: "percent",
  });
  const perThousand = actionOf(plan.actions, "per_thousand", "to_calculated");
  assertEquals(
    perThousand.expression,
    "((anc_total / anc_first_visit_repeat) * 1000)",
  );
  assertEquals(perThousand.formatAs, "number");
  assertEquals(
    actionOf(plan.actions, "difference", "to_calculated").expression,
    "((anc_total - anc_first_visit_repeat) / 1)",
  );
  assertEquals(plan.createdElements.map((c) => c.dataId), [B]);
});

Deno.test("a sum and a ratio sharing an operand create it once", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [element("anc_all", F1), element("ratio", F2)],
      routes: { [F1]: FORMULA, [F2]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}} + #{${B}}`),
        [F2]: formula(`#{${A}}`, { denominator: `#{${C}}`, factor: 100 }),
      },
    }),
    AT,
  );
  assertEquals(plan.createdElements.map((c) => c.dataId), [A, B, C]);
  assertEquals(actionOf(plan.actions, "anc_all", "to_sum").members, [
    "anc_first_visit",
    "anc_first_visit_repeat",
  ]);
  assertEquals(
    actionOf(plan.actions, "ratio", "to_calculated").expression,
    "(anc_first_visit / live_births)",
  );
});

Deno.test("a single and a sum over one operand: the single retargets, the sum names it; two singles: the first by id retargets", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("a_sum", F1),
        element("m_single", F2),
        element("z_single", F3),
      ],
      routes: { [F1]: FORMULA, [F2]: FORMULA, [F3]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}} + #{${B}}`),
        [F2]: formula(`#{${A}}`),
        [F3]: formula(`#{${A}}`),
      },
    }),
    AT,
  );
  assertEquals(actionOf(plan.actions, "m_single", "retarget").newDataId, A);
  assertEquals(actionOf(plan.actions, "z_single", "to_sum").members, [
    "m_single",
  ]);
  assertEquals(actionOf(plan.actions, "a_sum", "to_sum").members, [
    "anc_first_visit_repeat",
    "m_single",
  ]);
  assertEquals(plan.createdElements.map((c) => c.dataId), [B]);
});

Deno.test("special ids: single retargets, sum becomes a Sum, other stays a count as Uploaded", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("anc1", F1),
        element("delivery", F2),
        element("opd", F3),
      ],
      routes: { [F1]: FORMULA, [F2]: FORMULA, [F3]: FORMULA },
      formulas: {
        [F1]: formula(`#{${A}}`),
        [F2]: formula(`#{${B}} + #{${C}}`),
        [F3]: formula(`#{${A}}`, { denominator: `#{${B}}`, factor: 100 }),
      },
    }),
    AT,
  );
  assertEquals(actionOf(plan.actions, "anc1", "retarget").newDataId, A);
  assertEquals(actionOf(plan.actions, "delivery", "to_sum").members, [
    "anc_first_visit_repeat",
    "live_births",
  ]);
  assertEquals(actionOf(plan.actions, "opd", "to_uploaded"), {
    indicatorId: "opd",
    dataId: F3,
    rows: { count: 0, firstPeriodId: null, lastPeriodId: null },
    outcome: "to_uploaded",
    reason: "a special id must stay a count",
  });
  assertEquals(plan.createdElements.map((c) => c.dataId), [B, C]);
});

Deno.test("created ids avoid the dictionary's ids and each other", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        indicator("anc_first_visit", { type: "sum", members: [] }),
        element("twice", F1),
      ],
      routes: { [F1]: FORMULA },
      formulas: { [F1]: formula(`#{${A}} + #{${B}}`) },
      elements: {
        [A]: { name: "ANC first visit" },
        [B]: { name: "ANC first visit" },
      },
    }),
    AT,
  );
  assertEquals(plan.createdElements.map((c) => c.indicatorId), [
    "anc_first_visit_2",
    "anc_first_visit_3",
  ]);
});

Deno.test("a Sum naming a retyped indicator is rewritten; one naming a retarget or to_uploaded is not", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("anc_total", A),
        element("anc_all", F1),
        element("ratio", F2),
        element("gone", NF),
        element("single", F3),
        indicator("outer", {
          type: "sum",
          members: ["anc_all", "anc_total", "gone", "ratio", "single"],
        }),
        indicator("only_ratio", { type: "sum", members: ["ratio"] }),
        indicator("untouched", {
          type: "sum",
          members: ["anc_total", "gone", "single"],
        }),
      ],
      routes: {
        [A]: DVS,
        [F1]: FORMULA,
        [F2]: FORMULA,
        [NF]: NOT_FOUND,
        [F3]: FORMULA,
      },
      formulas: {
        [F1]: formula(`#{${A}} + #{${B}}`),
        [F2]: formula(`#{${A}}`, { denominator: `#{${B}}`, factor: 100 }),
        [F3]: formula(`#{${C}}`),
      },
    }),
    AT,
  );
  assertEquals(plan.sumRewrites, [
    { sumId: "only_ratio", members: [] },
    {
      sumId: "outer",
      members: ["anc_first_visit_repeat", "anc_total", "gone", "single"],
    },
  ]);
});

Deno.test("actions are ordered by indicator id", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("zeta", F1),
        element("alpha", F2),
        element("mid", NF),
      ],
      routes: { [F1]: FORMULA, [F2]: FORMULA, [NF]: NOT_FOUND },
      formulas: { [F1]: formula(`#{${A}}`), [F2]: formula(`#{${B}}`) },
    }),
    AT,
  );
  assertEquals(plan.actions.map((a) => a.indicatorId), [
    "alpha",
    "mid",
    "zeta",
  ]);
});

Deno.test("incomplete facts throw instead of planning", () => {
  assertThrows(
    () =>
      planDhis2IdFix(
        facts({ indicators: [element("anc_total", A)] }),
        AT,
      ),
    Error,
    `No route in the facts for DHIS2 element ${A}`,
  );
  assertThrows(
    () =>
      planDhis2IdFix(
        facts({
          indicators: [element("anc_formula", F1)],
          routes: { [F1]: FORMULA },
        }),
        AT,
      ),
    Error,
    `No decomposition in the facts for formula ${F1}`,
  );
  assertThrows(
    () =>
      planDhis2IdFix(
        facts({
          indicators: [element("anc_formula", F1)],
          routes: { [F1]: FORMULA },
          formulas: { [F1]: formula(`#{${A}}`) },
          elements: {},
        }),
        AT,
      ),
    Error,
    `No element in the facts for operand ${A}`,
  );
});
