// Pins the R emitted from HFA indicator code: the language's words become R's
// operators, parentheses appear only where R would regroup the code, and the
// generator's output for language code equals what it produced before the
// language existed for the same code written in R.
//
//   deno test -A server/tests/hfa_r_emit_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  type HfaIndicator,
  type ModuleDefinitionInstalled,
  parseHfaIndicatorCode,
  parseIndicatorExpression,
} from "lib";
import { getScriptWithParametersHfa } from "../server_only_funcs/get_script_with_parameters_hfa.ts";
import { emitHfaCodeAsR } from "../server_only_funcs/hfa_r_emit.ts";

function emit(source: string): string {
  const parsed = parseHfaIndicatorCode(source);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
  return emitHfaCodeAsR(parsed.node);
}

Deno.test("the words become R operators and IN becomes %in%", () => {
  assertEquals(emit("a == 1 AND b IN (1, 2)"), "a == 1 & b %in% c(1, 2)");
  assertEquals(emit("NOT x"), "!x");
  assertEquals(emit("a | b & !c"), "a | b & !c");
  assertEquals(emit("x NOT IN (-99, 1)"), "!x %in% c(-99, 1)");
  assertEquals(emit(`sh_03 IN ("c", 'h_ml')`), `sh_03 %in% c("c", "h_ml")`);
});

Deno.test("parentheses are kept wherever R would regroup the code", () => {
  for (
    const [source, r] of [
      ["(a OR b) AND c", "(a | b) & c"],
      ["NOT (a AND b)", "!(a & b)"],
      ["(NOT a) == 1", "(!a) == 1"],
      ["(a + b) IN (1, 2)", "(a + b) %in% c(1, 2)"],
      ["a * b IN (1)", "(a * b) %in% c(1)"],
      ["a * (b IN (1))", "a * b %in% c(1)"],
      ["a - (b - c)", "a - (b - c)"],
      ["a / (b * c)", "a / (b * c)"],
      ["-(a + b) > 0", "-(a + b) > 0"],
      ["-a IN (1)", "-a %in% c(1)"],
      ["(a == 1) + (b == 1) >= 1", "(a == 1) + (b == 1) >= 1"],
      ["(a IN (1)) * 2", "a %in% c(1) * 2"],
    ]
  ) {
    assertEquals(emit(source), r, source);
  }
});

Deno.test("text is written as an escaped R string", () => {
  assertEquals(emit(`a == 'say "x"'`), 'a == "say \\"x\\""');
});

Deno.test("a call and a bracketed name are refused", () => {
  const call = parseHfaIndicatorCode("abs(a) > 1");
  assertEquals(call.ok ? undefined : call.error.kind, "call");
  assertThrows(() => emitHfaCodeAsR(parseIndicatorExpression("[q-1] == 1")));
  assertThrows(() => emitHfaCodeAsR(parseIndicatorExpression("abs(a)")));
});

const definition: ModuleDefinitionInstalled = {
  id: "m010",
  label: "HFA",
  family: "hfa",
  tier: "primary",
  sortOrder: 1,
  prerequisites: [],
  lastScriptUpdate: "",
  dataSources: [],
  scriptGenerationType: "hfa",
  configRequirements: { parameters: [] },
  script: "__INDICATOR_MUTATES__\n__INDICATOR_COLS__\n__INDICATOR_METADATA__\n",
  assetsToImport: [],
  resultsObjects: [{
    id: "M10_hfa_response_status.csv",
    moduleId: "m010",
    createTableStatementPossibleColumns: false,
  }],
};

const indicator: HfaIndicator = {
  indicatorId: "ind001",
  categoryId: "cat",
  subCategoryId: null,
  serviceCategoryIds: [],
  shortLabel: "Has q1",
  definition: "",
  type: "binary",
  aggregation: "avg",
  sortOrder: 1,
  variantGroupId: null,
};

// The generator's output before the language existed, for the code
// `q1 == 1 & q2 %in% c(1, 2) | q4 > 3` with filter `q3 == 1`.
const PRE_LANGUAGE_OUTPUT = [
  "  mutate(ind001 = with(list(",
  "    `%in%` = function(x, table) ifelse(is.na(x), NA, base::`%in%`(x, table)),",
  "    q1 = replace(q1, q1 %in% c(-99), NA_real_),",
  "    q2 = replace(q2, q2 %in% c(-99, -999999), NA_real_),",
  "    q3 = replace(q3, q3 %in% c(-99, -999999), NA_real_),",
  "    q4 = replace(q4, q4 %in% c(-99, -999999), NA_real_)",
  "  ), case_when(",
  '    time_point == "2024" & (is.na(q3 == 1) | !(q3 == 1)) ~ NA_real_,',
  '    time_point == "2024" & is.na(q1 == 1 & q2 %in% c(1, 2) | q4 > 3) ~ NA_real_,',
  '    time_point == "2024" & (q1 == 1 & q2 %in% c(1, 2) | q4 > 3) ~ 1,',
  '    time_point == "2024" ~ 0,',
  "    TRUE ~ NA_real_",
  "  ))) %>%",
  "  mutate(ind001__status = case_when(",
  '    time_point == "2024" & (!(q3 == 1) | is.na(q3) | q3 %in% c(-99, -999999)) ~ "not_applicable",',
  '    time_point == "2024" & (q1 == -99 | q2 %in% c(-99, -999999) | q4 %in% c(-99, -999999)) ~ "dont_know",',
  '    time_point == "2024" & (is.na(q1) | is.na(q2) | is.na(q4)) ~ "missing",',
  '    time_point == "2024" ~ "answered",',
  "    TRUE ~ NA_character_",
  "  ))",
  '"ind001"',
  '  hfa_indicator = c("ind001"),',
  '  hfa_category = c("cat"),',
  '  hfa_sub_category = c(""),',
  '  hfa_short_label = c("Has q1"),',
  '  ind_type = c("binary"),',
  '  ind_aggregation = c("avg")',
].join("\n");

Deno.test("the generator's output equals the output for the same code written in R", () => {
  const script = getScriptWithParametersHfa(
    definition,
    { parameterDefinitions: [], parameterSelections: {} },
    "SLE",
    "/data",
    [indicator],
    [{
      indicatorId: "ind001",
      timePoint: "2024",
      rCode: "q1 == 1 AND q2 IN (1, 2) OR q4 > 3",
      rFilterCode: "q3 == 1",
    }],
    [],
    new Set(["q1", "q2", "q3", "q4"]),
    [{
      variableId: "q1",
      value: "-99",
      sentinelClass: "dont_know",
      isNumeric: false,
    }],
    ["2024"],
  );
  assertEquals(script.trimEnd(), PRE_LANGUAGE_OUTPUT);
});

Deno.test("code that does not parse is a generation error naming the indicator and round", () => {
  assertThrows(
    () =>
      getScriptWithParametersHfa(
        definition,
        { parameterDefinitions: [], parameterSelections: {} },
        "SLE",
        "/data",
        [indicator],
        [{ indicatorId: "ind001", timePoint: "2024", rCode: "q1 = 1" }],
        [],
        new Set(["q1"]),
        [],
        ["2024"],
      ),
    Error,
    `Indicator "ind001" (time_point "2024"): Code does not parse: Single '=' at character 4`,
  );
});
