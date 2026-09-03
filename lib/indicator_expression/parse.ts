// =============================================================================
// Indicator expression grammar — tokenizer, parser, AST
// =============================================================================
//
// The grammar a derived common indicator's definition is written in
// (PLAN_1a §1.3): `+ - * /`, parentheses, numeric literals, identifiers, and
// the three calls `abs` / `coalesce` / `nullif`. An identifier names another
// common indicator: bare when it matches BARE_IDENTIFIER_PATTERN, otherwise
// written `[in brackets]` (common indicator ids may carry characters the bare
// form cannot).
//
// Expressions are CATALOG DATA. They are parsed here, evaluated by
// evaluate.ts, and never emitted as SQL or accepted from the wire.
//
// =============================================================================

export type ExpressionNode =
  // `raw` is the matched source text, and it is what the writer emits:
  // String(value) renders 0.0000001 as "1e-7" and values ≥ 1e21 as "1e+21",
  // neither of which the tokenizer (no exponent form) can read back. Carrying
  // the source is exact by construction. `value` is what evaluate.ts uses.
  | { kind: "number"; value: number; raw: string }
  | { kind: "identifier"; name: string }
  | { kind: "negate"; operand: ExpressionNode }
  | {
    kind: "binary";
    op: "+" | "-" | "*" | "/";
    left: ExpressionNode;
    right: ExpressionNode;
  }
  | { kind: "call"; name: ExpressionFunctionName; args: ExpressionNode[] };

export const EXPRESSION_FUNCTION_NAMES = ["abs", "coalesce", "nullif"] as const;
export type ExpressionFunctionName =
  (typeof EXPRESSION_FUNCTION_NAMES)[number];

export const BARE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

// Arity per function. `coalesce` is variadic with a floor of two — a one-
// argument coalesce is always the argument itself, so accepting it would only
// hide an authoring mistake.
const FUNCTION_ARITY: Record<
  ExpressionFunctionName,
  { min: number; max: number }
> = {
  abs: { min: 1, max: 1 },
  coalesce: { min: 2, max: 8 },
  nullif: { min: 2, max: 2 },
};

export class ExpressionSyntaxError extends Error {}

type Token =
  | { type: "number"; value: number; raw: string; at: number }
  // `quoted` marks a [bracketed] identifier: a quoted name is ALWAYS a plain
  // identifier, so an indicator literally named `abs` written as `[abs]` never
  // collides with the function.
  | { type: "identifier"; name: string; quoted: boolean; at: number }
  | { type: "punct"; value: "+" | "-" | "*" | "/" | "(" | ")" | ","; at: number };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (
      ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "(" ||
      ch === ")" || ch === ","
    ) {
      tokens.push({ type: "punct", value: ch, at: i });
      i++;
      continue;
    }
    if (ch === "[") {
      const end = source.indexOf("]", i + 1);
      if (end === -1) {
        throw new ExpressionSyntaxError(
          `Unclosed [ at position ${i}`,
        );
      }
      const name = source.slice(i + 1, end);
      if (name.length === 0) {
        throw new ExpressionSyntaxError(`Empty [] at position ${i}`);
      }
      tokens.push({ type: "identifier", name, quoted: true, at: i });
      i = end + 1;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const match = /^[0-9]+(\.[0-9]+)?/.exec(source.slice(i));
      if (match === null) {
        throw new ExpressionSyntaxError(`Invalid number at position ${i}`);
      }
      tokens.push({
        type: "number",
        value: Number(match[0]),
        raw: match[0],
        at: i,
      });
      i += match[0].length;
      continue;
    }
    const identifierMatch = /^[A-Za-z][A-Za-z0-9_]*/.exec(source.slice(i));
    if (identifierMatch !== null) {
      tokens.push({
        type: "identifier",
        name: identifierMatch[0],
        quoted: false,
        at: i,
      });
      i += identifierMatch[0].length;
      continue;
    }
    throw new ExpressionSyntaxError(
      `Unexpected character ${JSON.stringify(ch)} at position ${i}`,
    );
  }
  return tokens;
}

function isFunctionName(name: string): name is ExpressionFunctionName {
  return (EXPRESSION_FUNCTION_NAMES as readonly string[]).includes(name);
}

