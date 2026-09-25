// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { LongTableValidationError } from "../types.ts";

export const EXPRESSION_FUNCTIONS = [
  "abs",
  "coalesce",
  "nullif",
  "greatest",
  "least",
] as const;
export type ExpressionFunction = (typeof EXPRESSION_FUNCTIONS)[number];

export type BinaryOperator = "+" | "-" | "*" | "/";

export type ExpressionNode =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "unary"; operand: ExpressionNode }
  | {
    type: "binary";
    op: BinaryOperator;
    left: ExpressionNode;
    right: ExpressionNode;
  }
  | { type: "call"; fn: ExpressionFunction; args: ExpressionNode[] };

export const MAX_EXPRESSION_LENGTH = 2000;
export const MAX_EXPRESSION_NODES = 500;
export const MAX_EXPRESSION_DEPTH = 32;

type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "op"; op: BinaryOperator }
  | { kind: "(" }
  | { kind: ")" }
  | { kind: "," };

function fail(message: string): never {
  throw new LongTableValidationError(message);
}

const FUNCTION_SET = new Set<string>(EXPRESSION_FUNCTIONS);

function isFunctionName(name: string): name is ExpressionFunction {
  return FUNCTION_SET.has(name);
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const m = /^\d+(\.\d+)?/.exec(expr.slice(i));
      if (m === null) {
        fail(`Bad number at position ${i} in expression`);
      }
      tokens.push({ kind: "number", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expr.slice(i));
      if (m === null) {
        fail(`Bad identifier at position ${i} in expression`);
      }
      tokens.push({ kind: "identifier", name: m[0] });
      i += m[0].length;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === ",") {
      tokens.push({ kind: ch });
      i++;
      continue;
    }
    fail(
      `Unexpected character ${
        JSON.stringify(ch)
      } at position ${i} in expression`,
    );
  }
  return tokens;
}

// Recursive descent over the tokens: sum → product → unary → atom. Every
// node counts toward the size cap and every nesting level toward the depth
// cap, so a hostile string is refused before it costs anything.
class Parser {
  private pos = 0;
  private nodes = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ExpressionNode {
    if (this.tokens.length === 0) {
      fail("Expression is empty");
    }
    const node = this.sum(0);
    if (this.pos < this.tokens.length) {
      fail(`Unexpected token after the expression at token ${this.pos + 1}`);
    }
    return node;
  }

  private make(node: ExpressionNode): ExpressionNode {
    this.nodes++;
    if (this.nodes > MAX_EXPRESSION_NODES) {
      fail(`Expression has more than ${MAX_EXPRESSION_NODES} nodes`);
    }
    return node;
  }

  private descend(depth: number): number {
    if (depth + 1 > MAX_EXPRESSION_DEPTH) {
      fail(`Expression nests deeper than ${MAX_EXPRESSION_DEPTH}`);
    }
    return depth + 1;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (t === undefined) {
      fail("Expression ends unexpectedly");
    }
    this.pos++;
    return t;
  }

  private sum(depth: number): ExpressionNode {
    let left = this.product(depth);
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.op === "+" || t.op === "-")) {
        this.pos++;
        const right = this.product(depth);
        left = this.make({ type: "binary", op: t.op, left, right });
      } else {
        return left;
      }
    }
  }

  private product(depth: number): ExpressionNode {
    let left = this.unary(depth);
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.op === "*" || t.op === "/")) {
        this.pos++;
        const right = this.unary(depth);
        left = this.make({ type: "binary", op: t.op, left, right });
      } else {
        return left;
      }
    }
  }

  private unary(depth: number): ExpressionNode {
    const t = this.peek();
    if (t?.kind === "op" && t.op === "-") {
      this.pos++;
      const operand = this.unary(this.descend(depth));
      return this.make({ type: "unary", operand });
    }
    if (t?.kind === "op" && t.op === "+") {
      fail("Unary plus is not supported");
    }
    return this.atom(depth);
  }

  private atom(depth: number): ExpressionNode {
    const t = this.next();
    if (t.kind === "number") {
      return this.make({ type: "number", value: t.value });
    }
    if (t.kind === "(") {
      const inner = this.sum(this.descend(depth));
      this.expect(")");
      return inner;
    }
    if (t.kind === "identifier") {
      if (this.peek()?.kind === "(") {
        return this.call(t.name, depth);
      }
      if (isFunctionName(t.name.toLowerCase())) {
        fail(`"${t.name}" is a function and needs arguments`);
      }
      return this.make({ type: "identifier", name: t.name });
    }
    fail(`Unexpected token at token ${this.pos}`);
  }

  private call(name: string, depth: number): ExpressionNode {
    const fn = name.toLowerCase();
    if (!isFunctionName(fn)) {
      fail(`Unknown function "${name}"`);
    }
    this.expect("(");
    const args: ExpressionNode[] = [];
    const inner = this.descend(depth);
    if (this.peek()?.kind !== ")") {
      args.push(this.sum(inner));
      while (this.peek()?.kind === ",") {
        this.pos++;
        args.push(this.sum(inner));
      }
    }
    this.expect(")");
    if (fn === "abs" && args.length !== 1) {
      fail("abs takes exactly one argument");
    }
    if (fn === "nullif" && args.length !== 2) {
      fail("nullif takes exactly two arguments");
    }
    if (args.length === 0) {
      fail(`${fn} needs at least one argument`);
    }
    return this.make({ type: "call", fn, args });
  }

  private expect(kind: "(" | ")"): void {
    const t = this.next();
    if (t.kind !== kind) {
      fail(`Expected "${kind}" at token ${this.pos}`);
    }
  }
}

export function parseExpression(expr: string): ExpressionNode {
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    fail(`Expression is longer than ${MAX_EXPRESSION_LENGTH} characters`);
  }
  return new Parser(tokenize(expr)).parse();
}

export function getExpressionIdentifiers(node: ExpressionNode): Set<string> {
  const names = new Set<string>();
  const walk = (n: ExpressionNode): void => {
    if (n.type === "identifier") {
      names.add(n.name);
    } else if (n.type === "unary") {
      walk(n.operand);
    } else if (n.type === "binary") {
      walk(n.left);
      walk(n.right);
    } else if (n.type === "call") {
      n.args.forEach(walk);
    }
  };
  walk(node);
  return names;
}
