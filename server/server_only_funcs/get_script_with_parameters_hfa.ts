import type {
  HfaIndicator,
  HfaIndicatorCode,
  HfaIndicatorVariantCode,
  ModuleConfigSelections,
  ModuleDefinitionInstalled,
} from "lib";
import {
  composeHfaVariantColumnName,
  isReservedHfaId,
  normalizeRLogicalOperators,
  serialiseMultiMembershipValues,
} from "lib";
import { dirname, join } from "@std/path/posix";
import {
  extractDependenciesFromCode,
  buildUnionDependencyGraph,
  topologicalSort,
  formatCycles,
} from "./hfa_dependency_analyzer.ts";

// The run's person-years file (PLAN_1b) sits beside the datasets dir, at
// inputs/population.csv — one file, written by prepare_inputs on every HMIS
// capture. Quoted like a dataset path; shared by both generators.
export function populationFilePathLiteral(datasetsDirPath: string): string {
  return `'${join(dirname(datasetsDirPath), "population.csv")}'`;
}

// Per-variable sentinel classification captured at import time
// (PLAN_HFA_FEATURES.md), propagated to the project snapshot and
// consumed here. A variable absent from the map falls back to the hardcoded
// Sierra-Leone set, so un-reclassified snapshots keep working.
export type HfaSentinelRow = {
  variableId: string;
  value: string;
  sentinelClass: string;
  isNumeric: boolean;
};

type VarSentinels = {
  // Select-list don't-know: missing unless DK-as-No (binary); "dont_know" status.
  dontKnowSelect: string[];
  // Numeric don't-know (-999999): missing regardless of policy; "dont_know" status.
  dontKnowNumeric: string[];
  // Refusal: always missing; "missing" status (a distinct % refused is layer 4).
  refused: string[];
};

function buildSentinelMap(rows: HfaSentinelRow[]): Map<string, VarSentinels> {
  const map = new Map<string, VarSentinels>();
  for (const r of rows) {
    let entry = map.get(r.variableId);
    if (!entry) {
      entry = { dontKnowSelect: [], dontKnowNumeric: [], refused: [] };
      map.set(r.variableId, entry);
    }
    if (r.sentinelClass === "refused") {
      entry.refused.push(r.value);
    } else if (r.sentinelClass === "dont_know") {
      const bucket = r.isNumeric ? entry.dontKnowNumeric : entry.dontKnowSelect;
      bucket.push(r.value);
    }
    // other / not_applicable / question_specific are substantive (principle 5).
  }
  return map;
}

// R membership fragment for a set of codes: "== -999999" / "%in% c(-99, ...)".
// Empty set → undefined so the caller drops the term entirely.
function rMembership(codes: string[]): string | undefined {
  if (codes.length === 0) return undefined;
  if (codes.length === 1) return `== ${codes[0]}`;
  return `%in% c(${codes.join(", ")})`;
}

// `NA %in% c(1, 2)` is FALSE, not NA, so an authored `x %in% c(...)` would read
// a missing answer as a determinate "no" once the indicator is gated on its
// result. Bound scoped to the indicator expression, so base `%in%` is untouched
// everywhere else — including the `replace()` calls in the bindings themselves,
// whose arguments evaluate in the calling environment.
const SAFE_IN_BINDING =
  "    `%in%` = function(x, table) ifelse(is.na(x), NA, base::`%in%`(x, table))";

// Sentinel codes (-99 / -999999 / refusal codes) are ordinary numbers in the
// data, so the authored expression reads them as determinate answers. Bind
// NA-ified copies of the referenced variables scoped to that expression rather
// than mutating the columns: the response-status expression downstream still
// needs the raw values, and the sentinel set varies per indicator.
//
// -999999 (numeric don't-know) is always missing; select don't-know (-99) is
// missing unless the DONT_KNOW_TREATMENT parameter says to treat it as "No"
// for binary indicators, in which case it stays in the data and fails the
// indicator's positive test item-by-item (see PLAN_HFA_FEATURES.md).
function buildSentinelBindings(
  variableIds: string[],
  includeDontKnow: boolean,
  sentinelMap: Map<string, VarSentinels>,
): string[] {
  const bindings: string[] = [];
  for (const variableId of variableIds) {
    const entry = sentinelMap.get(variableId);
    let codes: string[];
    if (entry) {
      codes = [
        ...entry.dontKnowNumeric,
        ...entry.refused,
        ...(includeDontKnow ? entry.dontKnowSelect : []),
      ];
    } else {
      codes = includeDontKnow ? ["-99", "-999999"] : ["-999999"];
    }
    if (codes.length === 0) {
      continue;
    }
    bindings.push(
      `    ${variableId} = replace(${variableId}, ${variableId} %in% c(${codes.join(", ")}), NA_real_)`,
    );
  }
  return bindings;
}

