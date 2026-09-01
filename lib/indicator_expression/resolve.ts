// =============================================================================
// Indicator expression resolution — type rules, cycles, flattening, the cap
// =============================================================================
//
// One entry point, used by BOTH the authoring validator (the indicator editor,
// via the instance routes) and run capture. Same rules in both places: the
// editor states them where the user is, capture enforces them where the data
// is (PLAN_1a §1.2).
//
// Flattening is substitution: a `derived` ingredient is replaced by its own
// expression, recursively, until the expression names nothing but `base`
// commons. Those base commons ARE the ingredients that travel as ing1..ingN
// on a results row, which is why the cap is measured AFTER flattening.
//
// =============================================================================

import {
  collectIdentifiers,
  type ExpressionNode,
  parseIndicatorExpression,
} from "./parse.ts";

// The results object carries eight ingredient slots (PLAN_1a §1.5).
export const MAX_INDICATOR_EXPRESSION_INGREDIENTS = 8;

// A population rate's person-years term takes the eighth slot, so its
// numerator expression may flatten to at most seven.
export const MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS =
  MAX_INDICATOR_EXPRESSION_INGREDIENTS - 1;

// Substitution depth: how many `derived`-on-`derived` links a chain may have.
export const MAX_INDICATOR_EXPRESSION_DEPTH = 8;

// Flattened SIZE: substitution is multiplicative (each derived link expands at
// every occurrence), and neither the depth cap nor the ingredient cap bounds
// the tree — the ingredient count is deduplicated, so a chain of wide
// expressions can flatten to megabytes carrying ONE ingredient. The flattened
// text is stored in the manifest and re-parsed on every request, so it must be
// bounded here, where the tree is built. 1000 is generous: the grammar's own
// limits put a legitimate expression orders of magnitude below it.
export const MAX_INDICATOR_EXPRESSION_NODES = 1000;

export type ExpressionDictionaryEntry = {
  id: string;
  type: "base" | "derived" | "population_rate";
  // `derived`: the expression. `population_rate`: its numerator expression.
  // `base`: null.
  expression: string | null;
};

export type ExpressionDictionary = Map<string, ExpressionDictionaryEntry>;

export class IndicatorExpressionError extends Error {}

export type ResolvedIndicatorExpression = {
  // The flattened AST — every identifier is a `base` common indicator id.
  ast: ExpressionNode;
  // Those base ids, in first-appearance order. This IS the slot order.
  ingredientIds: string[];
};

export function buildExpressionDictionary(
  entries: ExpressionDictionaryEntry[],
): ExpressionDictionary {
  return new Map(entries.map((e) => [e.id, e]));
}

// Flatten `source` against `dictionary`, enforcing every rule. `ownId` is the
// indicator being defined — naming itself is the shortest cycle, and it is
// reported as one.
export function resolveIndicatorExpression(args: {
  ownId: string;
  source: string;
  dictionary: ExpressionDictionary;
  maxIngredients: number;
}): ResolvedIndicatorExpression {
  const { ownId, source, dictionary, maxIngredients } = args;

  let nodeCount = 0;
  const substitute = (
    node: ExpressionNode,
    chain: string[],
  ): ExpressionNode => {
    nodeCount++;
    if (nodeCount > MAX_INDICATOR_EXPRESSION_NODES) {
      throw new IndicatorExpressionError(
        `The definition of ${
          JSON.stringify(ownId)
        } flattens to more than ${MAX_INDICATOR_EXPRESSION_NODES} terms — simplify the expressions it is built from`,
      );
    }
    switch (node.kind) {
      case "number":
        return node;
      case "identifier": {
        const entry = dictionary.get(node.name);
        if (entry === undefined) {
          throw new IndicatorExpressionError(
            `${describeChain(chain)} names ${
              JSON.stringify(node.name)
            }, which is not a common indicator`,
          );
        }
        if (entry.type === "population_rate") {
          throw new IndicatorExpressionError(
            `${describeChain(chain)} names ${
              JSON.stringify(node.name)
            }, which is a population rate — an expression may only use base or derived indicators`,
          );
        }
        if (entry.type === "base") {
          return node;
        }
        if (chain.includes(node.name)) {
          throw new IndicatorExpressionError(
            `Circular definition: ${[...chain, node.name].join(" → ")}`,
          );
        }
        if (chain.length >= MAX_INDICATOR_EXPRESSION_DEPTH) {
          throw new IndicatorExpressionError(
            `Definition chain is deeper than ${MAX_INDICATOR_EXPRESSION_DEPTH} levels: ${
              [...chain, node.name].join(" → ")
            }`,
          );
        }
        if (entry.expression === null) {
          throw new IndicatorExpressionError(
            `${JSON.stringify(node.name)} is derived but has no expression`,
          );
        }
        return substitute(
          parseExpressionOf(node.name, entry.expression),
          [...chain, node.name],
        );
      }
      case "negate":
        return { kind: "negate", operand: substitute(node.operand, chain) };
      case "binary":
        return {
          kind: "binary",
          op: node.op,
          left: substitute(node.left, chain),
          right: substitute(node.right, chain),
        };
      case "call":
        return {
          kind: "call",
          name: node.name,
          args: node.args.map((arg) => substitute(arg, chain)),
        };
    }
  };

  const ast = substitute(parseExpressionOf(ownId, source), [ownId]);
  const ingredientIds = collectIdentifiers(ast);
  if (ingredientIds.length === 0) {
    throw new IndicatorExpressionError(
      "An expression must use at least one common indicator",
    );
  }
  if (ingredientIds.length > maxIngredients) {
    throw new IndicatorExpressionError(
      `This definition needs ${ingredientIds.length} source indicators, more than the ${maxIngredients} a results row can carry: ${
        ingredientIds.join(", ")
      }`,
    );
  }
  return { ast, ingredientIds };
}

function parseExpressionOf(id: string, source: string): ExpressionNode {
  try {
    return parseIndicatorExpression(source);
  } catch (e) {
    throw new IndicatorExpressionError(
      `${JSON.stringify(id)}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function describeChain(chain: string[]): string {
  return chain.length === 1
    ? `The definition of ${JSON.stringify(chain[0])}`
    : `The definition of ${JSON.stringify(chain.at(-1)!)} (via ${
      chain.join(" → ")
    })`;
}

// Ingredient id → results-row column, in resolution order (PLAN_1a §1.5).
export function buildIngredientSlotMap(
  ingredientIds: string[],
): Record<string, string> {
  return Object.fromEntries(
    ingredientIds.map((id, i) => [id, ingredientSlotName(i)]),
  );
}

export function ingredientSlotName(index: number): string {
  return `ing${index + 1}`;
}

export const INDICATOR_INGREDIENT_SLOT_NAMES: string[] = Array.from(
  { length: MAX_INDICATOR_EXPRESSION_INGREDIENTS },
  (_, i) => ingredientSlotName(i),
);
