// PLAN_A3 ruling 8: a DHIS2 indicator is decomposed into operands and an
// expression, never imported as values. The formula is accepted by WHITELIST:
// `#{uid}` and `#{uid.coc}` terms, plain numeric literals, `+ - * /` and
// parentheses, any whitespace between tokens. Everything else is refused with
// the offending term, because a blacklist would miss the next form DHIS2 adds.
// Pure over the four indicator fields; the caller checks each operand's
// element (ruling 6) and creates nothing here.

import {
  type Dhis2IndicatorParse,
  type Dhis2IndicatorParseRefusal,
  type Dhis2ParsedOperand,
  type ExpressionNode,
  type IndicatorFormat,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  writeIndicatorExpression,
} from "lib";

type Side = "numerator" | "denominator";

type Token =
  | { kind: "operand"; operand: Dhis2ParsedOperand; text: string }
  | { kind: "number"; value: number; raw: string; text: string }
  | { kind: "punct"; value: "+" | "-" | "*" | "/" | "(" | ")"; text: string };

type TokenizeResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; term: string };

type ParseResult =
  | { ok: true; node: ExpressionNode }
  | { ok: false; term: string };

const UID_PATTERN = /^[A-Za-z][A-Za-z0-9]{10}$/;
const NUMBER_PATTERN = /^[0-9]+(\.[0-9]+)?/;
const OPERATOR_RUN_PATTERN = /^[\^%<>=!&|]+/;
const ITEM_MODIFIER_PATTERN = /^\.[A-Za-z]+(\([^)]*\))?/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(:[A-Za-z][A-Za-z0-9_]*)?/;

// The factors DHIS2 indicator types carry and the display format each maps
// to. 1000 has no format of its own, so the expression carries the scaling
// and the derived is a number (a rate_per_1k format is an Open item).
const FACTOR_FORMATS: Record<number, IndicatorFormat> = {
  1: "number",
  100: "percent",
  1000: "number",
  10000: "rate_per_10k",
};

export function parseDhis2Indicator(indicator: {
  numerator?: string;
  denominator?: string;
  annualized?: boolean;
  factor?: number;
}): Dhis2IndicatorParse {
  if (indicator.annualized === true) {
    return refuse({ kind: "annualized" });
  }
  const factor = indicator.factor;
  const formatAs = factor === undefined ? undefined : FACTOR_FORMATS[factor];
  if (factor === undefined || formatAs === undefined) {
    return refuse({ kind: "factor", value: factor });
  }

  const numerator = parseSide(indicator.numerator ?? "", "numerator");
  if (!numerator.accepted) {
    return numerator;
  }
  const denominator = parseSide(indicator.denominator ?? "", "denominator");
  if (!denominator.accepted) {
    return denominator;
  }

  const operands = dedupeOperands([
    ...numerator.operands,
    ...denominator.operands,
  ]);
  if (operands.length > MAX_INDICATOR_EXPRESSION_INGREDIENTS) {
    return refuse({
      kind: "too_many_operands",
      count: operands.length,
      max: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
    });
  }

  const ratio: ExpressionNode = {
    kind: "binary",
    op: "/",
    left: numerator.node,
    right: denominator.node,
  };
  if (factor === 1000) {
    return {
      accepted: true,
      operands,
      expression: writeIndicatorExpression({
        kind: "binary",
        op: "*",
        left: ratio,
        right: { kind: "number", value: 1000, raw: "1000" },
      }),
      format_as: formatAs,
      note: {
        en: "The DHIS2 factor is 1000. The app has no per-1000 format, so the expression multiplies by 1000 and the indicator is shown as a number.",
        fr: "Le facteur DHIS2 est 1000. L'application n'a pas de format pour 1000, donc l'expression multiplie par 1000 et l'indicateur est affiché comme un nombre.",
        pt: "O fator DHIS2 é 1000. A aplicação não tem um formato por 1000, pelo que a expressão multiplica por 1000 e o indicador é mostrado como um número.",
      },
    };
  }
  return {
    accepted: true,
    operands,
    expression: writeIndicatorExpression(ratio),
    format_as: formatAs,
  };
}

type SideResult =
  | { accepted: true; node: ExpressionNode; operands: Dhis2ParsedOperand[] }
  | { accepted: false; refusal: Dhis2IndicatorParseRefusal };

function parseSide(source: string, side: Side): SideResult {
  if (source.trim().length === 0) {
    return { accepted: false, refusal: { kind: "empty", side } };
  }
  const tokenized = tokenize(source);
  if (!tokenized.ok) {
    return {
      accepted: false,
      refusal: { kind: "term", side, term: tokenized.term },
    };
  }
  const parsed = parseTokens(tokenized.tokens);
  if (!parsed.ok) {
    return {
      accepted: false,
      refusal: { kind: "syntax", side, term: parsed.term },
    };
  }
  const operands = tokenized.tokens.flatMap((t) =>
    t.kind === "operand" ? [t.operand] : []
  );
  return { accepted: true, node: parsed.node, operands: dedupeOperands(operands) };
}

