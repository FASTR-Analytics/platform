// =============================================================================
// Indicator expression evaluator: pure, post-aggregation
// =============================================================================
//
// The read path aggregates a calculated indicator's additive ingredients with
// SUM and then applies its expression to the SUMS (expression-over-sums,
// never sum-of-expressions). This is that application: a slot record in, one
// number or null out. No SQL, no I/O, no catalog lookups.
//
// Semantics:
//   - NULL propagates through arithmetic, comparison, NOT and abs().
//   - Division by zero yields NULL rather than Infinity/NaN: a zero
//     denominator is "no rate here", not an error.
//   - A non-finite result (an overflow from very large sums) yields NULL, so
//     no NaN/Infinity can ever reach a figure.
//   - An identifier with no value in the record is NULL, exactly as a missing
//     ingredient column is.
//   - Text is not a number: a text literal is NULL. resolve.ts refuses text
//     in a calculated indicator, so only a caller that skipped it sees one.
//   - Logic is numeric: a comparison is 1 or 0, any non-zero value is true.
//     AND and OR are three-valued as in SQL and R: FALSE AND NULL is 0,
//     TRUE OR NULL is 1, otherwise a NULL operand makes NULL. NOT NULL is
//     NULL.
//   - `x IN (...)` is NULL when x is NULL, 1 when x equals a list value, NULL
//     when no value matches but one is NULL, and 0 otherwise.
//
// m012 applies the same semantics in R to decide which rows exist at all
// (the rule and the R bindings are in the module's script.R; pinned against
// this evaluator by server/tests/m012_expression_parity_test.ts).
//
// =============================================================================

import type { CompareOp, ExpressionNode } from "./parse.ts";

export type ExpressionValues = Record<string, number | null | undefined>;

export function evaluateIndicatorExpression(
  node: ExpressionNode,
  values: ExpressionValues,
): number | null {
  switch (node.kind) {
    case "number":
      return node.value;
    case "string":
      return null;
    case "identifier": {
      const raw = values[node.name];
      return raw === undefined || raw === null || !Number.isFinite(raw)
        ? null
        : raw;
    }
    case "negate": {
      const operand = evaluateIndicatorExpression(node.operand, values);
      return operand === null ? null : -operand;
    }
    case "binary": {
      const left = evaluateIndicatorExpression(node.left, values);
      const right = evaluateIndicatorExpression(node.right, values);
      if (left === null || right === null) return null;
      switch (node.op) {
        case "+":
          return finite(left + right);
        case "-":
          return finite(left - right);
        case "*":
          return finite(left * right);
        case "/":
          return right === 0 ? null : finite(left / right);
      }
      break;
    }
    case "compare": {
      const left = evaluateIndicatorExpression(node.left, values);
      const right = evaluateIndicatorExpression(node.right, values);
      if (left === null || right === null) return null;
      return truth(COMPARE[node.op](left, right));
    }
    case "and": {
      const left = evaluateIndicatorExpression(node.left, values);
      const right = evaluateIndicatorExpression(node.right, values);
      if (left === 0 || right === 0) return 0;
      return left === null || right === null ? null : 1;
    }
    case "or": {
      const left = evaluateIndicatorExpression(node.left, values);
      const right = evaluateIndicatorExpression(node.right, values);
      if ((left !== null && left !== 0) || (right !== null && right !== 0)) {
        return 1;
      }
      return left === null || right === null ? null : 0;
    }
    case "not": {
      const operand = evaluateIndicatorExpression(node.operand, values);
      return operand === null ? null : truth(operand === 0);
    }
    case "in": {
      const operand = evaluateIndicatorExpression(node.operand, values);
      if (operand === null) return null;
      let sawNull = false;
      for (const valueNode of node.values) {
        const value = evaluateIndicatorExpression(valueNode, values);
        if (value === operand) return 1;
        if (value === null) sawNull = true;
      }
      return sawNull ? null : 0;
    }
    case "call":
      switch (node.name) {
        case "abs": {
          const operand = evaluateIndicatorExpression(node.args[0], values);
          return operand === null ? null : Math.abs(operand);
        }
        case "coalesce": {
          for (const arg of node.args) {
            const value = evaluateIndicatorExpression(arg, values);
            if (value !== null) return value;
          }
          return null;
        }
        case "nullif": {
          const a = evaluateIndicatorExpression(node.args[0], values);
          const b = evaluateIndicatorExpression(node.args[1], values);
          if (a === null) return null;
          return a === b ? null : a;
        }
      }
  }
  return null;
}

const COMPARE: Record<CompareOp, (a: number, b: number) => boolean> = {
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
};

function truth(value: boolean): number {
  return value ? 1 : 0;
}

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
