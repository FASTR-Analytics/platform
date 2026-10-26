// Pins the expression grammar's comparison, logic, list and text forms: their
// precedence, the case-insensitive words and their symbol equivalents, every
// syntax error kind with its position, the evaluator's NULL rules for each new
// node, and the canonical writer's round trip.
//
//   deno test -A server/tests/indicator_expression_test.ts

import { assertEquals, assertThrows } from "@std/assert";
import {
  buildExpressionDictionary,
  collectIdentifiers,
  evaluateIndicatorExpression,
  ExpressionSyntaxError,
  type ExpressionSyntaxErrorKind,
  IndicatorExpressionError,
  parseIndicatorExpression,
  resolveIndicatorExpression,
  writeIdentifier,
  writeIndicatorExpression,
} from "lib";

const parse = parseIndicatorExpression;
const id = (name: string) => ({ kind: "identifier", name }) as const;
const num = (value: number) =>
  ({ kind: "number", value, raw: String(value) }) as const;

Deno.test("precedence: OR, AND, NOT, comparison, sum, product", () => {
  assertEquals(parse("a OR b AND NOT c == 1 + 2 * 3"), {
    kind: "or",
    left: id("a"),
    right: {
      kind: "and",
      left: id("b"),
      right: {
        kind: "not",
        operand: {
          kind: "compare",
          op: "==",
          left: id("c"),
          right: {
            kind: "binary",
            op: "+",
            left: num(1),
            right: {
              kind: "binary",
              op: "*",
              left: num(2),
              right: num(3),
            },
          },
        },
      },
    },
  });
});

Deno.test("AND and OR associate left", () => {
  assertEquals(parse("a AND b AND c"), {
    kind: "and",
    left: { kind: "and", left: id("a"), right: id("b") },
    right: id("c"),
  });
});

Deno.test("the words are case-insensitive", () => {
  const canonical = parse("a == 1 AND NOT b IN (1, 2) OR c");
  assertEquals(parse("a == 1 and not b in (1, 2) or c"), canonical);
  assertEquals(parse("a == 1 And Not b In (1, 2) Or c"), canonical);
});

Deno.test("& | ! are the same operators as AND OR NOT", () => {
  assertEquals(
    parse("a == 1 & !(b > 2) | c"),
    parse("a == 1 AND NOT (b > 2) OR c"),
  );
});

Deno.test("every comparison operator", () => {
  for (const op of ["==", "!=", "<", ">", "<=", ">="] as const) {
    assertEquals(parse(`a ${op} -1`), {
      kind: "compare",
      op,
      left: id("a"),
      right: { kind: "negate", operand: num(1) },
    });
  }
});

Deno.test("IN and NOT IN", () => {
  assertEquals(parse("x IN (1, 2, 3)"), {
    kind: "in",
    operand: id("x"),
    values: [num(1), num(2), num(3)],
  });
  assertEquals(parse("x NOT IN (1, -99)"), {
    kind: "not",
    operand: {
      kind: "in",
      operand: id("x"),
      values: [num(1), { kind: "negate", operand: num(99) }],
    },
  });
});

Deno.test("bracketed identifiers inside IN, and a bracketed keyword", () => {
  const node = parse("[x-1] IN ([a.b], 2, [in])");
  assertEquals(node, {
    kind: "in",
    operand: id("x-1"),
    values: [id("a.b"), num(2), id("in")],
  });
  assertEquals(collectIdentifiers(node), ["x-1", "a.b", "in"]);
});

Deno.test("text in double or single quotes", () => {
  assertEquals(parse(`sh_03 IN ("c", 'h_ml')`), {
    kind: "in",
    operand: id("sh_03"),
    values: [
      { kind: "string", value: "c" },
      { kind: "string", value: "h_ml" },
    ],
  });
  assertEquals(parse(`sh_03 != "z"`), {
    kind: "compare",
    op: "!=",
    left: id("sh_03"),
    right: { kind: "string", value: "z" },
  });
});

Deno.test("calls take a full expression as an argument", () => {
  assertEquals(parse("abs(a > b)"), {
    kind: "call",
    name: "abs",
    args: [{ kind: "compare", op: ">", left: id("a"), right: id("b") }],
  });
});

function assertSyntaxError(
  source: string,
  kind: ExpressionSyntaxErrorKind,
  at: number,
  token: string,
): void {
  const error = assertThrows(() => parse(source), ExpressionSyntaxError);
  assertEquals(
    { kind: error.kind, at: error.at, token: error.token },
    { kind, at, token },
    source,
  );
}