// One pass over the source. A recognised token is pushed; the first thing
// outside the whitelist ends the pass with the offending text, captured as
// the whole construct (`N{...}`, `.periodOffset(-1)`, `[days]`, `d2:zing`,
// `&&`) so the refusal names what the user will recognise in the formula.
function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (rest.startsWith("#{")) {
      const close = rest.indexOf("}");
      if (close === -1) {
        return { ok: false, term: rest };
      }
      const text = rest.slice(0, close + 1);
      const operand = parseOperand(rest.slice(2, close));
      if (operand === undefined) {
        return { ok: false, term: text };
      }
      const modifier = ITEM_MODIFIER_PATTERN.exec(rest.slice(close + 1));
      if (modifier !== null) {
        return { ok: false, term: modifier[0] };
      }
      tokens.push({ kind: "operand", operand, text });
      i += text.length;
      continue;
    }
    if (
      ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "(" ||
      ch === ")"
    ) {
      tokens.push({ kind: "punct", value: ch, text: ch });
      i++;
      continue;
    }
    const number = NUMBER_PATTERN.exec(rest);
    if (number !== null) {
      tokens.push({
        kind: "number",
        value: Number(number[0]),
        raw: number[0],
        text: number[0],
      });
      i += number[0].length;
      continue;
    }
    if (ch === "[") {
      const close = rest.indexOf("]");
      return { ok: false, term: close === -1 ? rest : rest.slice(0, close + 1) };
    }
    const name = NAME_PATTERN.exec(rest);
    if (name !== null) {
      const after = rest.slice(name[0].length);
      if (after.startsWith("{")) {
        const close = after.indexOf("}");
        return {
          ok: false,
          term: close === -1 ? rest : name[0] + after.slice(0, close + 1),
        };
      }
      return { ok: false, term: name[0] };
    }
    const operators = OPERATOR_RUN_PATTERN.exec(rest);
    if (operators !== null) {
      return { ok: false, term: operators[0] };
    }
    return { ok: false, term: ch };
  }
  return { ok: true, tokens };
}

// `uid` or `uid.coc`, each part a DHIS2 UID. Three-part operands and the `*`
// wildcard fail the UID pattern and are refused as the whole term.
function parseOperand(inner: string): Dhis2ParsedOperand | undefined {
  const parts = inner.split(".");
  if (parts.length === 1 && UID_PATTERN.test(parts[0])) {
    return { source_id: parts[0], data_element_id: parts[0] };
  }
  if (
    parts.length === 2 && UID_PATTERN.test(parts[0]) &&
    UID_PATTERN.test(parts[1])
  ) {
    return {
      source_id: inner,
      data_element_id: parts[0],
      category_option_combo_id: parts[1],
    };
  }
  return undefined;
}

// expr := term (('+' | '-') term)*
// term := factor (('*' | '/') factor)*
// factor := '-' factor | number | operand | '(' expr ')'
function parseTokens(tokens: Token[]): ParseResult {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const failAt = (): { ok: false; term: string } => ({
    ok: false,
    term: peek()?.text ?? "end of expression",
  });
  const isPunct = (t: Token | undefined, ...values: string[]): t is Token & {
    kind: "punct";
  } => t !== undefined && t.kind === "punct" && values.includes(t.value);

  const parseExpr = (): ParseResult => {
    let left = parseTerm();
    if (!left.ok) return left;
    while (isPunct(peek(), "+", "-")) {
      const op = (tokens[pos] as Token & { kind: "punct" }).value as "+" | "-";
      pos++;
      const right = parseTerm();
      if (!right.ok) return right;
      left = {
        ok: true,
        node: { kind: "binary", op, left: left.node, right: right.node },
      };
    }
    return left;
  };

  const parseTerm = (): ParseResult => {
    let left = parseFactor();
    if (!left.ok) return left;
    while (isPunct(peek(), "*", "/")) {
      const op = (tokens[pos] as Token & { kind: "punct" }).value as "*" | "/";
      pos++;
      const right = parseFactor();
      if (!right.ok) return right;
      left = {
        ok: true,
        node: { kind: "binary", op, left: left.node, right: right.node },
      };
    }
    return left;
  };

  const parseFactor = (): ParseResult => {
    const token = peek();
    if (token === undefined) return failAt();
    if (token.kind === "number") {
      pos++;
      return {
        ok: true,
        node: { kind: "number", value: token.value, raw: token.raw },
      };
    }
    if (token.kind === "operand") {
      pos++;
      return {
        ok: true,
        node: { kind: "identifier", name: token.operand.source_id },
      };
    }
    if (isPunct(token, "-")) {
      pos++;
      const operand = parseFactor();
      if (!operand.ok) return operand;
      return { ok: true, node: { kind: "negate", operand: operand.node } };
    }
    if (isPunct(token, "(")) {
      pos++;
      const inner = parseExpr();
      if (!inner.ok) return inner;
      if (!isPunct(peek(), ")")) return failAt();
      pos++;
      return inner;
    }
    return failAt();
  };

  const result = parseExpr();
  if (!result.ok) return result;
  if (pos < tokens.length) return failAt();
  return result;
}

function dedupeOperands(operands: Dhis2ParsedOperand[]): Dhis2ParsedOperand[] {
  const seen = new Set<string>();
  return operands.filter((o) => {
    if (seen.has(o.source_id)) return false;
    seen.add(o.source_id);
    return true;
  });
}

function refuse(refusal: Dhis2IndicatorParseRefusal): Dhis2IndicatorParse {
  return { accepted: false, refusal };
}
