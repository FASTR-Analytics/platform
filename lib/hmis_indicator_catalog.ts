// =============================================================================
// The indicator catalog a results package carries
// =============================================================================
//
// PURE. Turns the instance's live indicator dictionary into the rows a run's
// `indicators.json` input mirror carries: the snapshot every later reader
// (finalize, the manifest transform, the read path) works from, so an edit
// after generation cannot change what a package computes (PLAN_1a §1.10).
//
// This is where "generation decides what the numbers are made of" happens: a
// derived indicator's expression is FLATTENED here, so the row names nothing
// but leaves, counts (Uploaded, DHIS2 element, Sum) and population types,
// and each of those is assigned the ingredient column its value will travel
// in. Everything downstream just sums columns and applies a formula. A sum
// is a leaf like any count (its members are summed at extract, PLAN_A4
// ruling 4), so the resolver and the catalog never look inside one.
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
import {
  definitionDataId,
  hasRows,
  type HmisIndicator,
  type HmisIndicatorType,
  type IndicatorFormat,
} from "./types/indicators.ts";
import { isPopulationTypeId } from "./types/population.ts";
import { isSpecialIndicatorId } from "./special_indicators.ts";

// One row of the v2 `indicators.json` mirror. `expression` is flattened and
// `slot_map` names the ingredient column of each leaf it uses: a count or a
// population type, in first-appearance order, no slot special. A count's
// expression is its own identifier, one slot; a sum is one slot like any
// other count, so the package format is unchanged by sums. `type` is the
// stored type under its code name (PLAN_A5 ruling 10).
export type HmisIndicatorCatalogRow = {
  indicator_common_id: string;
  indicator_common_label: string;
  type: HmisIndicatorType;
  expression: string | null;
  slot_map: Record<string, string> | null;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
  sort_order: number;
};

export class HmisIndicatorCatalogError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("\n"));
  }
}

type DictionaryInput = Pick<HmisIndicator, "indicator_common_id" | "definition">;

// The dictionary every expression resolves against: every count as a leaf,
// plus one `population` leaf per store type. The editor adds the definition
// being typed before it calls this.
export function buildHmisIndicatorDictionary(
  indicators: DictionaryInput[],
  populationTypeIds: string[],
): ExpressionDictionary {
  return buildExpressionDictionary([
    ...indicators.map((c) => ({
      id: c.indicator_common_id,
      type: c.definition.type === "derived" ? "derived" as const : "leaf" as const,
      expression: c.definition.type === "derived"
        ? c.definition.expression
        : null,
    })),
    ...populationTypeIds.map((id) => ({
      id,
      type: "population" as const,
      expression: null,
    })),
  ]);
}

function resolveOrUndefined(
  ownId: string,
  expression: string,
  dictionary: ExpressionDictionary,
): ResolvedIndicatorExpression | undefined {
  try {
    return resolveIndicatorExpression({
      ownId,
      source: expression,
      dictionary,
      maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
    });
  } catch (e) {
    if (!(e instanceof IndicatorExpressionError)) throw e;
    return undefined;
  }
}

// THE analysed set (PLAN_A4 ruling 3), stated once: a count (Uploaded,
// DHIS2 element or Sum) is in the extract, and therefore in m001, m002 and
// every package, when its checkbox is on, or it is a special, or a derived
// with its checkbox on reaches it through the resolver. Sum membership alone
// puts nothing in the extract: the sum is computed from its members' rows
// whether or not they are analysed themselves. A derived that does not
// resolve reaches nothing here; capture refuses it with the reason.
export function analysedIndicatorIds(
  indicators: HmisIndicator[],
  populationTypeIds: string[],
): Set<string> {
  const dictionary = buildHmisIndicatorDictionary(indicators, populationTypeIds);
  const analysed = new Set<string>();
  for (const c of indicators) {
    if (c.definition.type === "derived") continue;
    if (c.include_in_analysis || isSpecialIndicatorId(c.indicator_common_id)) {
      analysed.add(c.indicator_common_id);
    }
  }
  for (const c of indicators) {
    if (c.definition.type !== "derived" || !c.include_in_analysis) continue;
    const resolved = resolveOrUndefined(
      c.indicator_common_id,
      c.definition.expression,
      dictionary,
    );
    for (const id of resolved?.ingredientIds ?? []) {
      if (!isPopulationTypeId(id)) analysed.add(id);
    }
  }
  return analysed;
}

