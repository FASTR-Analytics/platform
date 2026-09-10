// =============================================================================
// The common-indicator catalog a results package carries
// =============================================================================
//
// PURE. Turns the instance's live common-indicator dictionary into the rows a
// run's `indicators.json` input mirror carries: the snapshot every later
// reader (finalize, the manifest transform, the read path) works from, so an
// edit after generation cannot change what a package computes (PLAN_1a §1.10).
//
// This is where "generation decides what the numbers are made of" happens: a
// derived indicator's expression is FLATTENED here, so the row names nothing
// but leaves, base commons and population types, and each of those
// is assigned the ingredient column its value will travel in. Everything
// downstream just sums columns and applies a formula.
//
// =============================================================================

import {
  buildExpressionDictionary,
  buildIngredientSlotMap,
  type ExpressionDictionary,
  IndicatorExpressionError,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  parseIndicatorExpression,
  renameIdentifiers,
  type ResolvedIndicatorExpression,
  resolveIndicatorExpression,
  writeIdentifier,
  writeIndicatorExpression,
} from "./indicator_expression/mod.ts";
import type { ThresholdsRule } from "./types/conditional_formatting.ts";
import type {
  CommonIndicator,
  CommonIndicatorType,
  CommonIndicatorWithMappings,
  IndicatorFormat,
} from "./types/indicators.ts";
import { isPopulationTypeId } from "./types/population.ts";

// One row of the v2 `indicators.json` mirror. `expression` is flattened and
// `slot_map` names the ingredient column of each leaf it uses: a base common
// or a population type, in first-appearance order, no slot special.
export type CommonIndicatorCatalogRow = {
  indicator_common_id: string;
  indicator_common_label: string;
  type: CommonIndicatorType;
  expression: string | null;
  slot_map: Record<string, string> | null;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
  sort_order: number;
};

export class CommonIndicatorCatalogError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

// The dictionary every expression resolves against: the commons plus one
// `population` leaf per store type. The editor adds the definition being
// typed before it calls this.
export function buildCommonIndicatorDictionary(
  commons: Pick<CommonIndicator, "indicator_common_id" | "definition">[],
  populationTypeIds: string[],
): ExpressionDictionary {
  return buildExpressionDictionary([
    ...commons.map((c) => ({
      id: c.indicator_common_id,
      type: c.definition.type,
      expression: c.definition.type === "base"
        ? null
        : c.definition.expression,
    })),
    ...populationTypeIds.map((id) => ({
      id,
      type: "population" as const,
      expression: null,
    })),
  ]);
}

// The base commons the extract can produce counts for, read off the
// mappings the client already holds. Capture reads the same set from SQL.
export function baseIdsWithMappings(
  commons: CommonIndicatorWithMappings[],
): Set<string> {
  return new Set(
    commons
      .filter((c) =>
        c.definition.type === "base" && c.raw_indicator_ids.length > 0
      )
      .map((c) => c.indicator_common_id),
  );
}

// THE computability rule for a derived common, stated once: its expression
// must resolve, and every flattened ingredient that is not a population term
// must be a base common with data. Capture refuses the run on any other
// answer; the indicator manager and editor show the same answer. Whether the
// population store covers a population type is the person-years
// expansion's check at prepare time (PLAN_1b ruling 6), not this one.
export type DerivedIndicatorComputability =
  | { kind: "computable"; resolved: ResolvedIndicatorExpression }
  | {
    kind: "unmapped_ingredients";
    resolved: ResolvedIndicatorExpression;
    missing: string[];
  }
  | { kind: "unresolvable"; problem: string };

export function judgeDerivedIndicator(
  ownId: string,
  expression: string,
  dictionary: ExpressionDictionary,
  baseIdsInData: Set<string>,
): DerivedIndicatorComputability {
  let resolved: ResolvedIndicatorExpression;
  try {
    resolved = resolveIndicatorExpression({
      ownId,
      source: expression,
      dictionary,
      maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
    });
  } catch (e) {
    if (!(e instanceof IndicatorExpressionError)) throw e;
    return { kind: "unresolvable", problem: e.message };
  }
  const missing = resolved.ingredientIds.filter((id) =>
    !isPopulationTypeId(id) && !baseIdsInData.has(id)
  );
  return missing.length > 0
    ? { kind: "unmapped_ingredients", resolved, missing }
    : { kind: "computable", resolved };
}

