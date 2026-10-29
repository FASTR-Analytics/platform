import {
  hfaIndicatorCodeIdentifiers,
  type HfaIndicatorStatus,
  type HfaRoundStatus,
} from "../hfa_indicator_code.ts";
import {
  composeHfaIndicatorLabel,
  getHfaIndicatorMeasure,
} from "../hfa_indicator_labels.ts";
import type {
  HfaDictionaryForValidation,
  HfaIndicator,
  HfaIndicatorCategory,
  HfaIndicatorCode,
  HfaIndicatorServiceCategory,
  HfaIndicatorSubCategory,
  HfaIndicatorVariantCode,
  HfaIndicatorVariantGroup,
  HfaIndicatorVariantItem,
  HfaVariableRow,
} from "../types/mod.ts";

// The English text the chat's HFA reads return: the indicator listing, the
// detail block for a set of indicators, the variable listing and the variable
// details.

export type HfaTaxonomyInput = {
  categories: HfaIndicatorCategory[];
  subCategories: HfaIndicatorSubCategory[];
  serviceCategories: HfaIndicatorServiceCategory[];
  variantGroups: HfaIndicatorVariantGroup[];
  variantItems: HfaIndicatorVariantItem[];
};

export type HfaIndicatorsForAIInput = {
  indicators: HfaIndicator[];
  code: HfaIndicatorCode[];
  variantCode: HfaIndicatorVariantCode[];
  taxonomy: HfaTaxonomyInput;
  dictionary: HfaDictionaryForValidation;
  status: Map<string, HfaIndicatorStatus>;
  // Undefined when the user may not view data: the counts and the values
  // present are then left out, with one line saying why.
  displayRows: HfaVariableRow[] | undefined;
};

const NO_DISPLAY_ROWS_LINE =
  "Facility counts and the values present in the data are not shown: they need the permission to view data, which this user does not have.";

// Per variable, per round, the ids of the indicators whose main, filter or
// variant code of that round names it.
export function hfaVariableUsage(
  code: HfaIndicatorCode[],
  variantCode: HfaIndicatorVariantCode[],
): Map<string, Map<string, Set<string>>> {
  const usage = new Map<string, Map<string, Set<string>>>();
  const add = (variableId: string, timePoint: string, indicatorId: string) => {
    const byRound = usage.get(variableId) ?? new Map<string, Set<string>>();
    const ids = byRound.get(timePoint) ?? new Set<string>();
    ids.add(indicatorId);
    byRound.set(timePoint, ids);
    usage.set(variableId, byRound);
  };
  for (const c of code) {
    for (const id of codeIdentifiers(c)) add(id, c.timePoint, c.indicatorId);
  }
  for (const c of variantCode) {
    for (const id of hfaIndicatorCodeIdentifiers(c.rCode)) {
      add(id, c.timePoint, c.indicatorId);
    }
  }
  return usage;
}

function codeIdentifiers(c: HfaIndicatorCode): string[] {
  return [
    ...hfaIndicatorCodeIdentifiers(c.rCode),
    ...hfaIndicatorCodeIdentifiers(c.rFilterCode ?? ""),
  ];
}