// The analysed counts the extract can produce values for: an Uploaded or
// DHIS2 element whose data id has rows, a sum with rows under any member's
// data id. `dataIdsWithRows` is the set of data ids that have dataset_hmis
// rows (PLAN_A5 ruling 10).
export function analysedIdsWithData(
  indicators: HmisIndicator[],
  analysed: Set<string>,
  dataIdsWithRows: Set<string>,
): Set<string> {
  const dataIdOf = new Map(
    indicators.map((c) => [c.indicator_common_id, definitionDataId(c.definition)]),
  );
  const dataIdHasRows = (id: string) => {
    const dataId = dataIdOf.get(id);
    return dataId !== null && dataId !== undefined && dataIdsWithRows.has(dataId);
  };
  const withData = new Set<string>();
  for (const c of indicators) {
    if (!analysed.has(c.indicator_common_id)) continue;
    if (hasRows(c.definition.type) && dataIdHasRows(c.indicator_common_id)) {
      withData.add(c.indicator_common_id);
    }
    if (c.definition.type === "sum" && c.definition.members.some(dataIdHasRows)) {
      withData.add(c.indicator_common_id);
    }
  }
  return withData;
}

// THE computability rule for a derived indicator, stated once: its
// expression must resolve, and every flattened ingredient that is not a
// population term must be an analysed count with data. Capture refuses
// the run on any other answer; the indicator manager and editor show the
// same answer. Whether the population store covers a population type is the
// person-years expansion's check at prepare time (PLAN_1b ruling 6), not
// this one.
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
  idsWithData: Set<string>,
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
    !isPopulationTypeId(id) && !idsWithData.has(id)
  );
  return missing.length > 0
    ? { kind: "unmapped_ingredients", resolved, missing }
    : { kind: "computable", resolved };
}

