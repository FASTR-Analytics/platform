// =============================================================================
// The common-indicator catalog a results package carries
// =============================================================================
//
// PURE. Turns the instance's live common-indicator dictionary into the rows a
// run's `indicators.json` input mirror carries — the snapshot every later
// reader (finalize, the manifest transform, the read path) works from, so an
// edit after generation cannot change what a package computes (PLAN_1a §1.10).
//
// This is where "generation decides what the numbers are made of" happens: a
// derived indicator's expression is FLATTENED here, so the row names nothing
// but base commons, and each of those is assigned the ingredient column its
// value will travel in. Everything downstream just sums columns and applies a
// formula.
//
// =============================================================================

import {
  buildExpressionDictionary,
  buildIngredientSlotMap,
  IndicatorExpressionError,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS,
  resolveIndicatorExpression,
  writeIdentifier,
  writeIndicatorExpression,
} from "./indicator_expression/mod.ts";
import type {
  CommonIndicator,
  CommonIndicatorType,
  IndicatorFormat,
  PopulationType,
} from "./types/indicators.ts";

// One row of the v2 `indicators.json` mirror. `expression` is flattened and
// `slot_map` names the ingredient column of each base common it uses; a
// population rate carries neither until its person-years term exists
// (PLAN_1b), only the pieces its final expression is composed from.
export type CommonIndicatorCatalogRow = {
  indicator_common_id: string;
  indicator_common_label: string;
  type: CommonIndicatorType;
  expression: string | null;
  slot_map: Record<string, string> | null;
  population_type: PopulationType | null;
  population_multiplier: number | null;
  format_as: IndicatorFormat;
  threshold_direction: "higher_is_better" | "lower_is_better" | null;
  threshold_green: number | null;
  threshold_yellow: number | null;
  group_label: string;
  sort_order: number;
};

export class CommonIndicatorCatalogError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

// `baseIdsInData` is the set of base commons the extract can actually produce
// counts for (i.e. that have raw mappings). An expression that reaches outside
// it would silently evaluate to NULL everywhere, so it fails the capture
// instead — the same guard the retired numerator/denominator check performed,
// now aware of chains.
export function resolveCommonIndicatorCatalog(
  commons: CommonIndicator[],
  baseIdsInData: Set<string>,
): CommonIndicatorCatalogRow[] {
  const dictionary = buildExpressionDictionary(
    commons.map((c) => ({
      id: c.indicator_common_id,
      type: c.definition.type,
      expression: c.definition.type === "base"
        ? null
        : c.definition.type === "derived"
        ? c.definition.expression
        : c.definition.numeratorExpression,
    })),
  );

  const problems: string[] = [];
  const rows: CommonIndicatorCatalogRow[] = [];

  for (const common of commons) {
    const base: Omit<
      CommonIndicatorCatalogRow,
      "type" | "expression" | "slot_map" | "population_type" | "population_multiplier"
    > = {
      indicator_common_id: common.indicator_common_id,
      indicator_common_label: common.indicator_common_label,
      format_as: common.format_as,
      threshold_direction: common.thresholds?.direction ?? null,
      threshold_green: common.thresholds?.green ?? null,
      threshold_yellow: common.thresholds?.yellow ?? null,
      group_label: common.group_label,
      sort_order: common.sort_order,
    };

    if (common.definition.type === "base") {
      // A base common the extract cannot produce counts for carries no
      // expression and no slot map: it contributes no ingredient row, m012
      // emits nothing for it, and a read yields NULL — the same answer as any
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
        population_type: null,
        population_multiplier: null,
      });
      continue;
    }

    const definition = common.definition;
    const source = definition.type === "population_rate"
      ? definition.numeratorExpression
      : definition.expression;
    const maxIngredients = definition.type === "population_rate"
      ? MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS
      : MAX_INDICATOR_EXPRESSION_INGREDIENTS;

    let ingredientIds: string[];
    let flattened: string;
    try {
      const resolved = resolveIndicatorExpression({
        ownId: common.indicator_common_id,
        source,
        dictionary,
        maxIngredients,
      });
      ingredientIds = resolved.ingredientIds;
      flattened = writeIndicatorExpression(resolved.ast);
    } catch (e) {
      if (!(e instanceof IndicatorExpressionError)) throw e;
      problems.push(e.message);
      continue;
    }

    const missing = ingredientIds.filter((id) => !baseIdsInData.has(id));
    if (missing.length > 0) {
      problems.push(
        `Indicator '${common.indicator_common_id}' is computed from ${
          missing.join(", ")
        }, which ${
          missing.length === 1 ? "is" : "are"
        } not in the data (no raw indicators are mapped to ${
          missing.length === 1 ? "it" : "them"
        })`,
      );
      continue;
    }

    if (definition.type === "population_rate") {
      // Its final expression divides by person-years, which this release does
      // not yet carry into a package (PLAN_1b). The definition travels; the
      // evaluation does not.
      rows.push({
        ...base,
        type: "population_rate",
        expression: null,
        slot_map: null,
        population_type: definition.populationType,
        population_multiplier: definition.multiplier,
      });
      continue;
    }

    rows.push({
      ...base,
      type: "derived",
      expression: flattened,
      slot_map: buildIngredientSlotMap(ingredientIds),
      population_type: null,
      population_multiplier: null,
    });
  }

  if (problems.length > 0) {
    throw new CommonIndicatorCatalogError(problems);
  }
  return rows;
}

// The ingredient table as an R `tribble` literal, substituted into m012's
// script in place of its INDICATOR_INGREDIENTS token (PLAN_1a §1.5). This is
// the WHOLE contract between the resolved catalog and the module that
// materialises ingredient columns — the module sums the columns this names and
// never parses an expression. An indicator the package cannot evaluate (a
// population rate with no person-years term yet, a base common with no data)
// has no slot map and contributes no rows.
//
// Rows are sorted by (indicator, slot) and NEVER left in catalog order: the
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

// An id inside an R double-quoted string. Backslash first, or the escape this
// adds for the quote would itself be escaped.
function rStringLiteral(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
