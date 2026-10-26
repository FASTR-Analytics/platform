// =============================================================================
// Indicator expression grammar: tokenizer, parser, AST
// =============================================================================
//
// One language for HMIS calculated indicators and HFA indicator code:
//   - numbers, "quoted text" ('single quotes' too, no escapes), identifiers,
//     parentheses. An identifier is bare when it matches
//     BARE_IDENTIFIER_PATTERN, otherwise written `[in brackets]` (indicator
//     ids may carry characters the bare form cannot);
//   - arithmetic `+ - * /` and unary minus;
//   - comparison `== != < > <= >=`, which does not chain (`a < b < c` is an
//     error);
//   - logic `AND OR NOT` in any case, with `& | !` as the same operators;
//   - the list test `x IN (1, 2)`, negated as `x NOT IN (1, 2)`;
//   - the calls `abs`, `coalesce`, `nullif`.
// Precedence, loosest first: OR, AND, NOT, comparison and IN, `+ -`, `* /`,
// unary minus, primary.
//
// Each consumer narrows the language: a calculated indicator refuses text and
// IN (resolve.ts), HFA indicator code refuses calls (lib/hfa_indicator_code.ts).
//
// Expressions are CATALOG DATA. They are parsed here, evaluated by
// evaluate.ts, and never emitted as SQL or accepted from the wire.
//
// =============================================================================

export type CompareOp = "==" | "!=" | "<" | ">" | "<=" | ">=";

export type ExpressionNode =
  // `raw` is the matched source text, and it is what the writer emits:
  // String(value) renders 0.0000001 as "1e-7" and values ≥ 1e21 as "1e+21",
  // neither of which the tokenizer (no exponent form) can read back. Carrying
  // the source is exact by construction. `value` is what evaluate.ts uses.
  | { kind: "number"; value: number; raw: string }
  | { kind: "string"; value: string }
  | { kind: "identifier"; name: string }
  | { kind: "negate"; operand: ExpressionNode }
  | {
    kind: "binary";
    op: "+" | "-" | "*" | "/";
    left: ExpressionNode;
    right: ExpressionNode;
  }
  | {
    kind: "compare";
    op: CompareOp;
    left: ExpressionNode;
    right: ExpressionNode;
  }
  | { kind: "and"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "or"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "not"; operand: ExpressionNode }
  | { kind: "in"; operand: ExpressionNode; values: ExpressionNode[] }
  | { kind: "call"; name: ExpressionFunctionName; args: ExpressionNode[] };

export const EXPRESSION_FUNCTION_NAMES = ["abs", "coalesce", "nullif"] as const;
export type ExpressionFunctionName = (typeof EXPRESSION_FUNCTION_NAMES)[number];

// Matched case-insensitively. A bare identifier spelled like one is the
// keyword; `[in]` is the identifier.
export const EXPRESSION_KEYWORDS = ["and", "or", "not", "in"] as const;
type ExpressionKeyword = (typeof EXPRESSION_KEYWORDS)[number];

export const BARE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

// Arity per function. `coalesce` is variadic with a floor of two: a one-
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

export type ExpressionSyntaxErrorKind =
  | "empty"
  | "unexpected_char"
  | "unclosed_bracket"
  | "empty_bracket"
  | "unclosed_quote"
  | "single_equals"
  | "doubled_operator"
  | "unknown_function"
  | "uncalled_function"
  | "arity"
  | "missing_operand"
  | "expected"
  | "trailing";

// `message` is English for logs and HMIS; a consumer that shows the error in
// another language translates from `kind`, `at` and `token`.
export class ExpressionSyntaxError extends Error {
  constructor(
    readonly kind: ExpressionSyntaxErrorKind,
    // Character offset into the source; the source's length when the error
    // is at its end.
    readonly at: number,
    // What the error is about: the offending character or token, the function
    // name, or, for `expected`, the punctuation that was expected. Empty for
    // `empty` and for `missing_operand` at the end of the source.
    readonly token: string,
    message: string,
  ) {
    super(message);
  }
}

type Punct =
  | "+"
  | "-"
  | "*"
  | "/"
  | "("
  | ")"
  | ","
  | CompareOp
  | "&"
  | "|"
  | "!";

type Token =
  | { type: "number"; value: number; raw: string; at: number }
  | { type: "string"; value: string; raw: string; at: number }
  // `quoted` marks a [bracketed] identifier: a quoted name is ALWAYS a plain
  // identifier, so an indicator literally named `abs` or `in` written as
  // `[abs]` or `[in]` never collides with the function or the keyword.
  | { type: "identifier"; name: string; quoted: boolean; at: number }
  | { type: "keyword"; value: ExpressionKeyword; raw: string; at: number }
  | { type: "punct"; value: Punct; at: number };