// The rule over a whole dictionary as the client holds it: one judgement per
// derived common. Base commons are never judged (an unmapped one is the
// ordinary case, see the catalog below).
export function judgeDerivedIndicators(
  commons: CommonIndicatorWithMappings[],
  populationTypeIds: string[],
): Map<string, DerivedIndicatorComputability> {
  const dictionary = buildCommonIndicatorDictionary(commons, populationTypeIds);
  const baseIdsInData = baseIdsWithMappings(commons);
  const judgements = new Map<string, DerivedIndicatorComputability>();
  for (const c of commons) {
    if (c.definition.type === "base") continue;
    judgements.set(
      c.indicator_common_id,
      judgeDerivedIndicator(
        c.indicator_common_id,
        c.definition.expression,
        dictionary,
        baseIdsInData,
      ),
    );
  }
  return judgements;
}

function describeComputabilityProblem(
  ownId: string,
  judgement: Exclude<DerivedIndicatorComputability, { kind: "computable" }>,
): string {
  if (judgement.kind === "unresolvable") return judgement.problem;
  const { missing } = judgement;
  return `Indicator '${ownId}' is computed from ${missing.join(", ")}, which ${
    missing.length === 1 ? "is" : "are"
  } not in the data (no raw indicators are mapped to ${
    missing.length === 1 ? "it" : "them"
  })`;
}

// `baseIdsInData` is the set of base commons the extract can actually produce
// counts for (i.e. that have raw mappings). An expression that reaches outside
// it would silently evaluate to NULL everywhere, so it fails the capture
// instead: the same guard the retired numerator/denominator check performed,
// now aware of chains. `populationTypeIds` is the store's vocabulary: a
// population identifier resolves iff it names one.
export function resolveCommonIndicatorCatalog(
  commons: CommonIndicator[],
  baseIdsInData: Set<string>,
  populationTypeIds: string[],
): CommonIndicatorCatalogRow[] {
  const dictionary = buildCommonIndicatorDictionary(commons, populationTypeIds);

  const problems: string[] = [];
  const rows: CommonIndicatorCatalogRow[] = [];

  for (const common of commons) {
    const base: Omit<
      CommonIndicatorCatalogRow,
      "type" | "expression" | "slot_map"
    > = {
      indicator_common_id: common.indicator_common_id,
      indicator_common_label: common.indicator_common_label,
      format_as: common.format_as,
      thresholds: common.thresholds,
      sort_order: common.sort_order,
    };

    if (common.definition.type === "base") {
      // A base common the extract cannot produce counts for carries no
      // expression and no slot map: it contributes no ingredient row, m012
      // emits nothing for it, and a read yields NULL: the same answer as any
      // other missing ingredient (PLAN_1a §1.5). This is the ordinary case,
      // not a failure: db_startup seeds all 14 `_COMMON_INDICATORS` on every
      // instance whether or not the country maps them, so treating an
      // unmapped base common as an error would block generation fleet-wide.
      const hasData = baseIdsInData.has(common.indicator_common_id);
      rows.push({
        ...base,
        type: "base",
        expression: hasData
          ? writeIdentifier(common.indicator_common_id)
          : null,
        slot_map: hasData
          ? buildIngredientSlotMap([common.indicator_common_id])
          : null,
      });
      continue;
    }

    const judgement = judgeDerivedIndicator(
      common.indicator_common_id,
      common.definition.expression,
      dictionary,
      baseIdsInData,
    );
    if (judgement.kind !== "computable") {
      problems.push(
        describeComputabilityProblem(common.indicator_common_id, judgement),
      );
      continue;
    }

    rows.push({
      ...base,
      type: "derived",
      expression: writeIndicatorExpression(judgement.resolved.ast),
      slot_map: buildIngredientSlotMap(judgement.resolved.ingredientIds),
    });
  }

  if (problems.length > 0) {
    throw new CommonIndicatorCatalogError(problems);
  }
  return rows;
}

