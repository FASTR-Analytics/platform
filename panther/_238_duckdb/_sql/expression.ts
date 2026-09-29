// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ExpressionNode } from "../deps.ts";

// ExpressionNode to DuckDB SQL. Identifiers are cast to DOUBLE so every
// operation is IEEE arithmetic, the semantics the TypeScript evaluator has
// (a HUGEINT sum or a DECIMAL literal would otherwise pick its own type);
// a divide goes through NULLIF so a zero divisor is NULL, not an error.
// Nothing from the user's text reaches this function: numbers are
// re-serialized from the parsed value and identifiers go through `ref`.
export function expressionSql(
  node: ExpressionNode,
  ref: (name: string) => string,
): string {
  if (node.type === "number") {
    return String(node.value);
  }
  if (node.type === "identifier") {
    return `CAST(${ref(node.name)} AS DOUBLE)`;
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
