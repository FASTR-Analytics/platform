// Pins the pure planner of the DHIS2 id repair: the outcome of each broken
// DHIS2 element, the verdict a dvs element must pass, a default-combo
// element as a retarget or a duplicate, created elements and their ids, the
// retarget-first rule, the rewrite of Sums that name a retyped or duplicate
// indicator, the stale ledger rows, and the action order.
//
//   deno test -A --env-file server/tests/dhis2_id_fix_plan_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import type {
  Dhis2ElementRefusal,
  Dhis2ElementVerdict,
  Dhis2IndicatorDecomposition,
  HmisIndicator,
  HmisIndicatorDefinition,
} from "lib";
import { foldDefaultCombos } from "../dhis2/goal2_indicators/attach_verdicts.ts";
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
const ACCEPTED: Dhis2ElementVerdict = { accepted: true };

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
      [A]: { name: "ANC first visit", verdict: ACCEPTED },
      [B]: { name: "ANC first visit (repeat)", verdict: ACCEPTED },
      [C]: {
        name: "Live births",
        categoryCombo: {
          id: "CcXxxxxxxx1",
          name: "Sex",
          categoryOptionCombos: [{ id: COC, name: "Female" }],
        },
        verdict: ACCEPTED,
      },
    },
    staleLedger: {},
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
  assertEquals(plan.staleLedgerRows, []);
  assertEquals(plan.plannedAt, AT);
  assertEquals(plan.dhis2Url, "https://dhis2.example.org");
});

Deno.test("a dvs element the picker refuses: to_uploaded with the refusal, rows kept; an operand takes its element's verdict", () => {
  const refused = (refusal: Dhis2ElementRefusal): Dhis2ElementVerdict => ({
    accepted: false,
    refusal,
  });
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("quarterly", A),
        element("births_f", `${C}.${COC}`),
        element("held", B),
      ],
      routes: {
        [A]: DVS,
        [`${C}.${COC}`]: { kind: "dvs", dataElementId: C, coc: COC },
        [B]: { kind: "dvs", dataElementId: B, coc: undefined },
      },
      elements: {
        [A]: {
          name: "TB outcomes",
          verdict: refused({ kind: "period_type", value: "Quarterly" }),
        },
        [B]: { name: "ANC first visit (repeat)", verdict: ACCEPTED },
        [C]: {
          name: "Live births",
          verdict: refused({ kind: "aggregation_type", value: "AVERAGE" }),
        },
      },
      rows: {
        [A]: { count: 36, firstPeriodId: 202301, lastPeriodId: 202512 },
      },
    }),
    AT,
  );
  assertEquals(plan.elementsChecked, 3);
  assertEquals(plan.elementsHealthy, 1);
  assertEquals(plan.actions, [
    {
      indicatorId: "births_f",
      dataId: `${C}.${COC}`,
      rows: { count: 0, firstPeriodId: null, lastPeriodId: null },
      outcome: "to_uploaded",
      reason:
        "DHIS2 cannot serve it monthly: its aggregation type is AVERAGE, not SUM",
    },
    {
      indicatorId: "quarterly",
      dataId: A,
      rows: { count: 36, firstPeriodId: 202301, lastPeriodId: 202512 },
      outcome: "to_uploaded",
      reason:
        "DHIS2 cannot serve it monthly: its data sets are Quarterly; none is monthly",
    },
  ]);
  assertEquals(plan.createdElements, []);
});