// Response-status per-variable checks (policy-independent classification).
// Fall back to the hardcoded set when a variable is unclassified.
function statusDontKnowCheck(
  variableId: string,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const entry = sentinelMap.get(variableId);
  const codes = entry
    ? [...entry.dontKnowSelect, ...entry.dontKnowNumeric]
    : ["-99", "-999999"];
  const membership = rMembership(codes);
  return membership ? `${variableId} ${membership}` : "FALSE";
}

function statusMissingCheck(
  variableId: string,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const entry = sentinelMap.get(variableId);
  const refusedMembership = entry ? rMembership(entry.refused) : undefined;
  return refusedMembership
    ? `is.na(${variableId}) | ${variableId} ${refusedMembership}`
    : `is.na(${variableId})`;
}

function statusFilterUnknownCheck(
  variableId: string,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const entry = sentinelMap.get(variableId);
  const codes = entry
    ? [...entry.dontKnowSelect, ...entry.dontKnowNumeric, ...entry.refused]
    : ["-99", "-999999"];
  const membership = rMembership(codes);
  return membership ? `is.na(${variableId}) | ${variableId} ${membership}` : `is.na(${variableId})`;
}

// Gate the indicator on the RESULT of the authored expression, not on its
// inputs: R's `&`/`|` are three-valued, so the expression itself knows when a
// missing input cannot change the answer (a skip-logic "." on the follow-up
// question still leaves a determinate 0). The sentinel bindings wrap the whole
// per-time-point case_when, so they are emitted once per indicator over the
// union of the variables its snippets reference. Filter-variable missingness
// stays an explicit branch — `!(NA)` matches nothing in case_when and would
// otherwise fall through to the value branch.
function buildPerTimePointMutateExpression(
  indicator: HfaIndicator,
  codeSnippets: HfaIndicatorCode[],
  allIndicatorIds: Set<string>,
  knownVariableIds: Set<string>,
  dontKnowAsNo: boolean,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const timePointBranches: string[] = [];
  const includeDontKnow = indicator.type === "numeric" || !dontKnowAsNo;
  const boundVariableIds = new Set<string>();

  for (const snippet of codeSnippets) {
    const rCode = normalizeRLogicalOperators(snippet.rCode.trim());
    if (!rCode) continue;

    const timePoint = snippet.timePoint.replace(/"/g, '\\"');

    const rFilterCode = normalizeRLogicalOperators(
      snippet.rFilterCode?.trim() ?? "",
    );
    const deps = extractDependenciesFromCode(
      rCode,
      snippet.rFilterCode,
      allIndicatorIds,
      knownVariableIds,
    );
    for (const variableId of deps.variableIds) {
      boundVariableIds.add(variableId);
    }

    if (rFilterCode) {
      timePointBranches.push(
        `    time_point == "${timePoint}" & (is.na(${rFilterCode}) | !(${rFilterCode})) ~ NA_real_`,
      );
    }

    if (indicator.type === "numeric") {
      // A numeric expression evaluating to NA already returns NA, so the
      // result gate is implicit in the value branch.
      timePointBranches.push(
        `    time_point == "${timePoint}" ~ ${rCode}`,
      );
    } else {
      timePointBranches.push(
        `    time_point == "${timePoint}" & is.na(${rCode}) ~ NA_real_`,
      );
      timePointBranches.push(
        `    time_point == "${timePoint}" & (${rCode}) ~ 1`,
      );
      timePointBranches.push(
        `    time_point == "${timePoint}" ~ 0`,
      );
    }
  }

  timePointBranches.push("    TRUE ~ NA_real_");

  const bindings = [
    SAFE_IN_BINDING,
    ...buildSentinelBindings(
      [...boundVariableIds].sort(),
      includeDontKnow,
      sentinelMap,
    ),
  ];

  return `with(list(\n${bindings.join(",\n")}\n  ), case_when(\n${
    timePointBranches.join(",\n")
  }\n  ))`;
}

// Response-status companion to the value expression: classifies each
// facility × time_point as dont_know / missing / not_applicable / answered,
// independent of the DONT_KNOW_TREATMENT policy. Consumed by the
// M10_hfa_response_status.csv results object (PLAN_HFA_FEATURES.md).
function buildPerTimePointStatusExpression(
  codeSnippets: HfaIndicatorCode[],
  allIndicatorIds: Set<string>,
  knownVariableIds: Set<string>,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const branches: string[] = [];

  for (const snippet of codeSnippets) {
    const rCode = snippet.rCode.trim();
    if (!rCode) continue;

    const timePoint = snippet.timePoint.replace(/"/g, '\\"');
    const rFilterCode = normalizeRLogicalOperators(
      snippet.rFilterCode?.trim() ?? "",
    );
    const deps = extractDependenciesFromCode(
      rCode,
      snippet.rFilterCode,
      allIndicatorIds,
      knownVariableIds,
    );

    // Applicability is decided first, over the filter variables only: a facility
    // is not_applicable when the filter is false, or when a filter variable is
    // itself unknown (NA / don't-know) so eligibility can't be confirmed. Only
    // among applicable facilities do we classify the answer, using the code
    // variables only — otherwise a filtered-out facility whose (never-asked)
    // question variable is NA would be mislabelled "missing" before the
    // not_applicable branch is reached.
    const dkCheck = deps.codeVariableIds.length > 0
      ? deps.codeVariableIds.map((v) => statusDontKnowCheck(v, sentinelMap)).join(" | ")
      : "FALSE";
    const naCheck = deps.codeVariableIds.length > 0
      ? deps.codeVariableIds.map((v) => statusMissingCheck(v, sentinelMap)).join(" | ")
      : "FALSE";

    if (rFilterCode) {
      const filterUnknownChecks = deps.filterVariableIds.map((v) =>
        statusFilterUnknownCheck(v, sentinelMap)
      );
      const notApplicableCheck = [`!(${rFilterCode})`, ...filterUnknownChecks]
        .join(" | ");
      branches.push(
        `    time_point == "${timePoint}" & (${notApplicableCheck}) ~ "not_applicable"`,
      );
    }
    branches.push(
      `    time_point == "${timePoint}" & (${dkCheck}) ~ "dont_know"`,
    );
    branches.push(
      `    time_point == "${timePoint}" & (${naCheck}) ~ "missing"`,
    );
    branches.push(`    time_point == "${timePoint}" ~ "answered"`);
  }

  branches.push("    TRUE ~ NA_character_");

  return `case_when(\n${branches.join(",\n")}\n  )`;
}

export function getScriptWithParametersHfa(
  moduleDefinition: ModuleDefinitionInstalled,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  datasetsDirPath: string,
  indicators: HfaIndicator[],
  indicatorCode: HfaIndicatorCode[],
  variantCode: HfaIndicatorVariantCode[],
  knownVariableIds: Set<string>,
  sentinelRows: HfaSentinelRow[],
  hfaTimePointOrder: string[],
): string {
  const sentinelMap = buildSentinelMap(sentinelRows);

  const stopIfIndicatorFails =
    configSelections.parameterSelections["STOP_IF_INDICATOR_FAILS"]?.trim() !==
      "FALSE";

  const dontKnowAsNo =
    configSelections.parameterSelections["DONT_KNOW_TREATMENT"]?.trim() ===
      "no";

  const allIndicatorIds = new Set(indicators.map((ind) => ind.indicatorId));

  // Group code by indicator
  const codeByIndicator = new Map<string, HfaIndicatorCode[]>();
  for (const code of indicatorCode) {
    if (!codeByIndicator.has(code.indicatorId)) {
      codeByIndicator.set(code.indicatorId, []);
    }
    codeByIndicator.get(code.indicatorId)!.push(code);
  }

  // Track skipped indicators and warnings
  const skippedIndicators = new Set<string>();
  const warnings: string[] = [];

  // Filter out indicators without R code
  let filteredIndicators = indicators;
  if (!stopIfIndicatorFails) {
    filteredIndicators = indicators.filter((indicator) => {
      const snippets = codeByIndicator.get(indicator.indicatorId) ?? [];
      const activeSnippets = snippets.filter(
        (s) => s.rCode && s.rCode.trim() !== "",
      );
      if (activeSnippets.length === 0) {
        skippedIndicators.add(indicator.indicatorId);
        warnings.push(
          `Skipped indicator "${indicator.indicatorId}": no R code configured for any time point`,
        );
        return false;
      }
      return true;
    });
  }

  // Build union dependency graph and validate
  const graphResult = buildUnionDependencyGraph(
    filteredIndicators,
    codeByIndicator,
    allIndicatorIds,
    knownVariableIds,
  );

  if (graphResult.validationErrors.length > 0) {
    if (stopIfIndicatorFails) {
      throw new Error(
        `Invalid indicator definitions:\n${graphResult.validationErrors.join("\n")}`,
      );
    }
    // Extract indicator names from validation errors and skip them
    for (const error of graphResult.validationErrors) {
      const match = error.match(/^Indicator "([^"]+)"/);
      if (match) {
        skippedIndicators.add(match[1]);
        warnings.push(`Skipped: ${error}`);
      }
    }
    filteredIndicators = filteredIndicators.filter(
      (ind) => !skippedIndicators.has(ind.indicatorId),
    );
  }

  // Also skip indicators that depend on skipped indicators
  let changed = true;
  while (changed) {
    changed = false;
    for (const indicator of filteredIndicators) {
      const deps = graphResult.dependenciesMap.get(indicator.indicatorId) ?? [];
      for (const dep of deps) {
        if (
          skippedIndicators.has(dep) &&
          !skippedIndicators.has(indicator.indicatorId)
        ) {
          skippedIndicators.add(indicator.indicatorId);
          warnings.push(
            `Skipped indicator "${indicator.indicatorId}": depends on skipped indicator "${dep}"`,
          );
          changed = true;
          break;
        }
      }
    }
    filteredIndicators = filteredIndicators.filter(
      (ind) => !skippedIndicators.has(ind.indicatorId),
    );
  }

  if (filteredIndicators.length === 0) {
    throw new Error(
      `No valid indicators to process. All indicators were skipped:\n${warnings.join("\n")}`,
    );
  }

  // Rebuild graph with filtered indicators for topological sort
  const filteredGraphResult = buildUnionDependencyGraph(
    filteredIndicators,
    codeByIndicator,
    allIndicatorIds,
    knownVariableIds,
  );

  const { ordered, cycles } = topologicalSort(
    filteredIndicators,
    filteredGraphResult,
  );
  if (cycles.length > 0) {
    throw new Error(
      `Circular dependencies detected:\n${formatCycles(cycles)}`,
    );
  }

  // Variant breakdown (PLAN_HFA_VARIANT_DIMENSION): per-item numerator columns
  // feeding the separate M10_hfa_results_variants.csv pipeline. Gated on the
  // resolved definition declaring the RO so generation at older pinned refs
  // stays byte-identical — the gate covers item mutates, item columns, AND
  // metadata entries atomically (a partial gate would emit composed column names
  // as fake indicators into the main table, which ingests cleanly).
  //
  // Variant columns are computed AFTER every indicator column (a separate
  // pipeline over `results`), so item snippets may reference any indicator —
  // including their own parent — without entering the dependency graph: no
  // self-edge, no cycle. In skip mode a failing snippet skips THAT ITEM only;
  // the parent's overall code and main-CSV rows are never affected.
  const supportsVariants = moduleDefinition.resultsObjects.some(
    (ro) => ro.id === "M10_hfa_results_variants.csv",
  );

  // Parsed (not executed) by R even when no variant columns exist, so the
  // empty forms must be syntactically valid.
  let variantMutates = "  identity()";
  let variantCols = "";
  let variantMetadata = [
    "  variant_col = character(0)",
    "  hfa_indicator = character(0)",
    "  hfa_variant_item = character(0)",
    "  hfa_category = character(0)",
    "  hfa_sub_category = character(0)",
    "  hfa_service_category = character(0)",
    "  ind_aggregation = character(0)",
  ].join(",\n");

  if (supportsVariants && variantCode.length > 0) {
    const orderedIndex = new Map(ordered.map((ind, i) => [ind.indicatorId, i]));
    const indicatorById = new Map(indicators.map((i) => [i.indicatorId, i]));

    const byPair = new Map<string, HfaIndicatorVariantCode[]>();
    for (const vc of variantCode) {
      if (!vc.rCode.trim()) continue;
      const key = `${vc.indicatorId} ${vc.itemId}`;
      if (!byPair.has(key)) {
        byPair.set(key, []);
      }
      byPair.get(key)!.push(vc);
    }

    type VariantEmit = {
      parent: HfaIndicator;
      itemId: string;
      composed: string;
      snippets: HfaIndicatorCode[];
    };
    const emits: VariantEmit[] = [];

    for (const [key, rows] of byPair) {
      const [parentName, itemId] = key.split(" ");
      const parent = indicatorById.get(parentName);
      if (parent === undefined || !orderedIndex.has(parentName)) {
        warnings.push(
          `Dropped variant item "${itemId}" of indicator "${parentName}": the indicator is not part of this run`,
        );
        continue;
      }
      // The shared filter comes from ALL parent code rows, not activeSnippets
      // (a parent row with empty rCode and non-empty rFilterCode is excluded
      // from the latter).
      const parentRowsByTp = new Map(
        (codeByIndicator.get(parentName) ?? []).map((r) => [r.timePoint, r]),
      );
      const snippets: HfaIndicatorCode[] = [];
      for (const row of rows.toSorted((a, b) => a.timePoint.localeCompare(b.timePoint))) {
        const parentRow = parentRowsByTp.get(row.timePoint);
        if (parentRow === undefined) {
          warnings.push(
            `Dropped variant code for indicator "${parentName}", item "${itemId}", time point "${row.timePoint}": the indicator has no code row for that time point`,
          );
          continue;
        }
        snippets.push({
          indicatorId: parentName,
          timePoint: row.timePoint,
          rCode: row.rCode,
          rFilterCode: parentRow.rFilterCode,
        });
      }
      let itemSkipped = false;
      for (const snippet of snippets) {
        const deps = extractDependenciesFromCode(
          snippet.rCode,
          snippet.rFilterCode,
          allIndicatorIds,
          knownVariableIds,
        );
        const problems: string[] = [];
        if (deps.unknownVariables.length > 0) {
          problems.push(
            `Unknown variables [${deps.unknownVariables.join(", ")}]`,
          );
        }
        const skippedDeps = deps.dependencies.filter(
          (d) => !orderedIndex.has(d),
        );
        if (skippedDeps.length > 0) {
          problems.push(
            `Depends on skipped indicator(s) [${skippedDeps.join(", ")}]`,
          );
        }
        if (problems.length > 0) {
          const msg =
            `Variant item "${itemId}" of indicator "${parentName}" (time_point "${snippet.timePoint}"): ${problems.join("; ")}.`;
          if (stopIfIndicatorFails) {
            throw new Error(`Invalid variant definitions:\n${msg}`);
          }
          warnings.push(`Skipped: ${msg}`);
          itemSkipped = true;
          break;
        }
      }
      if (itemSkipped || snippets.length === 0) {
        continue;
      }
      emits.push({
        parent,
        itemId,
        composed: composeHfaVariantColumnName(parentName, itemId),
        snippets,
      });
    }

    emits.sort(
      (a, b) =>
        orderedIndex.get(a.parent.indicatorId)! - orderedIndex.get(b.parent.indicatorId)! ||
        a.itemId.localeCompare(b.itemId),
    );

    // D8 composed-name validations — hard errors in BOTH modes: a collision
    // silently corrupts the MAIN results (duplicate metadata keys →
    // many-to-many join, or an overwritten raw question column), and a
    // reserved suffix double-routes into the response-status pivot.
    const composedSeen = new Set<string>();
    for (const e of emits) {
      const source = `indicator "${e.parent.indicatorId}" × variant item "${e.itemId}"`;
      if (isReservedHfaId(e.composed)) {
        throw new Error(
          `Composed variant column "${e.composed}" (${source}) is a reserved name`,
        );
      }
      if (allIndicatorIds.has(e.composed)) {
        throw new Error(
          `Composed variant column "${e.composed}" (${source}) collides with an indicator id`,
        );
      }
      if (knownVariableIds.has(e.composed)) {
        throw new Error(
          `Composed variant column "${e.composed}" (${source}) collides with a survey variable`,
        );
      }
      if (composedSeen.has(e.composed)) {
        throw new Error(
          `Composed variant column "${e.composed}" (${source}) collides with another composed column`,
        );
      }
      composedSeen.add(e.composed);
    }

    if (emits.length > 0) {
      variantMutates = emits
        .map((e) => {
          const expr = buildPerTimePointMutateExpression(
            e.parent,
            e.snippets,
            allIndicatorIds,
            knownVariableIds,
            dontKnowAsNo,
            sentinelMap,
          );
          return `  mutate(${e.composed} = ${expr})`;
        })
        .join(" %>%\n");
      variantCols = emits.map((e) => `"${e.composed}"`).join(", ");
      variantMetadata = [
        `  variant_col = c(${emits.map((e) => `"${e.composed}"`).join(", ")})`,
        `  hfa_indicator = c(${emits.map((e) => `"${e.parent.indicatorId}"`).join(", ")})`,
        `  hfa_variant_item = c(${emits.map((e) => `"${e.itemId}"`).join(", ")})`,
        `  hfa_category = c(${emits.map((e) => `"${e.parent.categoryId ?? ""}"`).join(", ")})`,
        `  hfa_sub_category = c(${emits.map((e) => `"${e.parent.subCategoryId ?? ""}"`).join(", ")})`,
        `  hfa_service_category = c(${emits.map((e) => `"${serialiseMultiMembershipValues(e.parent.serviceCategoryIds)}"`).join(", ")})`,
        `  ind_aggregation = c(${emits.map((e) => `"${e.parent.aggregation}"`).join(", ")})`,
      ].join(",\n");
    }
  }

  // Build dynamic R fragments
  const warningPrints = warnings
    .map((w) => `warning("${w.replace(/"/g, '\\"')}")`)
    .join("\n");

  // Only emit response-status columns when the installed definition declares
  // the status results object — older installed definitions have no status
  // section in script.R and must not gain stray columns.
  const supportsResponseStatus = moduleDefinition.resultsObjects.some(
    (ro) => ro.id === "M10_hfa_response_status.csv",
  );

  const indicatorMutates = ordered
    .map((indicator) => {
      const snippets = codeByIndicator.get(indicator.indicatorId) ?? [];
      const activeSnippets = snippets.filter(
        (s) => s.rCode && s.rCode.trim() !== "",
      );
      if (activeSnippets.length === 0) {
        throw new Error(
          `Indicator "${indicator.indicatorId}" has no R code configured for any time point. Configure R code for this indicator before running the module.`,
        );
      }
      const expr = buildPerTimePointMutateExpression(
        indicator,
        activeSnippets,
        allIndicatorIds,
        knownVariableIds,
        dontKnowAsNo,
        sentinelMap,
      );
      const valueMutate = `  mutate(${indicator.indicatorId} = ${expr})`;
      if (!supportsResponseStatus) {
        return valueMutate;
      }
      const statusExpr = buildPerTimePointStatusExpression(
        activeSnippets,
        allIndicatorIds,
        knownVariableIds,
        sentinelMap,
      );
      return `${valueMutate} %>%\n  mutate(${indicator.indicatorId}__status = ${statusExpr})`;
    })
    .join(" %>%\n");

  const indicatorCols = ordered
    .map((ind) => `"${ind.indicatorId}"`)
    .join(", ");

  // Only emit hfa_service_category when the installed definition declares the
  // column — ingest rejects CSV headers missing from the table definition, so
  // module instances installed before the column existed must not produce it.
  const supportsServiceCategory = moduleDefinition.resultsObjects.some(
    (ro) =>
      ro.createTableStatementPossibleColumns !== false &&
      "hfa_service_category" in ro.createTableStatementPossibleColumns,
  );

  const indicatorMetadata = [
    `  hfa_indicator = c(${ordered.map((i) => `"${i.indicatorId}"`).join(", ")})`,
    `  hfa_category = c(${ordered.map((i) => `"${i.categoryId ?? ""}"`).join(", ")})`,
    `  hfa_sub_category = c(${ordered.map((i) => `"${i.subCategoryId ?? ""}"`).join(", ")})`,
    ...(supportsServiceCategory
      ? [
        `  hfa_service_category = c(${ordered.map((i) => `"${serialiseMultiMembershipValues(i.serviceCategoryIds)}"`).join(", ")})`,
      ]
      : []),
    `  hfa_short_label = c(${ordered.map((i) => `"${i.shortLabel.replace(/"/g, '\\"')}"`).join(", ")})`,
    `  ind_type = c(${ordered.map((i) => `"${i.type}"`).join(", ")})`,
    `  ind_aggregation = c(${ordered.map((i) => `"${i.aggregation}"`).join(", ")})`,
  ].join(",\n");

  let str = moduleDefinition.script;

  // Standard substitutions
  str = str.replaceAll("COUNTRY_ISO3", `"${countryIso3 ?? "UNKNOWN"}"`);

  for (const ds of moduleDefinition.dataSources) {
    if (ds.sourceType === "dataset") {
      str = str.replaceAll(
        ds.replacementString,
        `'${datasetsDirPath}/${ds.datasetType}.csv'`,
      );
    } else if (ds.sourceType === "population") {
      str = str.replaceAll(
        ds.replacementString,
        populationFilePathLiteral(datasetsDirPath),
      );
    } else {
      str = str.replaceAll(
        ds.replacementString,
        `../${ds.moduleId}/${ds.replacementString}`,
      );
    }
  }

  // Parameter substitutions
  for (const inputParam of configSelections.parameterDefinitions) {
    const mappedParameter =
      configSelections.parameterSelections[
        inputParam.replacementString
      ]?.trim();
    if (inputParam.input.inputType === "select") {
      if (inputParam.input.valueType === "string") {
        str = str.replaceAll(
          inputParam.replacementString,
          `'${mappedParameter ?? "UNSELECTED"}'`,
        );
      } else {
        str = str.replaceAll(
          inputParam.replacementString,
          mappedParameter ?? "UNSELECTED",
        );
      }
    }
    if (inputParam.input.inputType === "boolean") {
      str = str.replaceAll(
        inputParam.replacementString,
        mappedParameter ?? "FALSE",
      );
    }
    if (inputParam.input.inputType === "text") {
      str = str.replaceAll(
        inputParam.replacementString,
        `'${mappedParameter ?? "UNSELECTED"}'`,
      );
    }
    if (inputParam.input.inputType === "number") {
      str = str.replaceAll(
        inputParam.replacementString,
        mappedParameter ?? "UNSELECTED",
      );
    }
  }

  // Marker substitutions
  str = str.replaceAll("__WARNING_PRINTS__", warningPrints);
  str = str.replaceAll("__INDICATOR_MUTATES__", indicatorMutates);
  str = str.replaceAll("__INDICATOR_COLS__", indicatorCols);
  str = str.replaceAll("__INDICATOR_METADATA__", indicatorMetadata);
  if (supportsVariants) {
    // The variant markers exist only in script.R versions whose definition
    // declares the variants RO, so the gate and the markers move together.
    str = str.replaceAll("__VARIANT_MUTATES__", variantMutates);
    str = str.replaceAll("__VARIANT_COLS__", variantCols);
    str = str.replaceAll("__VARIANT_METADATA__", variantMetadata);
  }
  str = str.replaceAll(
    "__HFA_TIME_POINT_ORDER__",
    hfaTimePointOrder.map((tp) => `"${tp.replace(/"/g, '\\"')}"`).join(", "),
  );

  return str;
}