Deno.test("every syntax error kind carries its position", () => {
  assertSyntaxError("  ", "empty", 0, "");
  assertSyntaxError("a % 2", "unexpected_char", 2, "%");
  assertSyntaxError("a + [b", "unclosed_bracket", 4, "[");
  assertSyntaxError("a + []", "empty_bracket", 4, "[]");
  assertSyntaxError(`a == "b`, "unclosed_quote", 5, '"');
  assertSyntaxError("a = 1", "single_equals", 2, "=");
  assertSyntaxError("a == 1 && b", "doubled_operator", 7, "&&");
  assertSyntaxError("a || b", "doubled_operator", 2, "||");
  assertSyntaxError("sum(a)", "unknown_function", 0, "sum");
  assertSyntaxError("a + abs", "uncalled_function", 4, "abs");
  assertSyntaxError("abs(a, b)", "arity", 0, "abs");
  assertSyntaxError("a ==", "missing_operand", 4, "");
  assertSyntaxError("a IN ()", "missing_operand", 6, ")");
  assertSyntaxError("a AND OR b", "missing_operand", 6, "OR");
  assertSyntaxError("(a + 1", "expected", 6, ")");
  assertSyntaxError("a IN 1", "expected", 5, "(");
  assertSyntaxError("a b", "trailing", 2, "b");
  assertSyntaxError("a < b < c", "trailing", 6, "<");
});

const evaluate = (source: string, values: Record<string, number | null>) =>
  evaluateIndicatorExpression(parse(source), values);

Deno.test("evaluate: a comparison is 1, 0 or null", () => {
  assertEquals(evaluate("a == 1", { a: 1 }), 1);
  assertEquals(evaluate("a != 1", { a: 1 }), 0);
  assertEquals(evaluate("a < 2", { a: 1 }), 1);
  assertEquals(evaluate("a > 2", { a: 1 }), 0);
  assertEquals(evaluate("a <= 1", { a: 1 }), 1);
  assertEquals(evaluate("a >= 2", { a: 1 }), 0);
  assertEquals(evaluate("a == 1", { a: null }), null);
  assertEquals(evaluate("a == b", { a: 1 }), null);
});

Deno.test("evaluate: AND and OR are three-valued", () => {
  const cases: [number | null, number | null, number | null, number | null][] =
    [
      // a, b, a AND b, a OR b
      [1, 1, 1, 1],
      [1, 0, 0, 1],
      [0, 0, 0, 0],
      [0, null, 0, null],
      [1, null, null, 1],
      [null, null, null, null],
      [5, 2, 1, 1],
    ];
  for (const [a, b, and, or] of cases) {
    assertEquals(evaluate("a AND b", { a, b }), and, `${a} AND ${b}`);
    assertEquals(evaluate("b AND a", { a, b }), and, `${b} AND ${a}`);
    assertEquals(evaluate("a OR b", { a, b }), or, `${a} OR ${b}`);
    assertEquals(evaluate("b OR a", { a, b }), or, `${b} OR ${a}`);
  }
});

Deno.test("evaluate: NOT", () => {
  assertEquals(evaluate("NOT a", { a: 0 }), 1);
  assertEquals(evaluate("NOT a", { a: 3 }), 0);
  assertEquals(evaluate("NOT a", { a: null }), null);
});

Deno.test("evaluate: IN", () => {
  assertEquals(evaluate("a IN (1, 2)", { a: 2 }), 1);
  assertEquals(evaluate("a IN (1, 2)", { a: 3 }), 0);
  assertEquals(evaluate("a IN (1, 2)", { a: null }), null);
  assertEquals(evaluate("a IN (1, b)", { a: 1, b: null }), 1);
  assertEquals(evaluate("a IN (1, b)", { a: 3, b: null }), null);
  assertEquals(evaluate("a NOT IN (1, 2)", { a: 3 }), 1);
  assertEquals(evaluate("a NOT IN (1, 2)", { a: null }), null);
});

Deno.test("evaluate: text is not a number", () => {
  assertEquals(evaluate(`a == "x"`, { a: 1 }), null);
});

Deno.test("the canonical writer round-trips the new nodes", () => {
  for (
    const source of [
      "a OR b AND NOT c == 1 + 2 * 3",
      "x NOT IN (1, -99) & !(y >= 2)",
      `sh_03 IN ("c", 'say "x"')`,
      "[in] + [AND] + abs(a < b)",
    ]
  ) {
    const node = parse(source);
    assertEquals(parse(writeIndicatorExpression(node)), node, source);
  }
  assertEquals(
    writeIndicatorExpression(parse("a and not b or c")),
    "((a & (!b)) | c)",
  );
});

Deno.test("a keyword-named identifier is written in brackets", () => {
  assertEquals(writeIdentifier("in"), "[in]");
  assertEquals(writeIdentifier("not"), "[not]");
  assertEquals(writeIdentifier("index"), "index");
});

Deno.test("a calculated indicator takes logic but refuses IN and text", () => {
  const dictionary = buildExpressionDictionary([
    { id: "a", type: "leaf", expression: null },
    { id: "b", type: "leaf", expression: null },
  ]);
  const resolve = (source: string) =>
    resolveIndicatorExpression({
      ownId: "c",
      source,
      dictionary,
      maxIngredients: 8,
    });
  assertEquals(resolve("a > 0 AND NOT b == 1").ingredientIds, ["a", "b"]);
  assertThrows(() => resolve("a IN (1, 2)"), IndicatorExpressionError);
  assertThrows(() => resolve(`a == "x"`), IndicatorExpressionError);
});