const TWO_CHAR_PUNCT: readonly Punct[] = ["==", "!=", "<=", ">="];
const ONE_CHAR_PUNCT: readonly Punct[] = [
  "+",
  "-",
  "*",
  "/",
  "(",
  ")",
  ",",
  "<",
  ">",
  "&",
  "|",
  "!",
];

function isKeyword(word: string): word is ExpressionKeyword {
  return (EXPRESSION_KEYWORDS as readonly string[]).includes(word);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    const pair = source.slice(i, i + 2);
    if (pair === "&&" || pair === "||") {
      throw new ExpressionSyntaxError(
        "doubled_operator",
        i,
        pair,
        `${pair} at position ${i}: write ${pair[0]}`,
      );
    }
    const twoChar = TWO_CHAR_PUNCT.find((p) => p === pair);
    if (twoChar !== undefined) {
      tokens.push({ type: "punct", value: twoChar, at: i });
      i += 2;
      continue;
    }
    if (ch === "=") {
      throw new ExpressionSyntaxError(
        "single_equals",
        i,
        ch,
        `Single = at position ${i}: write == to compare`,
      );
    }
    const oneChar = ONE_CHAR_PUNCT.find((p) => p === ch);
    if (oneChar !== undefined) {
      tokens.push({ type: "punct", value: oneChar, at: i });
      i++;
      continue;
    }
    if (ch === "[") {
      const end = source.indexOf("]", i + 1);
      if (end === -1) {
        throw new ExpressionSyntaxError(
          "unclosed_bracket",
          i,
          ch,
          `Unclosed [ at position ${i}`,
        );
      }
      const name = source.slice(i + 1, end);
      if (name.length === 0) {
        throw new ExpressionSyntaxError(
          "empty_bracket",
          i,
          "[]",
          `Empty [] at position ${i}`,
        );
      }
      tokens.push({ type: "identifier", name, quoted: true, at: i });
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, i + 1);
      if (end === -1) {
        throw new ExpressionSyntaxError(
          "unclosed_quote",
          i,
          ch,
          `Unclosed ${ch} at position ${i}`,
        );
      }
      tokens.push({
        type: "string",
        value: source.slice(i + 1, end),
        raw: source.slice(i, end + 1),
        at: i,
      });
      i = end + 1;
      continue;
    }
    const numberMatch = /^[0-9]+(\.[0-9]+)?/.exec(source.slice(i));
    if (numberMatch !== null) {
      tokens.push({
        type: "number",
        value: Number(numberMatch[0]),
        raw: numberMatch[0],
        at: i,
      });
      i += numberMatch[0].length;
      continue;
    }
    const wordMatch = /^[A-Za-z][A-Za-z0-9_]*/.exec(source.slice(i));
    if (wordMatch !== null) {
      const word = wordMatch[0];
      const lower = word.toLowerCase();
      tokens.push(
        isKeyword(lower)
          ? { type: "keyword", value: lower, raw: word, at: i }
          : { type: "identifier", name: word, quoted: false, at: i },
      );
      i += word.length;
      continue;
    }
    throw new ExpressionSyntaxError(
      "unexpected_char",
      i,
      ch,
      `Unexpected character ${JSON.stringify(ch)} at position ${i}`,
    );
  }
  return tokens;
}

function isFunctionName(name: string): name is ExpressionFunctionName {
  return (EXPRESSION_FUNCTION_NAMES as readonly string[]).includes(name);
}

function tokenText(token: Token): string {
  switch (token.type) {
    case "number":
    case "string":
    case "keyword":
      return token.raw;
    case "identifier":
      return token.quoted ? `[${token.name}]` : token.name;
    case "punct":
      return token.value;
  }
}

function isPunct(
  token: Token | undefined,
  value: Punct,
): boolean {
  return token !== undefined && token.type === "punct" &&
    token.value === value;
}

function isKeywordToken(
  token: Token | undefined,
  value: ExpressionKeyword,
): boolean {
  return token !== undefined && token.type === "keyword" &&
    token.value === value;
}

const COMPARE_OPS: readonly CompareOp[] = ["==", "!=", "<", ">", "<=", ">="];

