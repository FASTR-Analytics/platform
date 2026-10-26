import { type ExpressionNode, HFA_CODE_NAME_PATTERN } from "lib";

// HFA indicator code as the R the M10 script evaluates per facility. `AND OR
// NOT` become `& | !` and `x IN (a, b)` becomes `x %in% c(a, b)`. Parentheses
// are written only where R's precedence would otherwise regroup the code, so
// code an analyst wrote in R's own shape emits unchanged. R differs from the
// language in two places: `!` binds looser than a comparison, as in the
// language, but `%in%` binds tighter than `*` and `/`, so an IN operand that
// is arithmetic is parenthesised.
export function emitHfaCodeAsR(node: ExpressionNode): string {
  return emit(node).text;
}

// R's precedence, loosest first. `%in%` sits between `* /` and unary minus.
const OR = 1;
const AND = 2;
const NOT = 3;
const COMPARE = 4;
const SUM = 5;
const PRODUCT = 6;
const IN = 7;
const NEGATE = 8;
const ATOM = 9;

type Emitted = { text: string; precedence: number };

function operand(node: ExpressionNode, minimum: number): string {
  const { text, precedence } = emit(node);
  return precedence >= minimum ? text : `(${text})`;
}

function emit(node: ExpressionNode): Emitted {
  switch (node.kind) {
    case "number":
      return { text: node.raw, precedence: ATOM };
    case "string":
      return {
        text: `"${node.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
        precedence: ATOM,
      };
    case "identifier":
      if (!HFA_CODE_NAME_PATTERN.test(node.name)) {
        throw new Error(
          `Indicator code names ${
            JSON.stringify(node.name)
          }, which is not an R name`,
        );
      }
      return { text: node.name, precedence: ATOM };
    case "negate":
      return { text: `-${operand(node.operand, NEGATE)}`, precedence: NEGATE };
    case "not":
      return { text: `!${operand(node.operand, NOT)}`, precedence: NOT };
    case "binary": {
      const precedence = node.op === "+" || node.op === "-" ? SUM : PRODUCT;
      return {
        text: `${operand(node.left, precedence)} ${node.op} ${
          operand(node.right, precedence + 1)
        }`,
        precedence,
      };
    }
    case "compare":
      return {
        text: `${operand(node.left, SUM)} ${node.op} ${
          operand(node.right, SUM)
        }`,
        precedence: COMPARE,
      };
    case "and":
      return {
        text: `${operand(node.left, AND)} & ${operand(node.right, NOT)}`,
        precedence: AND,
      };
    case "or":
      return {
        text: `${operand(node.left, OR)} | ${operand(node.right, AND)}`,
        precedence: OR,
      };
    case "in":
      return {
        text: `${operand(node.operand, NEGATE)} %in% c(${
          node.values.map(emitHfaCodeAsR).join(", ")
        })`,
        precedence: IN,
      };
    case "call":
      throw new Error(
        `Indicator code calls ${node.name}(), and HFA code has no functions`,
      );
  }
}
