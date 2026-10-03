// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ExpressionNode } from "../deps.ts";

// ExpressionNode to DuckDB SQL, IEEE arithmetic throughout, the semantics the
// TypeScript evaluator has. An identifier is cast to DOUBLE and is NULL when
// not finite (a HUGEINT sum would otherwise pick its own type, and an
// infinite cell would be arithmetic the row does not show). A literal is
// written in exponent form, which DuckDB reads as a DOUBLE: a bare 50000 is
// an INTEGER and a bare 0.1 a DECIMAL, with integer overflow and exact
// decimal arithmetic the evaluator does not have. A divide goes through
// NULLIF so a zero divisor is NULL, not an error. Nothing from the user's
// text reaches this function: numbers are re-serialized from the parsed
// value and identifiers go through `ref`.
export function expressionSql(
  node: ExpressionNode,
  ref: (name: string) => string,
): string {
  if (node.type === "number") {
    if (!Number.isFinite(node.value)) {
      throw new Error("An expression literal is not finite");
    }
    return node.value.toExponential();
  }
  if (node.type === "identifier") {
    const value = `CAST(${ref(node.name)} AS DOUBLE)`;
    return `(CASE WHEN isfinite(${value}) THEN ${value} END)`;
  }
  if (node.type === "unary") {
    return `(-${expressionSql(node.operand, ref)})`;
  }
  if (node.type === "binary") {
    const left = expressionSql(node.left, ref);
    const right = expressionSql(node.right, ref);
    return node.op === "/"
      ? `(${left} / NULLIF(${right}, 0))`
      : `(${left} ${node.op} ${right})`;
  }
  return `${node.fn}(${
    node.args.map((a) => expressionSql(a, ref)).join(", ")
  })`;
}