export function parseIndicatorExpression(source: string): ExpressionNode {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    throw new ExpressionSyntaxError("empty", 0, "", "Expression is empty");
  }
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const expectPunct = (value: "(" | ")"): void => {
    const token = peek();
    if (!isPunct(token, value)) {
      throw new ExpressionSyntaxError(
        "expected",
        token?.at ?? source.length,
        value,
        `Expected ${JSON.stringify(value)}${
          token === undefined
            ? " at end of expression"
            : ` at position ${token.at}`
        }`,
      );
    }
    pos++;
  };

  const parseCall = (
    name: string,
    at: number,
  ): ExpressionNode => {
    if (!isFunctionName(name)) {
      throw new ExpressionSyntaxError(
        "unknown_function",
        at,
        name,
        `Unknown function ${JSON.stringify(name)} at position ${at} — only ${
          EXPRESSION_FUNCTION_NAMES.join(", ")
        } are available`,
      );
    }
    pos++;
    const args: ExpressionNode[] = [];
    if (isPunct(peek(), ")")) {
      pos++;
    } else {
      for (;;) {
        args.push(parseOr());
        if (isPunct(peek(), ",")) {
          pos++;
          continue;
        }
        expectPunct(")");
        break;
      }
    }
    const arity = FUNCTION_ARITY[name];
    if (args.length < arity.min || args.length > arity.max) {
      throw new ExpressionSyntaxError(
        "arity",
        at,
        name,
        `${name}() takes ${
          arity.min === arity.max
            ? `${arity.min} argument${arity.min === 1 ? "" : "s"}`
            : `${arity.min} to ${arity.max} arguments`
        }, got ${args.length}`,
      );
    }
    return { kind: "call", name, args };
  };

  const parsePrimary = (): ExpressionNode => {
    const token = peek();
    if (token === undefined) {
      throw new ExpressionSyntaxError(
        "missing_operand",
        source.length,
        "",
        "Unexpected end of expression",
      );
    }
    switch (token.type) {
      case "number":
        pos++;
        return { kind: "number", value: token.value, raw: token.raw };
      case "string":
        pos++;
        return { kind: "string", value: token.value };
      case "identifier": {
        pos++;
        if (!token.quoted && isPunct(peek(), "(")) {
          return parseCall(token.name, token.at);
        }
        if (!token.quoted && isFunctionName(token.name)) {
          throw new ExpressionSyntaxError(
            "uncalled_function",
            token.at,
            token.name,
            `${token.name} is a function and must be called: ${token.name}(...)`,
          );
        }
        return { kind: "identifier", name: token.name };
      }
      case "punct":
        if (token.value === "(") {
          pos++;
          const inner = parseOr();
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
        break;
      case "keyword":
        break;
    }
    throw new ExpressionSyntaxError(
      "missing_operand",
      token.at,
      tokenText(token),
      `Unexpected ${JSON.stringify(tokenText(token))} at position ${token.at}`,
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

  const parseList = (): ExpressionNode[] => {
    expectPunct("(");
    const values = [parseSum()];
    while (isPunct(peek(), ",")) {
      pos++;
      values.push(parseSum());
    }
    expectPunct(")");
    return values;
  };

  const parseComparison = (): ExpressionNode => {
    const left = parseSum();
    const token = peek();
    if (token === undefined) return left;
    if (token.type === "punct") {
      const op = COMPARE_OPS.find((o) => o === token.value);
      if (op === undefined) return left;
      pos++;
      return { kind: "compare", op, left, right: parseSum() };
    }
    if (isKeywordToken(token, "in")) {
      pos++;
      return { kind: "in", operand: left, values: parseList() };
    }
    if (isKeywordToken(token, "not") && isKeywordToken(tokens[pos + 1], "in")) {
      pos += 2;
      return {
        kind: "not",
        operand: { kind: "in", operand: left, values: parseList() },
      };
    }
    return left;
  };

  const parseNot = (): ExpressionNode => {
    const token = peek();
    if (isKeywordToken(token, "not") || isPunct(token, "!")) {
      pos++;
      return { kind: "not", operand: parseNot() };
    }
    return parseComparison();
  };

  const parseAnd = (): ExpressionNode => {
    let left = parseNot();
    while (isKeywordToken(peek(), "and") || isPunct(peek(), "&")) {
      pos++;
      left = { kind: "and", left, right: parseNot() };
    }
    return left;
  };

  const parseOr = (): ExpressionNode => {
    let left = parseAnd();
    while (isKeywordToken(peek(), "or") || isPunct(peek(), "|")) {
      pos++;
      left = { kind: "or", left, right: parseAnd() };
    }
    return left;
  };

  const ast = parseOr();
  const trailing = peek();
  if (trailing !== undefined) {
    throw new ExpressionSyntaxError(
      "trailing",
      trailing.at,
      tokenText(trailing),
      `Unexpected ${
        JSON.stringify(tokenText(trailing))
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
      case "string":
        return;
      case "identifier":
        seen.add(n.name);
        return;
      case "negate":
      case "not":
        walk(n.operand);
        return;
      case "binary":
      case "compare":
      case "and":
      case "or":
        walk(n.left);
        walk(n.right);
        return;
      case "in":
        walk(n.operand);
        for (const value of n.values) walk(value);
        return;
      case "call":
        for (const arg of n.args) walk(arg);
        return;
    }
  };
  walk(node);
  return [...seen];
}

// A function name or a keyword is bracket-quoted even though it matches the
// bare pattern: written bare, an indicator literally named `abs` would
// re-parse as "must be called", and one named `in` as the keyword. The
// tokenizer marks a quoted name as a plain identifier, so the round trip
// holds.
export function writeIdentifier(name: string): string {
  return BARE_IDENTIFIER_PATTERN.test(name) && !isFunctionName(name) &&
      !isKeyword(name)
    ? name
    : `[${name}]`;
}

// A number the grammar will read back. The tokenizer accepts plain decimals
// only (`[0-9]+(\.[0-9]+)?`), so this never goes through String(), which
// emits `1e-7` / `1e+21` for extreme values. Negative values carry a leading
// `-`, which re-parses as a negation of the literal.
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

// Canonical text for an AST: fully parenthesised at every binary node, so a
// substituted sub-expression can never be re-associated by its host's
// precedence. Logic is written `& | !`, which R reads the same way, so a
// calculated indicator's text stays evaluable by m012's script.
export function writeIndicatorExpression(node: ExpressionNode): string {
  switch (node.kind) {
    case "number":
      return node.raw;
    case "string":
      return writeStringLiteral(node.value);
    case "identifier":
      return writeIdentifier(node.name);
    case "negate":
      return `-${writeIndicatorExpression(node.operand)}`;
    case "not":
      return `(!${writeIndicatorExpression(node.operand)})`;
    case "binary":
    case "compare":
      return `(${writeIndicatorExpression(node.left)} ${node.op} ${
        writeIndicatorExpression(node.right)
      })`;
    case "and":
    case "or":
      return `(${writeIndicatorExpression(node.left)} ${
        node.kind === "and" ? "&" : "|"
      } ${writeIndicatorExpression(node.right)})`;
    case "in":
      return `(${writeIndicatorExpression(node.operand)} IN (${
        node.values.map(writeIndicatorExpression).join(", ")
      }))`;
    case "call":
      return `${node.name}(${
        node.args.map(writeIndicatorExpression).join(", ")
      })`;
  }
}

// The grammar has no escapes, so text holding a double quote can only have
// been written in single quotes.
function writeStringLiteral(value: string): string {
  return value.includes('"') ? `'${value}'` : `"${value}"`;
}

// One identifier renamed in an expression's TEXT, formatting kept: a bare
// identifier stands alone between non-identifier characters, a bracketed
// one is `[from]` exactly, and text inside other brackets or inside quotes is
// untouched.
// Instance migration 086's fastr_rename_identifier is the same segment rule
// for the one rename it makes (a special id to its bare suffix form), but
// substitutes the new id raw; this one writes the replacement as the
// grammar requires (`writeIdentifier`), since a renamed indicator's new id
// may not be bare-shaped. An indicator rename rewrites every stored
// expression with this, so the author's spacing and parentheses survive.
export function renameIdentifierInExpression(
  source: string,
  from: string,
  to: string,
): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bare = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, "g");
  return source
    .split(/(\[[^\]]*\]|"[^"]*"|'[^']*')/)
    .map((segment) => {
      if (segment.startsWith("[")) {
        return segment === `[${from}]` ? `[${to}]` : segment;
      }
      if (segment.startsWith('"') || segment.startsWith("'")) return segment;
      return segment.replace(bare, () => writeIdentifier(to));
    })
    .join("");
}

// The same AST with every identifier renamed through `mapping`. The catalog
// uses it to rewrite a flattened expression from ingredient ids to the slot
// columns m012 materialises, so the text m012 evaluates names `ing1..ing8`
// and nothing else. A name the mapping lacks is a broken slot map, not a
// passthrough.
export function renameIdentifiers(
  node: ExpressionNode,
  mapping: Record<string, string>,
): ExpressionNode {
  const rename = (n: ExpressionNode) => renameIdentifiers(n, mapping);
  switch (node.kind) {
    case "number":
    case "string":
      return node;
    case "identifier": {
      const renamed = mapping[node.name];
      if (renamed === undefined) {
        throw new Error(`No slot for ingredient ${JSON.stringify(node.name)}`);
      }
      return { kind: "identifier", name: renamed };
    }
    case "negate":
    case "not":
      return { kind: node.kind, operand: rename(node.operand) };
    case "binary":
      return {
        kind: "binary",
        op: node.op,
        left: rename(node.left),
        right: rename(node.right),
      };
    case "compare":
      return {
        kind: "compare",
        op: node.op,
        left: rename(node.left),
        right: rename(node.right),
      };
    case "and":
    case "or":
      return {
        kind: node.kind,
        left: rename(node.left),
        right: rename(node.right),
      };
    case "in":
      return {
        kind: "in",
        operand: rename(node.operand),
        values: node.values.map(rename),
      };
    case "call":
      return { kind: "call", name: node.name, args: node.args.map(rename) };
  }
}
