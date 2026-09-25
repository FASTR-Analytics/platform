// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ExpressionNode } from "./parse.ts";

export type ExpressionValues = Record<string, number | null | undefined>;

// The TypeScript twin of the compiled SQL: NULL propagates through the
// arithmetic, unary minus and abs; division by zero is NULL; coalesce takes
// the first non-NULL; nullif(a, b) is NULL when a = b; greatest and least
// ignore NULL and are NULL only when every argument is; a non-finite result
// is NULL.
export function evaluateExpression(
  node: ExpressionNode,
  values: ExpressionValues,
): number | null {
  return finite(evaluate(node, values));
}

function finite(n: number | null): number | null {
  return n !== null && Number.isFinite(n) ? n : null;
}

function evaluate(
  node: ExpressionNode,
  values: ExpressionValues,
): number | null {
  if (node.type === "number") {
    return node.value;
  }
  if (node.type === "identifier") {
    return finite(values[node.name] ?? null);
  }
  if (node.type === "unary") {
    const v = evaluate(node.operand, values);
    return v === null ? null : finite(-v);
  }
  if (node.type === "binary") {
    const l = evaluate(node.left, values);
    const r = evaluate(node.right, values);
    if (l === null || r === null) {
      return null;
    }
    if (node.op === "+") {
      return finite(l + r);
    }
    if (node.op === "-") {
      return finite(l - r);
    }
    if (node.op === "*") {
      return finite(l * r);
    }
    return r === 0 ? null : finite(l / r);
  }
  const args = node.args.map((a) => evaluate(a, values));
  if (node.fn === "abs") {
    return args[0] === null ? null : finite(Math.abs(args[0]));
  }
  if (node.fn === "coalesce") {
    return args.find((a) => a !== null) ?? null;
  }
  if (node.fn === "nullif") {
    return args[0] === null ? null : args[0] === args[1] ? null : args[0];
  }
  const present = args.filter((a): a is number => a !== null);
  if (present.length === 0) {
    return null;
  }
  return node.fn === "greatest" ? Math.max(...present) : Math.min(...present);
}