export function parseIndicatorExpression(source: string): ExpressionNode {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    throw new ExpressionSyntaxError("Expression is empty");
  }
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const expectPunct = (value: string): void => {
    const token = peek();
    if (token === undefined || token.type !== "punct" || token.value !== value) {
      throw new ExpressionSyntaxError(
        `Expected ${JSON.stringify(value)}${
          token === undefined ? " at end of expression" : ` at position ${token.at}`
        }`,
      );
    }
    pos++;
  };

  const parsePrimary = (): ExpressionNode => {
    const token = peek();
    if (token === undefined) {
      throw new ExpressionSyntaxError("Unexpected end of expression");
    }
    if (token.type === "number") {
      pos++;
      return { kind: "number", value: token.value, raw: token.raw };
    }
    if (token.type === "identifier") {
      pos++;
      const next = peek();
      if (
        !token.quoted && next !== undefined && next.type === "punct" &&
        next.value === "("
      ) {
        if (!isFunctionName(token.name)) {
          throw new ExpressionSyntaxError(
            `Unknown function ${JSON.stringify(token.name)} at position ${token.at} — only ${
              EXPRESSION_FUNCTION_NAMES.join(", ")
            } are available`,
          );
        }
        pos++;
        const args: ExpressionNode[] = [];
        const closing = peek();
        if (closing !== undefined && closing.type === "punct" && closing.value === ")") {
          pos++;
        } else {
          for (;;) {
            args.push(parseSum());
            const sep = peek();
            if (sep !== undefined && sep.type === "punct" && sep.value === ",") {
              pos++;
              continue;
            }
            expectPunct(")");
            break;
          }
        }
        const arity = FUNCTION_ARITY[token.name];
        if (args.length < arity.min || args.length > arity.max) {
          throw new ExpressionSyntaxError(
            `${token.name}() takes ${
              arity.min === arity.max
                ? `${arity.min} argument${arity.min === 1 ? "" : "s"}`
                : `${arity.min} to ${arity.max} arguments`
            }, got ${args.length}`,
          );
        }
        return { kind: "call", name: token.name, args };
      }
      if (!token.quoted && isFunctionName(token.name)) {
        throw new ExpressionSyntaxError(
          `${token.name} is a function and must be called: ${token.name}(...)`,
        );
      }
      return { kind: "identifier", name: token.name };
    }
    if (token.value === "(") {
      pos++;
      const inner = parseSum();
      expectPunct(")");
      return inner;
    }
    if (token.value === "-") {
      pos++;
      return { kind: "negate", operand: parsePrimary() };
    }
    if (token.value === "+") {
      pos++;
      return parsePrimary();
    }
    throw new ExpressionSyntaxError(
      `Unexpected ${JSON.stringify(token.value)} at position ${token.at}`,
    );
  };

  const parseProduct = (): ExpressionNode => {
    let left = parsePrimary();
    for (;;) {
      const token = peek();
      if (
        token === undefined || token.type !== "punct" ||
        (token.value !== "*" && token.value !== "/")
      ) {
        return left;
      }
      pos++;
      left = { kind: "binary", op: token.value, left, right: parsePrimary() };
    }
  };

  const parseSum = (): ExpressionNode => {
    let left = parseProduct();
    for (;;) {
      const token = peek();
      if (
        token === undefined || token.type !== "punct" ||
        (token.value !== "+" && token.value !== "-")
      ) {
        return left;
      }
      pos++;
      left = { kind: "binary", op: token.value, left, right: parseProduct() };
    }
  };

  const ast = parseSum();
  const trailing = peek();
  if (trailing !== undefined) {
    throw new ExpressionSyntaxError(
      `Unexpected ${
        trailing.type === "identifier"
          ? JSON.stringify(trailing.name)
          : JSON.stringify(String((trailing as { value: unknown }).value))
      } at position ${trailing.at}`,
    );
  }
  return ast;
}

// Every identifier the expression names, in first-appearance order, deduped.
export function collectIdentifiers(node: ExpressionNode): string[] {
  const seen = new Set<string>();
  const walk = (n: ExpressionNode): void => {
    switch (n.kind) {
      case "number":
        return;
      case "identifier":
        seen.add(n.name);
        return;
      case "negate":
        walk(n.operand);
        return;
      case "binary":
        walk(n.left);
        walk(n.right);
        return;
      case "call":
        for (const arg of n.args) walk(arg);
        return;
    }
  };
  walk(node);
  return [...seen];
}

// A function name is bracket-quoted even though it matches the bare pattern:
// an indicator literally named `abs` written bare would re-parse as "must be
// called". The tokenizer marks a quoted name as a plain identifier, so the
// round trip holds.
export function writeIdentifier(name: string): string {
  return BARE_IDENTIFIER_PATTERN.test(name) && !isFunctionName(name)
    ? name
    : `[${name}]`;
}

// A number the grammar will read back. The tokenizer accepts plain decimals
// only (`[0-9]+(\.[0-9]+)?`), so this never goes through String(), which
// emits `1e-7` / `1e+21` for extreme values (PLAN_1a §1.3). Negative values
// carry a leading `-`, which re-parses as a negation of the literal.
export function writeNumberLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot write ${value} as an expression literal`);
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e21) {
    return `${sign}${BigInt(Math.round(abs)).toString()}`;
  }
  const text = abs.toFixed(20);
  return `${sign}${text.replace(/\.?0+$/, "")}`;
}

// Canonical text for an AST — fully parenthesised at every binary node, so a
// substituted sub-expression can never be re-associated by its host's
// precedence.
export function writeIndicatorExpression(node: ExpressionNode): string {
  switch (node.kind) {
    case "number":
      return node.raw;
    case "identifier":
      return writeIdentifier(node.name);
    case "negate":
      return `-${writeIndicatorExpression(node.operand)}`;
    case "binary":
      return `(${writeIndicatorExpression(node.left)} ${node.op} ${
        writeIndicatorExpression(node.right)
      })`;
    case "call":
      return `${node.name}(${
        node.args.map(writeIndicatorExpression).join(", ")
      })`;
  }
}
