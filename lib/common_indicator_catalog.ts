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
// but leaves — base commons and `population:<type>` terms — and each of those
// is assigned the ingredient column its value will travel in. Everything
// downstream just sums columns and applies a formula.
//
// =============================================================================

import {
  buildExpressionDictionary,
  buildIngredientSlotMap,
  IndicatorExpressionError,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  resolveIndicatorExpression,
  writeIdentifier,
  writeIndicatorExpression,
} from "./indicator_expression/mod.ts";
import type { ThresholdsRule } from "./types/conditional_formatting.ts";
import type {
  CommonIndicator,
  CommonIndicatorType,
  IndicatorFormat,
} from "./types/indicators.ts";
import {
  parsePopulationIngredientId,
  populationIngredientId,
} from "./types/population.ts";

// One row of the v2 `indicators.json` mirror. `expression` is flattened and
// `slot_map` names the ingredient column of each leaf it uses — a base common
// or a `population:<type>` term, in first-appearance order, no slot special.
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

// `baseIdsInData` is the set of base commons the extract can actually produce
// counts for (i.e. that have raw mappings). An expression that reaches outside
// it would silently evaluate to NULL everywhere, so it fails the capture
// instead — the same guard the retired numerator/denominator check performed,
// now aware of chains. `populationTypeIds` is the store's vocabulary: a
// `population:<type>` term resolves iff it names one. Whether the store
// COVERS the data for that type is the person-years expansion's check at
// prepare time (PLAN_1b ruling 6), not this one.
export function resolveCommonIndicatorCatalog(
  commons: CommonIndicator[],
  baseIdsInData: Set<string>,
  populationTypeIds: string[],
): CommonIndicatorCatalogRow[] {
  const dictionary = buildExpressionDictionary([
    ...commons.map((c) => ({
      id: c.indicator_common_id,
      type: c.definition.type,
      expression: c.definition.type === "base"
        ? null
        : c.definition.expression,
    })),
    ...populationTypeIds.map((id) => ({
      id: populationIngredientId(id),
      type: "population" as const,
      expression: null,
    })),
  ]);

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
      });
      continue;
    }

    let ingredientIds: string[];
    let flattened: string;
    try {
      const resolved = resolveIndicatorExpression({
        ownId: common.indicator_common_id,
        source: common.definition.expression,
        dictionary,
        maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
      ingredientIds = resolved.ingredientIds;
      flattened = writeIndicatorExpression(resolved.ast);
    } catch (e) {
      if (!(e instanceof IndicatorExpressionError)) throw e;
      problems.push(e.message);
      continue;
    }

    const missing = ingredientIds.filter((id) =>
      parsePopulationIngredientId(id) === null && !baseIdsInData.has(id)
    );
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

    rows.push({
      ...base,
      type: "derived",
      expression: flattened,
      slot_map: buildIngredientSlotMap(ingredientIds),
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
// never parses an expression. An indicator the package cannot evaluate (a base
// common with no data) has no slot map and contributes no rows. A slot row
// naming a `population:<type>` pseudo-ingredient is read by the module from
// the run's person-years file under that same id.
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
