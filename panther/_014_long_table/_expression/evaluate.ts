// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ExpressionNode } from "./parse.ts";

export type ExpressionValues = Record<string, number | null | undefined>;

// The TypeScript twin of the compiled SQL. A value that is not finite is NULL
// on entry; from there the arithmetic is IEEE on both sides, so an
// intermediate may be infinite or NaN, and a result that is not finite is
// NULL. NULL propagates through the arithmetic, unary minus and abs; division
// by zero is NULL; coalesce takes the first non-NULL; nullif(a, b) is NULL
// when a = b; greatest and least ignore NULL and are NULL only when every
// argument is. NaN follows DuckDB: it equals itself and orders above every
// number.
export function evaluateExpression(
  node: ExpressionNode,
  values: ExpressionValues,
): number | null {
  return finite(evaluate(node, values));
}

function finite(n: number | null): number | null {
  return n !== null && Number.isFinite(n) ? n : null;
}

function compare(a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : 1) : -1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
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
    return v === null ? null : -v;
  }
  if (node.type === "binary") {
    const l = evaluate(node.left, values);
    const r = evaluate(node.right, values);
    if (l === null || r === null) {
      return null;
    }
    if (node.op === "+") {
      return l + r;
    }
    if (node.op === "-") {
      return l - r;
    }
    if (node.op === "*") {
      return l * r;
    }
    return r === 0 ? null : l / r;
  }
  const args = node.args.map((a) => evaluate(a, values));
  if (node.fn === "abs") {
    return args[0] === null ? null : Math.abs(args[0]);
  }
  if (node.fn === "coalesce") {
    return args.find((a) => a !== null) ?? null;
  }
  if (node.fn === "nullif") {
    const [a, b] = args;
    return a === null || (b !== null && compare(a, b) === 0) ? null : a;
  }
  const present = args.filter((a): a is number => a !== null);
  if (present.length === 0) {
    return null;
  }
  const sign = node.fn === "greatest" ? 1 : -1;
  return present.reduce((best, a) => sign * compare(a, best) > 0 ? a : best);
}