Deno.test("a default-combo element beside its bare element is a duplicate (Nigeria's two): every Sum takes the holder in its place, and the holder joins the analysis only for an analysed duplicate; under a special id it is a Sum over the holder", () => {
  const PENTA = "PentaDoses1";
  const LATE = "PV88LZCbiSF";
  const BEFORE = "OZH9GfZqZ7q";
  const DEFAULT = "Y2SrnZVI87k";
  const GA2 = "GaTwentyAa2";
  const GA3 = "GaTwentyAa3";
  const defaultCombo = {
    id: "bjDvmb4bfuf",
    name: "default",
    isDefault: true,
    categoryOptionCombos: [{ id: DEFAULT, name: "default" }],
  };
  const dvs = (element: string, coc?: string): ElementRoute => ({
    kind: "dvs",
    dataElementId: element,
    coc,
  });
  const named = (name: string) => ({
    name,
    categoryCombo: defaultCombo,
    verdict: ACCEPTED,
  });
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("anc_1st_visit_ga_20wks_2", GA2),
        element("anc_1st_visit_ga_20wks_3", GA3),
        {
          ...element("antenatal_1st_booking_visit_20_weeks_or_later", LATE),
          include_in_analysis: false,
        },
        element("antenatal_1st_booking_visit_before_20_weeks", BEFORE),
        element("penta_doses", PENTA),
        element("penta1", `${PENTA}.${DEFAULT}`),
        element(
          "antenatal_1st_booking_visit_20_weeks_or_later_default",
          `${LATE}.${DEFAULT}`,
        ),
        {
          ...element(
            "antenatal_1st_booking_visit_before_20_weeks_default",
            `${BEFORE}.${DEFAULT}`,
          ),
          include_in_analysis: false,
        },
        indicator("anc1", {
          type: "sum",
          members: [
            "anc_1st_visit_ga_20wks_2",
            "anc_1st_visit_ga_20wks_3",
            "antenatal_1st_booking_visit_20_weeks_or_later_default",
            "antenatal_1st_booking_visit_before_20_weeks_default",
          ],
        }),
      ],
      routes: {
        [GA2]: dvs(GA2),
        [GA3]: dvs(GA3),
        [LATE]: dvs(LATE),
        [BEFORE]: dvs(BEFORE),
        [PENTA]: dvs(PENTA),
        [`${PENTA}.${DEFAULT}`]: dvs(PENTA, DEFAULT),
        [`${LATE}.${DEFAULT}`]: dvs(LATE, DEFAULT),
        [`${BEFORE}.${DEFAULT}`]: dvs(BEFORE, DEFAULT),
      },
      elements: {
        [GA2]: named("ANC 1st visit GA 20wks (2)"),
        [GA3]: named("ANC 1st visit GA 20wks (3)"),
        [LATE]: named("Antenatal 1st booking visit 20 weeks or later"),
        [BEFORE]: named("Antenatal 1st booking visit before 20 weeks"),
        [PENTA]: named("Penta doses given"),
      },
      rows: {
        [`${LATE}.${DEFAULT}`]: {
          count: 168893,
          firstPeriodId: 202001,
          lastPeriodId: 202610,
        },
      },
    }),
    AT,
  );
  assertEquals(plan.elementsChecked, 8);
  assertEquals(plan.elementsHealthy, 5);
  assertEquals(plan.actions, [
    {
      indicatorId: "antenatal_1st_booking_visit_20_weeks_or_later_default",
      dataId: `${LATE}.${DEFAULT}`,
      rows: { count: 168893, firstPeriodId: 202001, lastPeriodId: 202610 },
      outcome: "duplicate",
      holder: "antenatal_1st_booking_visit_20_weeks_or_later",
      holderDataId: LATE,
      includeHolderInAnalysis: true,
    },
    {
      indicatorId: "antenatal_1st_booking_visit_before_20_weeks_default",
      dataId: `${BEFORE}.${DEFAULT}`,
      rows: { count: 0, firstPeriodId: null, lastPeriodId: null },
      outcome: "duplicate",
      holder: "antenatal_1st_booking_visit_before_20_weeks",
      holderDataId: BEFORE,
      includeHolderInAnalysis: false,
    },
    {
      indicatorId: "penta1",
      dataId: `${PENTA}.${DEFAULT}`,
      rows: { count: 0, firstPeriodId: null, lastPeriodId: null },
      outcome: "to_sum",
      members: ["penta_doses"],
    },
  ]);
  assertEquals(plan.sumRewrites, [{
    sumId: "anc1",
    members: [
      "anc_1st_visit_ga_20wks_2",
      "anc_1st_visit_ga_20wks_3",
      "antenatal_1st_booking_visit_20_weeks_or_later",
      "antenatal_1st_booking_visit_before_20_weeks",
    ],
  }]);
  assertEquals(plan.createdElements, []);
});

