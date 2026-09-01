// =============================================================================
// Indicator expression evaluator — pure, post-aggregation
// =============================================================================
//
// The read path aggregates a derived indicator's additive ingredients with
// SUM and then applies its expression to the SUMS (PLAN_1a §0:
// expression-over-sums, never sum-of-expressions). This is that application:
// a slot record in, one number or null out. No SQL, no I/O, no catalog
// lookups.
//
// Semantics:
//   - NULL propagates through every operator and through abs().
//   - Division by zero yields NULL rather than Infinity/NaN — a zero
//     denominator is "no rate here", not an error.
//   - A non-finite result (an overflow from very large sums) yields NULL, so
//     no NaN/Infinity can ever reach a figure.
//   - An identifier with no value in the record is NULL, exactly as a missing
//     ingredient column is.
//
// =============================================================================

import type { ExpressionNode } from "./parse.ts";

export type ExpressionValues = Record<string, number | null | undefined>;

export function evaluateIndicatorExpression(
  node: ExpressionNode,
  values: ExpressionValues,
): number | null {
  switch (node.kind) {
    case "number":
      return node.value;
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

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