// Every lookup the formatters make, built once per call so no output line
// scans the whole input.
function indexInput(input: HfaIndicatorsForAIInput) {
  const roundKey = (id: string, timePoint: string) => `${id}\u0000${timePoint}`;
  const variables = new Map<
    string,
    { variableLabel: string; variableType: string }
  >();
  const options = new Map<
    string,
    HfaDictionaryForValidation["timePoints"][number]["values"]
  >();
  const roundsOfVariable = new Map<string, string[]>();
  for (const tp of input.dictionary.timePoints) {
    for (const v of tp.variables) {
      variables.set(roundKey(v.variableId, tp.timePoint), v);
      append(roundsOfVariable, v.variableId, tp.timePoint);
    }
    for (const o of tp.values) {
      append(options, roundKey(o.variableId, tp.timePoint), o);
    }
  }
  const variantCode = new Map<string, HfaIndicatorVariantCode[]>();
  for (const c of input.variantCode) {
    append(variantCode, roundKey(c.indicatorId, c.timePoint), c);
  }
  const subCategoriesByCategory = new Map<string, HfaIndicatorSubCategory[]>();
  for (const sc of input.taxonomy.subCategories) {
    append(subCategoriesByCategory, sc.categoryId, sc);
  }
  const itemsByGroup = new Map<string, HfaIndicatorVariantItem[]>();
  for (const i of input.taxonomy.variantItems) {
    append(itemsByGroup, i.groupId, i);
  }
  return {
    timePoints: input.dictionary.timePoints.map((tp) => tp.timePoint),
    indicators: new Map(input.indicators.map((i) => [i.indicatorId, i])),
    code: new Map(
      input.code.map((c) => [roundKey(c.indicatorId, c.timePoint), c]),
    ),
    variantCode: (id: string, timePoint: string) =>
      variantCode.get(roundKey(id, timePoint)) ?? [],
    variable: (id: string, timePoint: string) =>
      variables.get(roundKey(id, timePoint)),
    options: (id: string, timePoint: string) =>
      options.get(roundKey(id, timePoint)) ?? [],
    roundsOf: (id: string) => roundsOfVariable.get(id) ?? [],
    subCategoriesOf: (id: string) => subCategoriesByCategory.get(id) ?? [],
    itemsOf: (id: string | null) =>
      id === null ? [] : itemsByGroup.get(id) ?? [],
    categoryLabels: labelMap(input.taxonomy.categories),
    subCategoryLabels: labelMap(input.taxonomy.subCategories),
    serviceCategoryLabels: labelMap(input.taxonomy.serviceCategories),
    groupLabels: labelMap(input.taxonomy.variantGroups),
    displayRow: (() => {
      const rows = new Map(
        (input.displayRows ?? []).map((
          r,
        ) => [roundKey(r.variableId, r.timePoint), r]),
      );
      return (id: string, timePoint: string) =>
        rows.get(roundKey(id, timePoint));
    })(),
    roundKey,
  };
}

type Index = ReturnType<typeof indexInput>;

function append<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

function labelMap(items: { id: string; label: string }[]): Map<string, string> {
  return new Map(items.map((i) => [i.id, i.label]));
}

function named(id: string, labels: Map<string, string>): string {
  const label = labels.get(id);
  return label === undefined ? `${id} (unknown)` : `${id} (${label})`;
}

function mainCode(index: Index, id: string, timePoint: string) {
  return index.code.get(index.roundKey(id, timePoint));
}

function roundStatusCounts(status: HfaIndicatorStatus | undefined): string {
  if (status === undefined) return "no status";
  const counts = new Map<string, number>();
  for (const r of status.rounds) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }
  return (["ready", "warning", "error", "none"] as const)
    .filter((s) => counts.has(s))
    .map((s) => `${counts.get(s)} ${s}`)
    .join(", ");
}

function issueLines(round: HfaRoundStatus, prefix: string): string[] {
  return round.issues.map((i) =>
    `${prefix}${
      i.itemId === undefined ? i.field : `variant ${i.itemId}`
    } (${i.kind}): ${i.text.en}`
  );
}

function taxonomyLines(taxonomy: HfaTaxonomyInput, index: Index): string[] {
  const lines = ["Categories (id: label), each with its sub-categories:"];
  if (taxonomy.categories.length === 0) lines.push("- none");
  for (const c of taxonomy.categories) {
    lines.push(`- ${c.id}: ${c.label}`);
    for (const sc of index.subCategoriesOf(c.id)) {
      lines.push(`  - ${sc.id}: ${sc.label}`);
    }
  }
  lines.push("Service categories (id: label):");
  if (taxonomy.serviceCategories.length === 0) lines.push("- none");
  for (const s of taxonomy.serviceCategories) {
    lines.push(`- ${s.id}: ${s.label}`);
  }
  lines.push("Variant groups (id: label), each with its items:");
  if (taxonomy.variantGroups.length === 0) lines.push("- none");
  for (const g of taxonomy.variantGroups) {
    lines.push(`- ${g.id}: ${g.label}`);
    for (const i of index.itemsOf(g.id)) {
      lines.push(`  - ${i.id}: ${i.label}`);
    }
  }
  return lines;
}