// The rule over a whole dictionary as the client holds it: one judgement per
// derived indicator. `idsWithData` is the caller's knowledge of which
// counts have rows (`analysedIdsWithData` over the ledger, for the
// manager); the dictionary alone cannot say.
export function judgeDerivedIndicators(
  indicators: HmisIndicator[],
  populationTypeIds: string[],
  idsWithData: Set<string>,
): Map<string, DerivedIndicatorComputability> {
  const dictionary = buildHmisIndicatorDictionary(indicators, populationTypeIds);
  const judgements = new Map<string, DerivedIndicatorComputability>();
  for (const c of indicators) {
    if (c.definition.type !== "derived") continue;
    judgements.set(
      c.indicator_common_id,
      judgeDerivedIndicator(
        c.indicator_common_id,
        c.definition.expression,
        dictionary,
        idsWithData,
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
  } not in the data (${missing.length === 1 ? "it has" : "they have"} no rows)`;
}

// The catalog is the analysed set (ruling 3): every analysed count under
// its own type, and every derived with its checkbox on. `idsWithData` is
// the subset of those that the extract can actually produce values for. An
// expression that reaches outside it would silently evaluate to NULL
// everywhere, so it fails the capture instead. A derived with its checkbox
// off is in no package; a chain through it still resolves, since the
// dictionary is the whole list. `populationTypeIds` is the store's
// vocabulary: a population identifier resolves iff it names one.
export function resolveHmisIndicatorCatalog(
  indicators: HmisIndicator[],
  idsWithData: Set<string>,
  populationTypeIds: string[],
): HmisIndicatorCatalogRow[] {
  const dictionary = buildHmisIndicatorDictionary(indicators, populationTypeIds);
  const analysed = analysedIndicatorIds(indicators, populationTypeIds);

  const problems: string[] = [];
  const rows: HmisIndicatorCatalogRow[] = [];

  for (const indicator of indicators) {
    const shared: Omit<
      HmisIndicatorCatalogRow,
      "type" | "expression" | "slot_map"
    > = {
      indicator_common_id: indicator.indicator_common_id,
      indicator_common_label: indicator.indicator_common_label,
      format_as: indicator.format_as,
      thresholds: indicator.thresholds,
      sort_order: indicator.sort_order,
    };

    if (indicator.definition.type !== "derived") {
      if (!analysed.has(indicator.indicator_common_id)) continue;
      // An analysed count the extract cannot produce values for carries no
      // expression and no slot map: it contributes no ingredient row, m012
      // emits nothing for it, and a read yields NULL: the same answer as any
      // other missing ingredient (PLAN_1a §1.5). This is the ordinary case,
      // not a failure: a new database is seeded with every special indicator
      // as an Uploaded indicator with no data id whether or not the country
      // fills it, so treating an empty count as an error would block
      // generation fleet-wide.
      const hasData = idsWithData.has(indicator.indicator_common_id);
      rows.push({
        ...shared,
        type: indicator.definition.type,
        expression: hasData
          ? writeIdentifier(indicator.indicator_common_id)
          : null,
        slot_map: hasData
          ? buildIngredientSlotMap([indicator.indicator_common_id])
          : null,
      });
      continue;
    }

    if (!indicator.include_in_analysis) continue;
    const judgement = judgeDerivedIndicator(
      indicator.indicator_common_id,
      indicator.definition.expression,
      dictionary,
      idsWithData,
    );
    if (judgement.kind !== "computable") {
      problems.push(
        describeComputabilityProblem(indicator.indicator_common_id, judgement),
      );
      continue;
    }

    rows.push({
      ...shared,
      type: "derived",
      expression: writeIndicatorExpression(judgement.resolved.ast),
      slot_map: buildIngredientSlotMap(judgement.resolved.ingredientIds),
    });
  }

  if (problems.length > 0) {
    throw new HmisIndicatorCatalogError(problems);
  }
  return rows;
}

// The two literals below are the WHOLE contract between the resolved catalog
// and m012, substituted into its script in place of the INDICATOR_INGREDIENTS
// and INDICATOR_EXPRESSIONS tokens:
//
//   - the ingredient table says which count (or population type's
//     person-years row) fills which slot column of which indicator; the
//     module sums those columns to area x month;
//   - the expression table says how each indicator's slots combine, as the
//     flattened expression rewritten over `ing1..ing8`; the module evaluates
//     it per row and KEEPS ONLY THE ROWS THAT PRODUCE A NUMBER (the rule and
//     the R semantics are stated once, in m012's script.R).
//
// A count with no data has no slot map and no expression: it is in neither
// table and the package carries no row for it. Both tables are sorted by
// indicator id and NEVER left in catalog order: the literal lands in
// `scriptText`, which `computeModuleKey` hashes, so catalog order would put
// the dictionary's display sort into the memoization key and re-run the
// module on a pure reorder.
//
// SINGLE LINE, always. Substitution is a plain `replaceAll` over the whole
// script, so it also rewrites the token where a comment mentions it; a
// multi-line value would put its second line onward outside that comment and
// break the parse. Every other substitution in `getScriptWithParameters`
// (COUNTRY_ISO3, every parameter, every data-source path) is single-line for
// the same reason.
export function buildIndicatorIngredientsRLiteral(
  catalog: HmisIndicatorCatalogRow[],
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
  // columns, so an instance with nothing filled needs no special case.
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
  catalog: HmisIndicatorCatalogRow[],
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

// =============================================================================
// Import selection expansion (PLAN_A4 ruling 5)
// =============================================================================

// A DHIS2 import selects INDICATORS; what it fetches is expanded here, once,
// where the selection is validated (launch, enqueue and the scheduler's fire
// path), and the result is persisted on the run row. A sum expands to its
// members; a derived flattens through the resolver to the counts it
// reaches, and a reached sum to its members. The DHIS2 elements among them
// contribute their data ids, in first-appearance order; population terms
// and Uploaded indicators are dropped and listed for the run detail
// (PLAN_A5 ruling 3). `unknownIndicatorIds` and `unresolvable` are refusals
// the caller reports.
export type IndicatorSelectionExpansion = {
  dataIds: string[];
  populationTermsDropped: string[];
  uploadedIndicatorsDropped: string[];
  unknownIndicatorIds: string[];
  unresolvable: { id: string; problem: string }[];
};

export function expandIndicatorSelection(
  indicatorIds: string[],
  indicators: DictionaryInput[],
  populationTypeIds: string[],
): IndicatorSelectionExpansion {
  const byId = new Map(indicators.map((i) => [i.indicator_common_id, i]));
  const dictionary = buildHmisIndicatorDictionary(
    indicators,
    populationTypeIds,
  );
  const leafIds: string[] = [];
  const populationTermsDropped: string[] = [];
  const unknownIndicatorIds: string[] = [];
  const unresolvable: { id: string; problem: string }[] = [];
  const pushUnique = (list: string[], id: string) => {
    if (!list.includes(id)) list.push(id);
  };
  for (const id of indicatorIds) {
    const indicator = byId.get(id);
    if (indicator === undefined) {
      pushUnique(unknownIndicatorIds, id);
      continue;
    }
    if (indicator.definition.type !== "derived") {
      pushUnique(leafIds, id);
      continue;
    }
    let resolved: ResolvedIndicatorExpression;
    try {
      resolved = resolveIndicatorExpression({
        ownId: id,
        source: indicator.definition.expression,
        dictionary,
        maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
    } catch (e) {
      if (!(e instanceof IndicatorExpressionError)) throw e;
      unresolvable.push({ id, problem: e.message });
      continue;
    }
    for (const ingredientId of resolved.ingredientIds) {
      if (isPopulationTypeId(ingredientId)) {
        pushUnique(populationTermsDropped, ingredientId);
      } else {
        pushUnique(leafIds, ingredientId);
      }
    }
  }
  const rowIds: string[] = [];
  for (const leafId of leafIds) {
    const leaf = byId.get(leafId);
    if (leaf?.definition.type === "sum") {
      for (const member of leaf.definition.members) pushUnique(rowIds, member);
    } else {
      pushUnique(rowIds, leafId);
    }
  }
  const dataIds: string[] = [];
  const uploadedIndicatorsDropped: string[] = [];
  for (const rowId of rowIds) {
    const definition = byId.get(rowId)?.definition;
    if (definition?.type === "uploaded") {
      pushUnique(uploadedIndicatorsDropped, rowId);
    } else if (definition?.type === "dhis2_element") {
      pushUnique(dataIds, definition.data_id);
    }
  }
  return {
    dataIds,
    populationTermsDropped,
    uploadedIndicatorsDropped,
    unknownIndicatorIds,
    unresolvable,
  };
}
