// Pins HFA indicator code as the expression language minus what HFA cannot
// use (calls, names the generator cannot bind, text outside a comparison),
// the rows a write refuses, the result type read off the root, the reserved
// ids, and the generator's dependency analysis over the parsed code.
//
//   deno test -A server/tests/hfa_indicator_code_test.ts

import { assertEquals } from "@std/assert";
import {
  hfaCodeResultType,
  type HfaCodeRow,
  type HfaIndicatorCode,
  hfaIndicatorCodeIdentifiers,
  isReservedHfaId,
  parseHfaIndicatorCode,
  unparseableHfaCode,
} from "lib";
import {
  createSnippetAnalyser,
  snippetProblems,
} from "../server_only_funcs/hfa_dependency_analyzer.ts";

function error(source: string) {
  const parsed = parseHfaIndicatorCode(source);
  return parsed.ok ? undefined : parsed.error;
}

Deno.test("the code's identifiers come from the AST", () => {
  const parsed = parseHfaIndicatorCode(
    `a == 1 AND b IN (1, 2) OR NOT c > d AND e != "x"`,
  );
  assertEquals(parsed.ok && parsed.identifiers, ["a", "b", "c", "d", "e"]);
  assertEquals(hfaIndicatorCodeIdentifiers("(a + b + c) / 3"), ["a", "b", "c"]);
  assertEquals(hfaIndicatorCodeIdentifiers("a == "), []);
});

Deno.test("a call is refused, including the calculated-indicator functions", () => {
  assertEquals(error("abs(a) > 1"), { kind: "call", name: "abs" });
  assertEquals(error("a == 1 & sum(b) > 0")?.kind, "unknown_function");
});

Deno.test("text is accepted only beside a comparison or in a list", () => {
  assertEquals(error(`sh_03 != "z"`), undefined);
  assertEquals(error(`sh_03 IN ("c", "d")`), undefined);
  assertEquals(error(`"a" + 1 > 0`), { kind: "text_operand", text: "a" });
  assertEquals(error(`NOT "a"`), { kind: "text_operand", text: "a" });
  assertEquals(error(`"a"`), { kind: "text_operand", text: "a" });
});

Deno.test("a bracketed name the generator cannot bind is refused", () => {
  assertEquals(error("[q_-99] == 1"), {
    kind: "unsupported_name",
    name: "q_-99",
  });
  assertEquals(error("[q_99] == 1"), undefined);
});

Deno.test("a syntax error keeps the parser's kind and position", () => {
  assertEquals(error("a = 1"), { kind: "single_equals", at: 2, token: "=" });
  assertEquals(error("a %in% c(1)"), {
    kind: "unexpected_char",
    at: 2,
    token: "%",
  });
});

Deno.test("a write refuses every non-blank row that does not parse", () => {
  const row = (
    field: HfaCodeRow["field"],
    code: string,
  ) => ({
    indicatorId: "ind001",
    timePoint: "2024",
    field,
    code,
  });
  assertEquals(
    unparseableHfaCode([
      row("rCode", "a == 1"),
      row("rFilterCode", "  "),
      row("rFilterCode", "a = 1"),
      row("variant:campaign", "abs(a) > 1"),
    ]),
    [
      {
        ...row("rFilterCode", "a = 1"),
        error: { kind: "single_equals", at: 2, token: "=" },
      },
      {
        ...row("variant:campaign", "abs(a) > 1"),
        error: { kind: "call", name: "abs" },
      },
    ],
  );
});

Deno.test("the result type is read off the root node", () => {
  const typeOf = (source: string) => {
    const parsed = parseHfaIndicatorCode(source);
    return parsed.ok ? hfaCodeResultType(parsed.node) : undefined;
  };
  assertEquals(typeOf("a == 1"), "boolean");
  assertEquals(typeOf("a AND b"), "boolean");
  assertEquals(typeOf("NOT a"), "boolean");
  assertEquals(typeOf("a IN (1, 2)"), "boolean");
  assertEquals(typeOf("(a == 1)"), "boolean");
  assertEquals(typeOf("a"), "numeric");
  assertEquals(typeOf("(a == 1) + (b == 1)"), "numeric");
  assertEquals(typeOf("-a"), "numeric");
  assertEquals(typeOf("3"), "numeric");
});

Deno.test("reserved ids: the language's words and functions, R's words, M10 columns", () => {
  for (const id of ["and", "OR", "Not", "in", "abs", "coalesce", "nullif"]) {
    assertEquals(isReservedHfaId(id), true, id);
  }
  for (const id of ["TRUE", "NA", "if", "function", "Inf"]) {
    assertEquals(isReservedHfaId(id), true, id);
  }
  for (const id of ["weight", "time_point", "facility_id", "x__status"]) {
    assertEquals(isReservedHfaId(id), true, id);
  }
  for (const id of ["c", "ifelse", "sum", "Abs", "index", "q1"]) {
    assertEquals(isReservedHfaId(id), false, id);
  }
});

Deno.test("the analyser splits variables by code and filter, and reports problems", () => {
  const analyse = createSnippetAnalyser(
    new Set(["ind001"]),
    new Set(["a", "b"]),
  );
  const snippet = (rCode: string, rFilterCode?: string): HfaIndicatorCode => ({
    indicatorId: "ind002",
    timePoint: "2024",
    rCode,
    rFilterCode,
  });
  const ok = analyse(snippet("a == 1 AND ind001 == 1", "b > 0 AND z == 1"));
  assertEquals(ok.ok && ok.deps, {
    variableIds: ["a", "b"],
    codeVariableIds: ["a"],
    filterVariableIds: ["b"],
    dependencies: ["ind001"],
    unknownVariables: ["z"],
  });
  assertEquals(snippetProblems(ok), ["Unknown variables [z]"]);
  assertEquals(snippetProblems(analyse(snippet("a == 1", "sum(b) > 0"))), [
    "Filter does not parse: 'sum' is a function, and functions are not part of indicator code",
  ]);
  const same = snippet("a == 1");
  assertEquals(analyse(same) === analyse(same), true);
});