// The taxonomy, then one line per listed indicator; `withIssues` adds each
// round's issues under its line, for a listing filtered by status.
export function formatHfaIndicatorListForAI(
  input: HfaIndicatorsForAIInput,
  listed: HfaIndicator[],
  options: { withIssues: boolean },
): string {
  const index = indexInput(input);
  const lines = [
    ...taxonomyLines(input.taxonomy, index),
    "",
    `${listed.length} of ${input.indicators.length} indicators. Each line: id | long label | type, aggregation | category, sub-category, service categories | variant group | rounds with code | round status | consistency across rounds.`,
  ];
  for (const ind of listed) {
    const status = input.status.get(ind.indicatorId);
    const withCode = index.timePoints.filter((tp) =>
      mainCode(index, ind.indicatorId, tp)?.rCode.trim()
    ).length;
    lines.push(
      [
        ind.indicatorId,
        composeHfaIndicatorLabel(ind, "full"),
        `${ind.type}, ${ind.aggregation}`,
        `category ${ind.categoryId ?? "none"}, sub-category ${
          ind.subCategoryId ?? "none"
        }, services ${ind.serviceCategoryIds.join(" ") || "none"}`,
        `variant group ${ind.variantGroupId ?? "none"}`,
        `code in ${withCode} of ${index.timePoints.length} rounds`,
        roundStatusCounts(status),
        status?.consistent === false ? "inconsistent" : "consistent",
      ].join(" | "),
    );
    if (options.withIssues) {
      for (const r of status?.rounds ?? []) {
        if (r.issues.length > 0) {
          lines.push(...issueLines(r, `  ${r.timePoint} `));
        }
      }
    }
  }
  return lines.join("\n");
}

// m010 reads every value with as.numeric, so a code that is not a number
// reads as missing.
function isNumericCode(code: string): boolean {
  return code.trim() !== "" && Number.isFinite(Number(code));
}

// `extra` adds lines under each round the variable is in.
function variableRoundLines(
  variableId: string,
  input: HfaIndicatorsForAIInput,
  index: Index,
  timePoints: string[],
  extra: (timePoint: string) => string[] = () => [],
): string[] {
  const lines: string[] = [];
  for (const timePoint of timePoints) {
    const variable = index.variable(variableId, timePoint);
    if (variable === undefined) {
      lines.push(`- ${timePoint}: not in this round`);
      continue;
    }
    lines.push(
      `- ${timePoint}: "${variable.variableLabel}" (${variable.variableType})`,
    );
    const options = index.options(variableId, timePoint);
    if (options.length > 0) {
      lines.push(
        `  options: ${
          options.map((o) =>
            `${o.value}: ${o.valueLabel}${
              o.sentinelClass ? ` [${o.sentinelClass}]` : ""
            }${
              isNumericCode(o.value)
                ? ""
                : " [text code: read as missing in the run]"
            }`
          ).join("; ")
        }`,
      );
    }
    if (input.displayRows !== undefined) {
      const row = index.displayRow(variableId, timePoint);
      lines.push(
        row === undefined
          ? "  data: no rows"
          : `  data: ${row.count} facilities, ${row.missing} blank, ${
            row.count - row.missing
          } non-blank (sentinel codes count as non-blank); values present: ${
            row.dataValues || "none"
          }`,
      );
    }
    lines.push(...extra(timePoint));
  }
  // Run capture knows only variables with a value, so the run treats a
  // variable blank in every round as unknown.
  if (
    input.displayRows !== undefined &&
    index.timePoints.every((tp) => {
      const row = index.displayRow(variableId, tp);
      return row === undefined || row.count - row.missing === 0;
    })
  ) {
    lines.push(
      "Blank in every round: unknown to the run, so an indicator naming it is skipped.",
    );
  }
  return lines;
}

