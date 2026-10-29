// Pins the text the chat's HFA reads print: the indicator listing, the
// detail block, the variable listing and the variable details, over one
// fixture with a variant indicator, a variable absent from a round, one blank
// in every round, a text choice code, identical rounds folded, and no display
// rows.
//
//   deno test -A server/tests/format_hfa_indicators_for_ai_test.ts

import { assertEquals } from "@std/assert";
import {
  formatHfaIndicatorDetailsForAI,
  formatHfaIndicatorListForAI,
  formatHfaVariableDetailsForAI,
  formatHfaVariableListForAI,
  type HfaIndicator,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
} from "lib";

const ind = (
  indicatorId: string,
  extra: Partial<HfaIndicator> = {},
): HfaIndicator => ({
  indicatorId,
  categoryId: "cat_a",
  subCategoryId: null,
  serviceCategoryIds: ["svc_x"],
  shortLabel: "",
  definition: `Long ${indicatorId}`,
  type: "binary",
  aggregation: "avg",
  sortOrder: 0,
  variantGroupId: null,
  ...extra,
});

function fixture(withDisplayRows: boolean): HfaIndicatorsForAIInput {
  const indicators = [
    ind("ind001", { shortLabel: "Water", subCategoryId: "sub_a1" }),
    ind("ind002", {
      variantGroupId: "vg_mode",
      categoryId: null,
      serviceCategoryIds: [],
    }),
    ind("ind003", { type: "numeric", aggregation: "sum" }),
  ];
  const code = [
    {
      indicatorId: "ind001",
      timePoint: "R1",
      rCode: "wat_01 == 1",
      rFilterCode: "open == 1",
    },
    {
      indicatorId: "ind001",
      timePoint: "R2",
      rCode: "wat_01 == 1",
      rFilterCode: "open == 1",
    },
    {
      indicatorId: "ind002",
      timePoint: "R1",
      rCode: "ind001 == 1 AND vac IN (1, 2)",
    },
    { indicatorId: "ind003", timePoint: "R1", rCode: "beds + 1" },
    { indicatorId: "ind003", timePoint: "R2", rCode: "beds == 1" },
  ];
  const variantCode = [
    {
      indicatorId: "ind002",
      timePoint: "R1",
      itemId: "campaign",
      rCode: "vac == 1",
    },
    {
      indicatorId: "ind002",
      timePoint: "R2",
      itemId: "routine",
      rCode: "vac == 2",
    },
  ];
  const taxonomy = {
    categories: [{ id: "cat_a", label: "Infrastructure", sortOrder: 0 }],
    subCategories: [{
      id: "sub_a1",
      categoryId: "cat_a",
      label: "Water",
      sortOrder: 0,
    }],
    serviceCategories: [{ id: "svc_x", label: "Hospitals", sortOrder: 0 }],
    variantGroups: [{ id: "vg_mode", label: "Delivery mode", sortOrder: 0 }],
    variantItems: [
      { id: "campaign", groupId: "vg_mode", label: "Campaign", sortOrder: 0 },
      { id: "routine", groupId: "vg_mode", label: "Routine", sortOrder: 1 },
    ],
  };
  const dictionary = {
    timePoints: [
      {
        timePoint: "R1",
        variables: [
          {
            variableId: "wat_01",
            variableLabel: "Has water",
            variableType: "select_one",
          },
          {
            variableId: "open",
            variableLabel: "Open",
            variableType: "select_one",
          },
          {
            variableId: "vac",
            variableLabel: "Vaccination",
            variableType: "select_one",
          },
          {
            variableId: "beds",
            variableLabel: "Beds",
            variableType: "integer",
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
          {
            variableId: "wat_01",
            value: "-99",
            valueLabel: "Don't know",
            sentinelClass: "dont_know" as const,
          },
          {
            variableId: "vac",
            value: "a",
            valueLabel: "Campaign",
            sentinelClass: "" as const,
          },
        ],
      },
      {
        timePoint: "R2",
        variables: [
          {
            variableId: "wat_01",
            variableLabel: "Has piped water",
            variableType: "select_one",
          },
          {
            variableId: "open",
            variableLabel: "Open",
            variableType: "select_one",
          },
          {
            variableId: "beds",
            variableLabel: "Beds",
            variableType: "integer",
          },
        ],
        values: [],
      },
    ],
  };
  const row = (
    variableId: string,
    timePoint: string,
    count: number,
    missing: number,
    dataValues: string,
  ) => ({
    variableId,
    timePoint,
    variableType: "",
    variableLabel: "",
    count,
    missing,
    questionnaireValues: "",
    dataValues,
  });
  return {
    indicators,
    code,
    variantCode,
    taxonomy,
    dictionary,
    status: hfaIndicatorsStatus({
      indicators,
      code,
      variantCode,
      variantItems: taxonomy.variantItems,
      dictionary,
    }),
    displayRows: withDisplayRows
      ? [
        row("wat_01", "R1", 10, 1, "1, 2, -99"),
        row("wat_01", "R2", 8, 0, "1, 2"),
        row("open", "R1", 10, 0, "1"),
        row("open", "R2", 8, 0, "1"),
        row("vac", "R1", 10, 10, ""),
        row("beds", "R1", 10, 2, "0... 40"),
        row("beds", "R2", 8, 8, ""),
      ]
      : undefined,
  };
}

const full = fixture(true);
const noRows = fixture(false);

Deno.test("the listing prints the taxonomy, a count line and one line per indicator", () => {
  assertEquals(
    formatHfaIndicatorListForAI(full, full.indicators, {
      withIssues: false,
      withCode: false,
    }),
    [
      "Categories (id: label), each with its sub-categories:",
      "- cat_a: Infrastructure",
      "  - sub_a1: Water",
      "Service categories (id: label):",
      "- svc_x: Hospitals",
      "Variant groups (id: label), each with its items:",
      "- vg_mode: Delivery mode",
      "  - campaign: Campaign",
      "  - routine: Routine",
      "",
      "3 of 3 indicators. Each line: id | long label | type, aggregation | category, sub-category, service categories | variant group | rounds with code | round status | consistency across rounds.",
      "ind001 | Long ind001 | binary, avg | category cat_a, sub-category sub_a1, services svc_x | variant group none | code in 2 of 2 rounds | 2 ready | consistent",
      "ind002 | Long ind002 | binary, avg | category none, sub-category none, services none | variant group vg_mode | code in 1 of 2 rounds | 1 ready, 1 error | consistent",
      "ind003 | Long ind003 | numeric, sum | category cat_a, sub-category none, services svc_x | variant group none | code in 2 of 2 rounds | 1 ready, 1 warning | inconsistent",
    ].join("\n"),
  );
});

Deno.test("withCode ends each line with the code, once when the rounds agree", () => {
  assertEquals(
    formatHfaIndicatorListForAI(full, full.indicators, {
      withIssues: false,
      withCode: true,
    }),
    [
      "Categories (id: label), each with its sub-categories:",
      "- cat_a: Infrastructure",
      "  - sub_a1: Water",
      "Service categories (id: label):",
      "- svc_x: Hospitals",
      "Variant groups (id: label), each with its items:",
      "- vg_mode: Delivery mode",
      "  - campaign: Campaign",
      "  - routine: Routine",
      "",
      "3 of 3 indicators. Each line: id | long label | type, aggregation | category, sub-category, service categories | variant group | rounds with code | round status | consistency across rounds | the code, once when every round holds the same.",
      "ind001 | Long ind001 | binary, avg | category cat_a, sub-category sub_a1, services svc_x | variant group none | code in 2 of 2 rounds | 2 ready | consistent | code: wat_01 == 1 [filter: open == 1]",
      "ind002 | Long ind002 | binary, avg | category none, sub-category none, services none | variant group vg_mode | code in 1 of 2 rounds | 1 ready, 1 error | consistent | code: ind001 == 1 AND vac IN (1, 2)",
      "ind003 | Long ind003 | numeric, sum | category cat_a, sub-category none, services svc_x | variant group none | code in 2 of 2 rounds | 1 ready, 1 warning | inconsistent | code: differs by round",
    ].join("\n"),
  );
});

Deno.test("a listing filtered by status prints each round's issues under the indicator", () => {
  assertEquals(
    formatHfaIndicatorListForAI(full, [full.indicators[2]], {
      withIssues: true,
      withCode: false,
    }),
    [
      "Categories (id: label), each with its sub-categories:",
      "- cat_a: Infrastructure",
      "  - sub_a1: Water",
      "Service categories (id: label):",
      "- svc_x: Hospitals",
      "Variant groups (id: label), each with its items:",
      "- vg_mode: Delivery mode",
      "  - campaign: Campaign",
      "  - routine: Routine",
      "",
      "1 of 3 indicators. Each line: id | long label | type, aggregation | category, sub-category, service categories | variant group | rounds with code | round status | consistency across rounds.",
      "ind003 | Long ind003 | numeric, sum | category cat_a, sub-category none, services svc_x | variant group none | code in 2 of 2 rounds | 1 ready, 1 warning | inconsistent",
      "  R2 rCode (result_type): The indicator is a number (numeric) but this code gives yes/no. For a share of facilities, make the indicator binary",
    ].join("\n"),
  );
});

Deno.test("the detail block of a variant indicator: its rounds, the variables and the other indicators its code names, a variable absent from a round, one blank everywhere, and a text code", () => {
  assertEquals(
    formatHfaIndicatorDetailsForAI(full, ["ind002"]),
    [
      "## Indicator ind002",
      "Short label: (none)",
      "Long label: Long ind002",
      "Measure: % of facilities",
      "Type: binary; aggregation: avg",
      "Category: none; sub-category: none; service categories: none",
      "Variant group: vg_mode (Delivery mode); items: campaign (Campaign), routine (Routine)",
      "Consistent across rounds: yes",
      "Rounds:",
      "- R1: ready",
      "  rCode: ind001 == 1 AND vac IN (1, 2)",
      "  variant campaign: vac == 1",
      "- R2: error",
      "  rCode: (none)",
      "  variant routine: vac == 2",
      "  issue: variant routine (unknown_variable): Variable 'vac' not found in this time point",
      "  issue: variant routine (variant_without_code): Variant code requires indicator code for this time point",
      "",
      "## Variables the code names",
      "### vac",
      '- R1: "Vaccination" (select_one)',
      "  options: a: Campaign [text code: read as missing in the run]",
      "  data: 10 facilities, 10 blank, 0 non-blank (sentinel codes count as non-blank); values present: none",
      "- R2: not in this round",
      "Blank in every round: unknown to the run, so under the default setting an indicator naming it is skipped, and otherwise it fails the run.",
      "",
      "## Other indicators the code names",
      "### ind001: Long ind001 (binary, avg)",
      "- R1, R2 (identical): ready; rCode: wat_01 == 1; rFilterCode: open == 1",
    ].join("\n"),
  );
});

Deno.test("without display rows the detail block says why the counts are missing, and identical rounds print once", () => {
  assertEquals(
    formatHfaIndicatorDetailsForAI(noRows, ["ind001"]),
    [
      "## Indicator ind001",
      "Short label: Water",
      "Long label: Long ind001",
      "Measure: % of facilities",
      "Type: binary; aggregation: avg",
      "Category: cat_a (Infrastructure); sub-category: sub_a1 (Water); service categories: svc_x (Hospitals)",
      "Variant group: none",
      "Consistent across rounds: yes",
      "Rounds:",
      "- R1, R2 (identical): ready",
      "  rCode: wat_01 == 1",
      "  rFilterCode: open == 1",
      "",
      "## Variables the code names",
      "Facility counts and the values present in the data are not shown: they need the permission to view data, which this user does not have.",
      "### wat_01",
      '- R1: "Has water" (select_one)',
      "  options: 1: Yes; 2: No; -99: Don't know [dont_know]",
      '- R2: "Has piped water" (select_one)',
      "### open",
      '- R1, R2 (identical): "Open" (select_one)',
      "",
      "## Other indicators the code names",
      "None.",
    ].join("\n"),
  );
});

Deno.test("the variable listing counts the indicators naming each variable per round", () => {
  assertEquals(
    formatHfaVariableListForAI(full, ["wat_01", "vac", "beds"]),
    [
      "3 variables. Each line: id | label | type | per round it is in, the number of indicators whose code of that round names it.",
      "wat_01 | Has water | select_one | R1: 1 indicator, R2: 1 indicator",
      "vac | Vaccination | select_one | R1: 1 indicator",
      "beds | Beds | integer | R1: 1 indicator, R2: 1 indicator",
    ].join("\n"),
  );
});

Deno.test("the variable details name the indicators per round and list an id in no round as not found", () => {
  assertEquals(
    formatHfaVariableDetailsForAI(full, ["vac", "nope"], undefined),
    [
      "## vac",
      '- R1: "Vaccination" (select_one)',
      "  options: a: Campaign [text code: read as missing in the run]",
      "  data: 10 facilities, 10 blank, 0 non-blank (sentinel codes count as non-blank); values present: none",
      "  named by: ind002 (Long ind002)",
      "- R2: not in this round",
      "Blank in every round: unknown to the run, so under the default setting an indicator naming it is skipped, and otherwise it fails the run.",
      "Not found in any round: nope",
    ].join("\n"),
  );
});

Deno.test("the variable details of one round, without display rows", () => {
  assertEquals(
    formatHfaVariableDetailsForAI(noRows, ["wat_01"], "R1"),
    [
      "Facility counts and the values present in the data are not shown: they need the permission to view data, which this user does not have.",
      "## wat_01",
      '- R1: "Has water" (select_one)',
      "  options: 1: Yes; 2: No; -99: Don't know [dont_know]",
      "  named by: ind001 (Long ind001)",
    ].join("\n"),
  );
});