Deno.test("a default-combo element nobody holds the bare id of retargets to it, ahead of a formula over the same element; refused, it is Uploaded; a non-default combo stays; a Sum left empty is still listed for the apply to refuse", () => {
  const DEFAULT = "DefaultCoc1";
  const defaultCombo = {
    id: "CcDefault01",
    name: "default",
    isDefault: true,
    categoryOptionCombos: [{ id: DEFAULT, name: "default" }],
  };
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        element("a_formula", F1),
        element("anc_default", `${A}.${DEFAULT}`),
        element("births_f", `${C}.${COC}`),
        element("halved", F2),
        element("tb_default", `${B}.${DEFAULT}`),
        indicator("only_halved", { type: "sum", members: ["halved"] }),
      ],
      routes: {
        [F1]: FORMULA,
        [`${A}.${DEFAULT}`]: { kind: "dvs", dataElementId: A, coc: DEFAULT },
        [`${C}.${COC}`]: { kind: "dvs", dataElementId: C, coc: COC },
        [F2]: FORMULA,
        [`${B}.${DEFAULT}`]: { kind: "dvs", dataElementId: B, coc: DEFAULT },
      },
      formulas: {
        [F1]: formula(`#{${A}}`),
        [F2]: formula(`#{${A}}`, { denominator: "2" }),
      },
      elements: {
        [A]: {
          name: "ANC first visit",
          categoryCombo: defaultCombo,
          verdict: ACCEPTED,
        },
        [B]: {
          name: "TB outcomes",
          categoryCombo: defaultCombo,
          verdict: {
            accepted: false,
            refusal: { kind: "period_type", value: "Quarterly" },
          },
        },
        [C]: {
          name: "Live births",
          categoryCombo: {
            id: "CcXxxxxxxx1",
            name: "Sex",
            categoryOptionCombos: [{ id: COC, name: "Female" }],
          },
          verdict: ACCEPTED,
        },
      },
    }),
    AT,
  );
  assertEquals(plan.elementsChecked, 5);
  assertEquals(plan.elementsHealthy, 1);
  assertEquals(plan.actions.map((a) => a.indicatorId), [
    "a_formula",
    "anc_default",
    "halved",
    "tb_default",
  ]);
  assertEquals(actionOf(plan.actions, "anc_default", "retarget"), {
    indicatorId: "anc_default",
    dataId: `${A}.${DEFAULT}`,
    rows: { count: 0, firstPeriodId: null, lastPeriodId: null },
    outcome: "retarget",
    newDataId: A,
    dhis2Label: "ANC first visit",
  });
  assertEquals(actionOf(plan.actions, "a_formula", "to_sum").members, [
    "anc_default",
  ]);
  assertEquals(
    actionOf(plan.actions, "halved", "to_calculated").expression,
    "(anc_default / 2)",
  );
  assertEquals(
    actionOf(plan.actions, "tb_default", "to_uploaded").reason,
    "DHIS2 cannot serve it monthly: its data sets are Quarterly; none is monthly",
  );
  assertEquals(plan.sumRewrites, [{ sumId: "only_halved", members: [] }]);
  assertEquals(plan.createdElements, []);
});

Deno.test("stale ledger rows: one entry per Uploaded indicator and per to_uploaded action with stale rows, by indicator id", () => {
  const plan = planDhis2IdFix(
    facts({
      indicators: [
        indicator("zulu_legacy", { type: "uploaded", data_id: "u_zulu" }),
        indicator("clean_legacy", { type: "uploaded", data_id: "u_clean" }),
        element("anc_total", A),
        element("gone", NF),
        element("single", F1),
        indicator("legacy_b", { type: "uploaded", data_id: B }),
      ],
      routes: { [A]: DVS, [NF]: NOT_FOUND, [F1]: FORMULA },
      formulas: { [F1]: formula(`#{${C}}`) },
      staleLedger: {
        u_zulu: 12,
        [A]: 3,
        [NF]: 7,
        [F1]: 2,
        [B]: 1,
      },
    }),
    AT,
  );
  assertEquals(plan.actions.map((a) => [a.indicatorId, a.outcome]), [
    ["gone", "to_uploaded"],
    ["single", "retarget"],
  ]);
  assertEquals(plan.staleLedgerRows, [
    { indicatorId: "gone", dataId: NF, count: 7 },
    { indicatorId: "legacy_b", dataId: B, count: 1 },
    { indicatorId: "zulu_legacy", dataId: "u_zulu", count: 12 },
  ]);
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

Deno.test("a default-combo operand is its element: retarget to the bare id under the element's name", () => {
  const DEFAULT = "DefaultCoc1";
  const elements = {
    [A]: {
      name: "ANC first visit",
      categoryCombo: {
        id: "CcDefault01",
        name: "default",
        isDefault: true,
        categoryOptionCombos: [{ id: DEFAULT, name: "default" }],
      },
      verdict: ACCEPTED,
    },
  };
  const decomposition = formula(`#{${A}.${DEFAULT}}`);
  const plan = planDhis2IdFix(
    facts({
      indicators: [element("anc1", F1)],
      routes: { [F1]: FORMULA },
      formulas: {
        [F1]: {
          ...decomposition,
          parse: foldDefaultCombos(
            decomposition.parse,
            new Map(Object.entries(elements)),
          ),
        },
      },
      elements,
    }),
    AT,
  );
  const action = actionOf(plan.actions, "anc1", "retarget");
  assertEquals(action.newDataId, A);
  assertEquals(action.dhis2Label, "ANC first visit");
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
        [A]: { name: "ANC first visit", verdict: ACCEPTED },
        [B]: { name: "ANC first visit", verdict: ACCEPTED },
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
  assertThrows(
    () =>
      planDhis2IdFix(
        facts({
          indicators: [element("anc_total", A)],
          routes: { [A]: DVS },
          elements: {},
        }),
        AT,
      ),
    Error,
    `No element in the facts for DHIS2 element ${A}`,
  );
});