function indicatorBlock(
  ind: HfaIndicator,
  input: HfaIndicatorsForAIInput,
  index: Index,
): string[] {
  const status = input.status.get(ind.indicatorId);
  const items = index.itemsOf(ind.variantGroupId);
  const itemIds = new Set(items.map((i) => i.id));
  const lines = [
    `## Indicator ${ind.indicatorId}`,
    `Short label: ${ind.shortLabel || "(none)"}`,
    `Long label: ${ind.definition || "(none)"}`,
    `Measure: ${getHfaIndicatorMeasure(ind.type, ind.aggregation).label.en}`,
    `Type: ${ind.type}; aggregation: ${ind.aggregation}`,
    `Category: ${
      ind.categoryId === null
        ? "none"
        : named(ind.categoryId, index.categoryLabels)
    }; sub-category: ${
      ind.subCategoryId === null
        ? "none"
        : named(ind.subCategoryId, index.subCategoryLabels)
    }; service categories: ${
      ind.serviceCategoryIds
        .map((id) => named(id, index.serviceCategoryLabels))
        .join(", ") || "none"
    }`,
    ind.variantGroupId === null
      ? "Variant group: none"
      : `Variant group: ${
        named(ind.variantGroupId, index.groupLabels)
      }; items: ${
        items.map((i) => `${i.id} (${i.label})`).join(", ") || "none"
      }`,
    `Consistent across rounds: ${status?.consistent === false ? "no" : "yes"}`,
    "Rounds:",
  ];
  for (const r of status?.rounds ?? []) {
    const main = mainCode(index, ind.indicatorId, r.timePoint);
    const variants = index.variantCode(ind.indicatorId, r.timePoint)
      .filter((c) => itemIds.has(c.itemId) && c.rCode.trim() !== "");
    if (r.status === "none" && variants.length === 0) {
      lines.push(`- ${r.timePoint}: no code`);
      continue;
    }
    lines.push(`- ${r.timePoint}: ${r.status}`);
    lines.push(`  rCode: ${main?.rCode.trim() || "(none)"}`);
    if (main?.rFilterCode?.trim()) {
      lines.push(`  rFilterCode: ${main.rFilterCode.trim()}`);
    }
    for (const v of variants) {
      lines.push(`  variant ${v.itemId}: ${v.rCode.trim()}`);
    }
    lines.push(...issueLines(r, "  issue: "));
  }
  return lines;
}

function namedIndicatorLines(
  ind: HfaIndicator,
  input: HfaIndicatorsForAIInput,
  index: Index,
): string[] {
  const lines = [
    `### ${ind.indicatorId}: ${
      composeHfaIndicatorLabel(ind, "full")
    } (${ind.type}, ${ind.aggregation})`,
  ];
  for (const r of input.status.get(ind.indicatorId)?.rounds ?? []) {
    const main = mainCode(index, ind.indicatorId, r.timePoint);
    const rCode = main?.rCode.trim() ?? "";
    const rFilterCode = main?.rFilterCode?.trim() ?? "";
    lines.push(
      rCode === "" && rFilterCode === ""
        ? `- ${r.timePoint}: no code`
        : `- ${r.timePoint}: ${r.status}; rCode: ${rCode || "(none)"}${
          rFilterCode ? `; rFilterCode: ${rFilterCode}` : ""
        }`,
    );
  }
  return lines;
}

