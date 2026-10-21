// Pins the backfill's selection from an applied plan file: which indicators
// it names, the window it spans, and the plan it refuses.
//
//   deno test -A --env-file server/tests/dhis2_id_fix_backfill_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  backfillSelection,
  type Dhis2IdFixAction,
  type Dhis2IdFixPlan,
} from "../dhis2_id_fix/mod.ts";

function plan(
  actions: Dhis2IdFixAction[],
  sumRewrites: Dhis2IdFixPlan["sumRewrites"] = [],
): Dhis2IdFixPlan {
  return {
    dhis2Url: "https://dhis2.example.org",
    plannedAt: "2026-10-22T10:00:00.000Z",
    elementsChecked: actions.length,
    elementsHealthy: 0,
    createdElements: [],
    actions,
    sumRewrites,
    staleLedgerRows: [],
  };
}

const span = (count: number, first: number, last: number) => ({
  count,
  firstPeriodId: first,
  lastPeriodId: last,
});
const NONE = { count: 0, firstPeriodId: null, lastPeriodId: null };

Deno.test("the selection names every emptied Sum and calculated indicator and every rewritten Sum, over the emptied indicators' months only", () => {
  const selection = backfillSelection(plan(
    [
      {
        indicatorId: "anc1",
        dataId: "FormulaAa01",
        rows: span(40, 202101, 202604),
        outcome: "retarget",
        newDataId: "ElemAaaaaa1",
        dhis2Label: "ANC first visit",
      },
      {
        indicatorId: "anc_all",
        dataId: "FormulaBb02",
        rows: span(30, 202201, 202606),
        outcome: "to_sum",
        members: ["anc_first_visit", "anc_repeat"],
      },
      {
        indicatorId: "anc_empty",
        dataId: "FormulaCc03",
        rows: NONE,
        outcome: "to_sum",
        members: ["anc_first_visit"],
      },
      {
        indicatorId: "coverage",
        dataId: "FormulaDd04",
        rows: span(12, 202301, 202312),
        outcome: "to_calculated",
        expression: "(anc_first_visit / births)",
        formatAs: "percent",
      },
      {
        indicatorId: "gone",
        dataId: "NotFound001",
        rows: span(99, 201501, 202612),
        outcome: "to_uploaded",
        reason: "not in DHIS2",
      },
      {
        indicatorId: "visit_default",
        dataId: "ElemAaaaaa1.DefaultCoc1",
        rows: span(50, 201801, 202610),
        outcome: "duplicate",
        holder: "anc1",
        holderDataId: "ElemAaaaaa1",
        includeHolderInAnalysis: false,
      },
    ],
    [{ sumId: "outer", members: ["anc_first_visit", "anc_repeat"] }],
  ));
  assertEquals(selection, {
    kind: "window",
    indicatorIds: ["anc_all", "coverage", "outer"],
    startPeriod: 202201,
    endPeriod: 202606,
  });
});

Deno.test("the window runs from the earliest first month to the latest last month across the emptied indicators", () => {
  const selection = backfillSelection(plan([
    {
      indicatorId: "late",
      dataId: "FormulaAa01",
      rows: span(3, 202405, 202608),
      outcome: "to_sum",
      members: ["a"],
    },
    {
      indicatorId: "early",
      dataId: "FormulaBb02",
      rows: span(3, 201911, 202002),
      outcome: "to_calculated",
      expression: "(a / b)",
      formatAs: "percent",
    },
  ]));
  assertEquals(selection.startPeriod, 201911);
  assertEquals(selection.endPeriod, 202608);
  assertEquals(selection.indicatorIds, ["late", "early"]);
});

Deno.test("a plan that emptied no Sum or calculated indicator is refused, a rewritten Sum alone included", () => {
  const refused = (p: Dhis2IdFixPlan) =>
    assertThrows(
      () => backfillSelection(p),
      Error,
      "there is nothing to backfill",
    );
  refused(plan([]));
  refused(plan(
    [
      {
        indicatorId: "anc_empty",
        dataId: "FormulaCc03",
        rows: NONE,
        outcome: "to_sum",
        members: ["anc_first_visit"],
      },
      {
        indicatorId: "gone",
        dataId: "NotFound001",
        rows: span(99, 201501, 202612),
        outcome: "to_uploaded",
        reason: "not in DHIS2",
      },
      {
        indicatorId: "visit_default",
        dataId: "ElemAaaaaa1.DefaultCoc1",
        rows: span(50, 201801, 202610),
        outcome: "duplicate",
        holder: "anc1",
        holderDataId: "ElemAaaaaa1",
        includeHolderInAnalysis: false,
      },
    ],
    [{ sumId: "outer", members: ["anc1"] }],
  ));
});
