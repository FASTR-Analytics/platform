// =============================================================================
// Catalog-expression evaluation — the read path's post-aggregation step
// =============================================================================
//
// The engine aggregates a derived indicator's additive ingredients with SUM
// and returns them as ing1..ingN columns. This turns each such row into the
// single `value` the figure layer expects, by applying that indicator's OWN
// expression from the run catalog (PLAN_1a §0: expression-over-sums, never
// sum-of-expressions — which is what makes the result exact at every
// grouping).
//
// It runs over MAIN and ROLL-UP rows alike: a roll-up row is just another
// aggregated row, and re-evaluating the formula on its summed ingredients is
// exactly what makes a national total a real rate rather than an average of
// rates.
//
// Everything here is declared, never inferred: an RO is catalog-evaluated iff
// a metric over it declares `catalogExpressionEvaluation`, and what each
// indicator computes comes from the manifest's own catalog.
//
// =============================================================================

import {
  evaluateIndicatorExpression,
  type CatalogExpressionEvaluation,
  type ExpressionNode,
  type ExpressionValues,
  type IndicatorMetadata,
  type JsonArrayItem,
  parseIndicatorExpression,
  type RunManifest,
} from "lib";

// The declaration for a results object, from the metrics that read it.
//
// AUTHORING INVARIANT (the twin of §1.8's): every metric over a
// catalog-evaluated results object must declare the SAME ingredient props.
// They describe one physical table, so a second metric declaring a different
// set would make the guards and the evaluation disagree about what the columns
// mean. Enforced here by rejecting a mismatch rather than silently taking the
// first.
export function getCatalogEvaluationForResultsObject(
  manifest: RunManifest,
  resultsObjectId: string,
): CatalogExpressionEvaluation | undefined {
  let declared: CatalogExpressionEvaluation | undefined;
  for (const metric of manifest.metrics) {
    if (metric.results_object_id !== resultsObjectId) continue;
    if (metric.catalog_expression_evaluation === null) continue;
    const parsed = JSON.parse(
      metric.catalog_expression_evaluation,
    ) as CatalogExpressionEvaluation;
    if (declared === undefined) {
      declared = parsed;
      continue;
    }
    const same = declared.ingredientProps.length ===
        parsed.ingredientProps.length &&
      declared.ingredientProps.every((p, i) => parsed.ingredientProps[i] === p);
    if (!same) {
      throw new Error(
        `Metrics over results object ${resultsObjectId} declare different catalog ingredient props`,
      );
    }
  }
  return declared;
}

// The output column. Fixed, because the metric's valueProps are ["value"] —
// the ingredients are never a user-facing prop.
export const CATALOG_EXPRESSION_VALUE_PROP = "value";

const INDICATOR_ID_COLUMN = "indicator_common_id";

// Rewrites rows in place of the ingredient columns: one `value`, ingredients
// dropped. A row whose indicator has no catalog expression (a population rate
// whose person-years term this package does not carry) yields a null value —
// the same as any other ingredient that is not there.
export function applyCatalogExpressionsToItems(
  items: JsonArrayItem[],
  catalog: IndicatorMetadata[],
  ingredientProps: string[],
): JsonArrayItem[] {
  const catalogById = new Map(catalog.map((m) => [m.id, m]));
  // One parse per indicator per request, not per row.
  const compiled = new Map<
    string,
    { ast: ExpressionNode; slotMap: Record<string, string> } | null
  >();

  const compile = (indicatorId: string) => {
    const cached = compiled.get(indicatorId);
    if (cached !== undefined) return cached;
    const entry = catalogById.get(indicatorId);
    let result: { ast: ExpressionNode; slotMap: Record<string, string> } | null;
    if (
      entry === undefined || entry.expression === undefined ||
      entry.slot_map === undefined
    ) {
      result = null;
    } else {
      result = {
        ast: parseIndicatorExpression(entry.expression),
        slotMap: entry.slot_map,
      };
    }
    compiled.set(indicatorId, result);
    return result;
  };

  return items.map((item) => {
    const row = item as Record<string, unknown>;
    const indicatorId = row[INDICATOR_ID_COLUMN];
    const rewritten: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!ingredientProps.includes(key)) rewritten[key] = value;
    }
    const program = typeof indicatorId === "string"
      ? compile(indicatorId)
      : null;
    if (program === null) {
      rewritten[CATALOG_EXPRESSION_VALUE_PROP] = null;
      return rewritten as JsonArrayItem;
    }
    const values: ExpressionValues = {};
    for (const [ingredientId, slot] of Object.entries(program.slotMap)) {
      const raw = row[slot];
      values[ingredientId] = typeof raw === "number"
        ? raw
        : raw === null || raw === undefined
        ? null
        : Number(raw);
    }
    rewritten[CATALOG_EXPRESSION_VALUE_PROP] = evaluateIndicatorExpression(
      program.ast,
      values,
    );
    return rewritten as JsonArrayItem;
  });
}