// Every indicator of `indicatorIds`, then every variable their code names,
// once, then every other indicator their code names, once. An id that is an
// indicator is read as the indicator, as the generator reads it.
export function formatHfaIndicatorDetailsForAI(
  input: HfaIndicatorsForAIInput,
  indicatorIds: string[],
): string {
  const index = indexInput(input);
  const set = new Set(indicatorIds);
  const lines: string[] = [];
  const names = new Set<string>();
  for (const id of indicatorIds) {
    const ind = index.indicators.get(id);
    if (ind === undefined) continue;
    lines.push(...indicatorBlock(ind, input, index), "");
    for (const tp of index.timePoints) {
      const main = mainCode(index, id, tp);
      if (main !== undefined) {
        codeIdentifiers(main).forEach((n) => names.add(n));
      }
      for (const v of index.variantCode(id, tp)) {
        hfaIndicatorCodeIdentifiers(v.rCode).forEach((n) => names.add(n));
      }
    }
  }
  const variables = [...names].filter((n) => !index.indicators.has(n));
  const others = [...names].filter((n) =>
    index.indicators.has(n) && !set.has(n)
  );
  lines.push("## Variables the code names");
  if (input.displayRows === undefined) lines.push(NO_DISPLAY_ROWS_LINE);
  if (variables.length === 0) lines.push("None.");
  for (const v of variables) {
    lines.push(
      `### ${v}`,
      ...variableRoundLines(v, input, index, index.timePoints),
    );
  }
  lines.push("", "## Other indicators the code names");
  if (others.length === 0) lines.push("None.");
  for (const id of others) {
    lines.push(...namedIndicatorLines(index.indicators.get(id)!, input, index));
  }
  return lines.join("\n");
}

function countOf(n: number): string {
  return `${n} ${n === 1 ? "indicator" : "indicators"}`;
}

// One line per variable: its label and type in the first round it is in, and
// per round it is in, how many indicators name it.
export function formatHfaVariableListForAI(
  input: HfaIndicatorsForAIInput,
  variableIds: string[],
): string {
  const index = indexInput(input);
  const usage = hfaVariableUsage(input.code, input.variantCode);
  const lines = [
    `${variableIds.length} variables. Each line: id | label | type | per round it is in, the number of indicators whose code of that round names it.`,
  ];
  for (const id of variableIds) {
    const rounds = index.roundsOf(id);
    const first = rounds.length > 0 ? index.variable(id, rounds[0]) : undefined;
    lines.push(
      [
        id,
        first?.variableLabel ?? "",
        first?.variableType ?? "",
        rounds.map((tp) =>
          `${tp}: ${countOf(usage.get(id)?.get(tp)?.size ?? 0)}`
        ).join(", "),
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

// Per variable, per round (or the one round asked for), the detail the detail
// block prints and the indicators naming it. An id in no round is listed
// under "Not found".
export function formatHfaVariableDetailsForAI(
  input: HfaIndicatorsForAIInput,
  variableIds: string[],
  timePoint: string | undefined,
): string {
  const index = indexInput(input);
  const usage = hfaVariableUsage(input.code, input.variantCode);
  const shown = timePoint === undefined ? index.timePoints : [timePoint];
  const lines: string[] = [];
  if (input.displayRows === undefined) lines.push(NO_DISPLAY_ROWS_LINE);
  const notFound: string[] = [];
  for (const id of variableIds) {
    if (index.roundsOf(id).length === 0) {
      notFound.push(id);
      continue;
    }
    lines.push(
      `## ${id}`,
      ...variableRoundLines(id, input, index, shown, (tp) => {
        const naming = [...(usage.get(id)?.get(tp) ?? [])].map((n) => {
          const ind = index.indicators.get(n);
          return ind === undefined
            ? n
            : `${n} (${composeHfaIndicatorLabel(ind, "full")})`;
        });
        return [`  named by: ${naming.join(", ") || "no indicator"}`];
      }),
    );
  }
  if (notFound.length > 0) {
    lines.push(`Not found in any round: ${notFound.join(", ")}`);
  }
  return lines.join("\n");
}