// The two literals below are the WHOLE contract between the resolved catalog
// and m012, substituted into its script in place of the INDICATOR_INGREDIENTS
// and INDICATOR_EXPRESSIONS tokens:
//
//   - the ingredient table says which base common (or population type's
//     person-years row) fills which slot column of which indicator; the
//     module sums those columns to area x month;
//   - the expression table says how each indicator's slots combine, as the
//     flattened expression rewritten over `ing1..ing8`; the module evaluates
//     it per row and KEEPS ONLY THE ROWS THAT PRODUCE A NUMBER (the rule and
//     the R semantics are stated once, in m012's script.R).
//
// A base common with no data has no slot map and no expression: it is in
// neither table and the package carries no row for it. Both tables are sorted
// by indicator id and NEVER left in catalog order: the
// literal lands in `scriptText`, which `computeModuleKey` hashes, so catalog
// order would put the dictionary's display sort into the memoization key and
// re-run the module on a pure reorder.
//
// SINGLE LINE, always. Substitution is a plain `replaceAll` over the whole
// script, so it also rewrites the token where a comment mentions it; a
// multi-line value would put its second line onward outside that comment and
// break the parse. Every other substitution in `getScriptWithParameters`
// (COUNTRY_ISO3, every parameter, every data-source path) is single-line for
// the same reason.
export function buildIndicatorIngredientsRLiteral(
  catalog: CommonIndicatorCatalogRow[],
): string {
  const rows: { indicatorId: string; slot: string; ingredientId: string }[] =
    [];
  for (const row of catalog) {
    if (row.slot_map === null) continue;
    for (const [ingredientId, slot] of Object.entries(row.slot_map)) {
      rows.push({ indicatorId: row.indicator_common_id, slot, ingredientId });
    }
  }
  rows.sort((a, b) =>
    a.indicatorId.localeCompare(b.indicatorId) || a.slot.localeCompare(b.slot)
  );
  // A header-only tribble is a valid empty 0-row tibble with the right
  // columns, so an instance with nothing mapped needs no special case.
  const cells = ["~indicator_common_id", "~slot", "~ingredient_common_id"];
  for (const r of rows) {
    cells.push(
      rStringLiteral(r.indicatorId),
      rStringLiteral(r.slot),
      rStringLiteral(r.ingredientId),
    );
  }
  return `tribble(${cells.join(", ")})`;
}

// The expression language's surface syntax over bare slot names is valid R
// source: decimals, `+ - * /`, unary minus, parentheses, and calls to `abs`,
// `coalesce`, `nullif`. The canonical writer emits it fully parenthesised, so
// R's precedence never re-associates anything, and m012 binds those three
// functions and `/` to the evaluator's semantics before it evaluates.
export function buildIndicatorExpressionsRLiteral(
  catalog: CommonIndicatorCatalogRow[],
): string {
  const rows: { indicatorId: string; expression: string }[] = [];
  for (const row of catalog) {
    if (row.expression === null || row.slot_map === null) continue;
    rows.push({
      indicatorId: row.indicator_common_id,
      expression: writeIndicatorExpression(
        renameIdentifiers(parseIndicatorExpression(row.expression), row.slot_map),
      ),
    });
  }
  rows.sort((a, b) => a.indicatorId.localeCompare(b.indicatorId));
  const cells = ["~indicator_common_id", "~expression"];
  for (const r of rows) {
    cells.push(rStringLiteral(r.indicatorId), rStringLiteral(r.expression));
  }
  return `tribble(${cells.join(", ")})`;
}

// An id inside an R double-quoted string. Backslash first, or the escape this
// adds for the quote would itself be escaped.
function rStringLiteral(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
