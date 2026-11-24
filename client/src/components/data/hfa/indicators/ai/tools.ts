import {
  AIToolFailure,
  createAITool,
  foldString,
  matchesSearch,
  openComponent,
  plural,
  type ProposalPreview,
  searchTokens,
} from "panther";
import {
  AI_HFA_DETAILS_MAX,
  composeHfaIndicatorLabel,
  composeHfaVariantColumnName,
  copilotToolContract,
  describeHfaFieldIssue,
  formatHfaIndicatorDetailsForAI,
  formatHfaIndicatorListForAI,
  formatHfaVariableDetailsForAI,
  formatHfaVariableListForAI,
  getHfaIndicatorMeasure,
  HFA_STRUCTURAL_VARIABLE_IDS,
  type HfaCodeRoundInput,
  type HfaDictionaryForValidation,
  type HfaFieldIssue,
  type HfaIndicator,
  type HfaIndicatorCode,
  hfaIndicatorCodeIdentifiers,
  hfaIndicatorsStatus,
  type HfaIndicatorStatus,
  type HfaIndicatorUpdateInput,
  type HfaIndicatorVariantCode,
  type HfaTaxonomyInput,
  hfaVariableUsage,
  type HfaVariantRowInput,
  isHfaCodeError,
  isReservedHfaId,
  nextHfaIndicatorId,
  t3,
  type TranslatableString,
} from "lib";
import { serverActions } from "~/server_actions";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import {
  loadAllCode,
  loadAllVariantCode,
  loadDictionary,
  loadIndicators,
  loadReadInput,
  loadTaxonomy,
} from "../_shared/mod.ts";
import { HfaProposalDiff } from "./proposal_diff.tsx";

function refuseOverCap(ids: string[], what: string): void {
  if (ids.length > AI_HFA_DETAILS_MAX) {
    throw new AIToolFailure(
      `At most ${AI_HFA_DETAILS_MAX} ${what} per call; ${ids.length} were given. Split the ids across calls.`,
    );
  }
}

function refuseUnknownTimePoint(
  timePoint: string | undefined,
  dictionary: HfaDictionaryForValidation,
): void {
  if (
    timePoint !== undefined &&
    !dictionary.timePoints.some((tp) => tp.timePoint === timePoint)
  ) {
    throw new AIToolFailure(
      `Time point "${timePoint}" is not a round of the dataset. Rounds: ${
        dictionary.timePoints.map((tp) => tp.timePoint).join(", ") || "(none)"
      }.`,
    );
  }
}

function taxonomyLabels(taxonomy: HfaTaxonomyInput): Map<string, string> {
  return new Map(
    [
      ...taxonomy.categories,
      ...taxonomy.subCategories,
      ...taxonomy.serviceCategories,
    ].map((t) => [t.id, t.label]),
  );
}

// The manager's search text: the id, both labels and the category,
// sub-category and service-category labels.
function indicatorSearchText(
  ind: HfaIndicator,
  labels: Map<string, string>,
): string {
  const label = (id: string | null) => id === null ? "" : labels.get(id) ?? "";
  return [
    ind.indicatorId,
    ind.shortLabel,
    ind.definition,
    label(ind.categoryId),
    label(ind.subCategoryId),
    ...ind.serviceCategoryIds.map(label),
  ].join(" ");
}

function matchesStatus(
  status: HfaIndicatorStatus | undefined,
  wanted: "error" | "warning" | "inconsistent" | "none",
): boolean {
  if (status === undefined) return false;
  const has = (s: string) => status.rounds.some((r) => r.status === s);
  switch (wanted) {
    case "error":
      return has("error");
    case "warning":
      return has("warning") && !has("error");
    case "inconsistent":
      return !status.consistent;
    case "none":
      return status.rounds.every((r) => r.status === "none");
  }
}

function countIndicators(n: number): string {
  return `${n} ${
    plural(n, {
      one: t3({ en: "indicator", fr: "indicateur", pt: "indicador" }),
      other: t3({ en: "indicators", fr: "indicateurs", pt: "indicadores" }),
    })
  }`;
}

// The state a write judges against, read fresh in propose.
async function loadWriteState() {
  const [indicators, taxonomy, code, variantCode, dictionary] = await Promise
    .all([
      loadIndicators(),
      loadTaxonomy(),
      loadAllCode(),
      loadAllVariantCode(),
      loadDictionary(),
    ]);
  return { indicators, taxonomy, code, variantCode, dictionary };
}

type WriteState = Awaited<ReturnType<typeof loadWriteState>>;

function idList(ids: Iterable<string>): string {
  return [...ids].join(", ") || "(none)";
}

// What create refuses for a new indicator, and update for a merged one,
// before any preview: every id the indicator or its code names must exist and
// fit, and its composed variant columns must be free.
function refuseUnfitIndicator(
  ind: HfaIndicator,
  code: HfaCodeRoundInput[],
  variantCode: HfaVariantRowInput[],
  state: WriteState,
): void {
  const t = state.taxonomy;
  const id = ind.indicatorId;
  const where = `Indicator ${id}`;
  if (
    ind.categoryId !== null &&
    !t.categories.some((c) => c.id === ind.categoryId)
  ) {
    throw new AIToolFailure(
      `${where}: category "${ind.categoryId}" does not exist. Valid: ${
        idList(t.categories.map((c) => c.id))
      }.`,
    );
  }
  if (ind.subCategoryId !== null) {
    const sub = t.subCategories.find((s) => s.id === ind.subCategoryId);
    if (sub === undefined) {
      throw new AIToolFailure(
        `${where}: sub-category "${ind.subCategoryId}" does not exist.`,
      );
    }
    if (sub.categoryId !== ind.categoryId) {
      throw new AIToolFailure(
        `${where}: sub-category "${sub.id}" belongs to category "${sub.categoryId}", not "${
          ind.categoryId ?? "(none)"
        }".`,
      );
    }
  }
  const badServices = ind.serviceCategoryIds.filter((s) =>
    !t.serviceCategories.some((c) => c.id === s)
  );
  if (badServices.length > 0) {
    throw new AIToolFailure(
      `${where}: service categories do not exist: ${
        badServices.join(", ")
      }. Valid: ${idList(t.serviceCategories.map((c) => c.id))}.`,
    );
  }
  const items = t.variantItems.filter((i) => i.groupId === ind.variantGroupId);
  if (
    ind.variantGroupId !== null &&
    !t.variantGroups.some((g) => g.id === ind.variantGroupId)
  ) {
    throw new AIToolFailure(
      `${where}: variant group "${ind.variantGroupId}" does not exist. Valid: ${
        idList(t.variantGroups.map((g) => g.id))
      }.`,
    );
  }
  const rounds = new Set(state.dictionary.timePoints.map((tp) => tp.timePoint));
  for (const r of [...code, ...variantCode]) {
    if (!rounds.has(r.timePoint)) {
      throw new AIToolFailure(
        `${where}: time point "${r.timePoint}" is not a round of the dataset. Rounds: ${
          idList(rounds)
        }.`,
      );
    }
  }
  for (const v of variantCode) {
    if (!t.variantItems.some((i) => i.id === v.itemId)) {
      throw new AIToolFailure(
        `${where}: variant item "${v.itemId}" does not exist.`,
      );
    }
    if (!items.some((i) => i.id === v.itemId)) {
      throw new AIToolFailure(
        `${where}: variant item "${v.itemId}" is not in the indicator's variant group "${
          ind.variantGroupId ?? "(none)"
        }". Its items: ${idList(items.map((i) => i.id))}.`,
      );
    }
  }
  const indicatorIds = new Set(state.indicators.map((i) => i.indicatorId));
  const variableIds = new Set(
    state.dictionary.timePoints.flatMap((tp) =>
      tp.variables.map((v) => v.variableId)
    ),
  );
  for (const item of items) {
    const column = composeHfaVariantColumnName(id, item.id);
    if (
      isReservedHfaId(column) || indicatorIds.has(column) ||
      variableIds.has(column)
    ) {
      throw new AIToolFailure(
        `${where}: the variant column "${column}" for item "${item.id}" is reserved or names an existing indicator or survey variable; choose another group.`,
      );
    }
  }
}

function issueLine(
  r: { timePoint: string },
  i: HfaFieldIssue,
): string {
  return `${r.timePoint} ${describeHfaFieldIssue(i)}`;
}

// The key of one field a write touches, matched against the issues the status
// core finds in it.
function fieldKey(
  timePoint: string,
  field: HfaFieldIssue["field"],
  itemId = "",
): string {
  return `${timePoint}|${field}|${itemId}`;
}

// The status of `ids` over a state with their code in place.
function statusOver(
  state: WriteState,
  indicators: HfaIndicator[],
  code: HfaIndicatorCode[],
  variantCode: HfaIndicatorVariantCode[],
  ids: Iterable<string>,
): Map<string, HfaIndicatorStatus> {
  return hfaIndicatorsStatus({
    indicators,
    code,
    variantCode,
    variantItems: state.taxonomy.variantItems,
    dictionary: state.dictionary,
    only: new Set(ids),
  });
}

// One indicator as the approval lays it out: a header, its fields, then per
// round the main code, the filter and each item's variant code, with warnings
// beside the round. The stored and the proposed layouts are diffed line by
// line, so every line names what it holds.
function indicatorLayout(
  ind: HfaIndicator,
  code: HfaCodeRoundInput[],
  variantCode: HfaVariantRowInput[],
  status: HfaIndicatorStatus | undefined,
  state: WriteState,
): string {
  const field = (label: TranslatableString, value: string) =>
    `  ${t3(label)}: ${value || "—"}`;
  const lines = [
    `${ind.indicatorId}: ${composeHfaIndicatorLabel(ind, "full")}`,
    field(SCALAR_FIELDS[0][1], ind.shortLabel),
    field(SCALAR_FIELDS[1][1], ind.definition),
    field(
      { en: "Measure", fr: "Mesure", pt: "Medida" },
      `${
        t3(getHfaIndicatorMeasure(ind.type, ind.aggregation).label)
      } (${ind.type}, ${ind.aggregation})`,
    ),
    field(
      { en: "Categories", fr: "Catégories", pt: "Categorias" },
      describeCategories(ind, state.taxonomy),
    ),
    field(SCALAR_FIELDS[7][1], ind.variantGroupId ?? ""),
  ];
  const timePoints = state.dictionary.timePoints.map((tp) => tp.timePoint);
  for (const tp of timePoints) {
    const main = code.find((c) => c.timePoint === tp);
    const variants = variantCode.filter((v) => v.timePoint === tp);
    if (!main?.code.trim() && !main?.filterCode?.trim() && !variants.length) {
      continue;
    }
    const warnings = status?.rounds.find((r) => r.timePoint === tp)?.issues
      .filter((i) => i.kind === "result_type")
      .map((i) => t3(i.text)) ?? [];
    lines.push(
      `  ${tp}: ${main?.code.trim() ?? ""}${
        warnings.length ? `   (${warnings.join("; ")})` : ""
      }`,
    );
    if (main?.filterCode?.trim()) {
      lines.push(
        `    ${
          t3({ en: "filter", fr: "filtre", pt: "filtro" })
        }: ${main.filterCode.trim()}`,
      );
    }
    for (const v of variants) {
      lines.push(`    ${v.itemId}: ${v.code.trim()}`);
    }
  }
  return lines.join("\n");
}

function describeCategories(ind: HfaIndicator, t: HfaTaxonomyInput): string {
  const label = (items: { id: string; label: string }[], id: string) =>
    items.find((i) => i.id === id)?.label ?? id;
  const none = "—";
  return [
    ind.categoryId === null ? none : label(t.categories, ind.categoryId),
    ind.subCategoryId === null
      ? none
      : label(t.subCategories, ind.subCategoryId),
    ind.serviceCategoryIds.map((s) => label(t.serviceCategories, s)).join(
      ", ",
    ) || none,
  ].join(" / ");
}

const SCALAR_FIELDS = [
  ["shortLabel", {
    en: "Short label",
    fr: "Libellé court",
    pt: "Etiqueta curta",
  }],
  ["definition", {
    en: "Long label",
    fr: "Libellé long",
    pt: "Etiqueta longa",
  }],
  ["type", { en: "Type", fr: "Type", pt: "Tipo" }],
  ["aggregation", { en: "Aggregation", fr: "Agrégation", pt: "Agregação" }],
  ["categoryId", { en: "Category", fr: "Catégorie", pt: "Categoria" }],
  [
    "subCategoryId",
    { en: "Sub-category", fr: "Sous-catégorie", pt: "Subcategoria" },
  ],
  [
    "serviceCategoryIds",
    {
      en: "Service categories",
      fr: "Catégories de service",
      pt: "Categorias de serviço",
    },
  ],
  [
    "variantGroupId",
    {
      en: "Variant group",
      fr: "Groupe de variantes",
      pt: "Grupo de variantes",
    },
  ],
] as const satisfies readonly (readonly [
  keyof HfaIndicatorUpdateInput & keyof HfaIndicator,
  TranslatableString,
])[];

function scalarText(value: string | string[] | null): string {
  return Array.isArray(value) ? `[${value.join(", ")}]` : value ?? "(none)";
}

function firstDuplicate(keys: string[]): string | undefined {
  const seen = new Set<string>();
  return keys.find((k) => seen.has(k) || !seen.add(k));
}

function codeKey(
  code: HfaCodeRoundInput[],
  variantCode: HfaVariantRowInput[],
): string {
  return JSON.stringify([
    code.map((c) => [c.timePoint, c.code.trim(), c.filterCode?.trim() ?? ""])
      .sort(),
    variantCode.map((v) => [v.timePoint, v.itemId, v.code.trim()]).sort(),
  ]);
}

function refuseDuplicateRows(
  id: string,
  code: { timePoint: string }[],
  variantCode: HfaVariantRowInput[],
): void {
  const duplicateRound = firstDuplicate(code.map((r) => r.timePoint));
  if (duplicateRound !== undefined) {
    throw new AIToolFailure(
      `${id}: round "${duplicateRound}" is listed twice; list each round once.`,
    );
  }
  const duplicateRow = firstDuplicate(
    variantCode.map((r) => `${r.timePoint} / ${r.itemId}`),
  );
  if (duplicateRow !== undefined) {
    throw new AIToolFailure(
      `${id}: variant row "${duplicateRow}" is listed twice; list each row once.`,
    );
  }
}

// One update entry merged onto fresh state, with the editor's semantics: a
// category change clears a sub-category that no longer fits, a group change
// drops the previous group's variant code, and code is patched as the tool's
// description states. `writtenFields` keys the fields the entry writes
// (`round|field|item`), the ones whose errors refuse the call.
function mergeUpdate(
  u: HfaIndicatorUpdateInput,
  before: HfaIndicator,
  state: WriteState,
) {
  const id = before.indicatorId;
  refuseDuplicateRows(id, u.code ?? [], u.variantCode ?? []);
  const codeBefore: HfaCodeRoundInput[] = state.code
    .filter((c) => c.indicatorId === id)
    .map((c) => ({
      timePoint: c.timePoint,
      code: c.code,
      filterCode: c.filterCode,
    }));
  const variantCodeBefore: HfaVariantRowInput[] = state.variantCode
    .filter((c) => c.indicatorId === id)
    .map((c) => ({ timePoint: c.timePoint, itemId: c.itemId, code: c.code }));

  const after: HfaIndicator = { ...before };
  for (const [key] of SCALAR_FIELDS) {
    const value = u[key];
    if (value !== undefined) Object.assign(after, { [key]: value });
  }
  const report: string[] = [];
  if (u.subCategoryId === undefined && after.subCategoryId !== null) {
    const sub = state.taxonomy.subCategories.find((s) =>
      s.id === after.subCategoryId
    );
    if (sub === undefined || sub.categoryId !== after.categoryId) {
      report.push(
        `subCategoryId: cleared ("${after.subCategoryId}" belonged to the previous category)`,
      );
      after.subCategoryId = null;
    }
  }
  const groupChanged = after.variantGroupId !== before.variantGroupId;
  const dropped = groupChanged ? variantCodeBefore : [];
  if (dropped.length > 0) {
    report.push(
      `variant code of the previous group dropped: ${
        dropped.map((v) => `${v.timePoint} ${v.itemId}`).join(", ")
      }`,
    );
  }

  const writtenFields = new Set<string>();
  const rounds = new Map(codeBefore.map((c) => [c.timePoint, { ...c }]));
  for (const r of u.code ?? []) {
    if (r.code === undefined && r.filterCode === undefined) {
      throw new AIToolFailure(
        `${id}: round "${r.timePoint}" names neither code nor filter code.`,
      );
    }
    const round = rounds.get(r.timePoint) ??
      { timePoint: r.timePoint, code: "" };
    if (r.code !== undefined) {
      round.code = r.code;
      writtenFields.add(fieldKey(r.timePoint, "code"));
    }
    if (r.filterCode !== undefined) {
      round.filterCode = r.filterCode || undefined;
      writtenFields.add(fieldKey(r.timePoint, "filterCode"));
    }
    // Clearing a round's code orphans its variant rows, so the call writes
    // them too and their errors refuse it.
    if (r.code !== undefined && !r.code.trim()) {
      for (const v of variantCodeBefore) {
        if (v.timePoint === r.timePoint) {
          writtenFields.add(fieldKey(r.timePoint, "variantCode", v.itemId));
        }
      }
    }
    if (
      (r.code === "" && !r.filterCode) ||
      (!round.code.trim() && !round.filterCode?.trim())
    ) {
      rounds.delete(r.timePoint);
    } else {
      rounds.set(r.timePoint, round);
    }
  }
  const code = [...rounds.values()];
  const rows = new Map(
    (groupChanged ? [] : variantCodeBefore).map((
      v,
    ) => [`${v.timePoint}|${v.itemId}`, v]),
  );
  for (const v of u.variantCode ?? []) {
    const key = `${v.timePoint}|${v.itemId}`;
    if (v.code.trim() === "") rows.delete(key);
    else rows.set(key, v);
    writtenFields.add(fieldKey(v.timePoint, "variantCode", v.itemId));
  }
  const variantCode = [...rows.values()];

  const fieldsChanged = SCALAR_FIELDS.some(([key]) =>
    scalarText(after[key]) !== scalarText(before[key])
  );
  for (const [key] of SCALAR_FIELDS) {
    if (u[key] === undefined) continue;
    const b = scalarText(before[key]);
    const a = scalarText(after[key]);
    report.push(b === a ? `${key}: no change` : `${key}: "${b}" → "${a}"`);
  }
  const roundText = (c: HfaCodeRoundInput | undefined) =>
    c === undefined
      ? "(none)"
      : c.filterCode?.trim()
      ? `${c.code.trim()} [filter: ${c.filterCode.trim()}]`
      : c.code.trim();
  for (const r of u.code ?? []) {
    const b = roundText(codeBefore.find((c) => c.timePoint === r.timePoint));
    const a = roundText(rounds.get(r.timePoint));
    report.push(
      b === a
        ? `${r.timePoint} code: no change`
        : `${r.timePoint} code: "${b}" → "${a}"`,
    );
  }
  for (const v of u.variantCode ?? []) {
    const b = variantCodeBefore.find((c) =>
      c.timePoint === v.timePoint && c.itemId === v.itemId
    )?.code.trim() ?? "(none)";
    const a = rows.get(`${v.timePoint}|${v.itemId}`)?.code.trim() ?? "(none)";
    report.push(
      b === a && !groupChanged
        ? `${v.timePoint} variant ${v.itemId}: no change`
        : `${v.timePoint} variant ${v.itemId}: "${b}" → "${a}"`,
    );
  }
  const codeChanged = codeKey(code, variantCode) !==
    codeKey(codeBefore, variantCodeBefore);
  return {
    before,
    after,
    code,
    variantCode,
    codeBefore,
    variantCodeBefore,
    writtenFields,
    report,
    codeChanged,
    changed: fieldsChanged || codeChanged,
    wroteCode: u.code !== undefined,
    wroteVariantCode: u.variantCode !== undefined,
  };
}

// A create's or an update's approval: the app's wide merge view in place of
// panther's built-in dialog, over the same diff the preview records.
function openProposalDiff(
  preview: ProposalPreview & { diff: { before: string; after: string } },
  signal: AbortSignal,
): Promise<boolean> {
  return openComponent({
    element: HfaProposalDiff,
    props: {
      title: preview.title,
      description: preview.description ?? "",
      before: preview.diff.before,
      after: preview.diff.after,
      signal,
    },
  }).then((accepted) => accepted === true);
}

// The chat's HFA reads and HFA writes, gated by view through `availableIn`
// (the reads in the manager, the code editor and the Excel import; the writes
// in the manager alone, where each proposes a modal approval). Who may call
// them refuses at the call through the chat's guard: the reads and the writes
// both need `can_configure_data`.

export function buildHfaIndicatorTools() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_hfa_indicators"),
      handler: async (input) => {
        const read = await loadReadInput(false);
        const tokens = searchTokens(input.search ?? "");
        const labels = taxonomyLabels(read.taxonomy);
        const naming = input.namesVariable === undefined ? undefined : (() => {
          const usage = hfaVariableUsage(read.code, read.variantCode);
          return new Set(
            input.namesVariable.flatMap((v) =>
              [...(usage.get(v)?.values() ?? [])].flatMap((ids) => [...ids])
            ),
          );
        })();
        const listed = read.indicators.filter((ind) =>
          (input.categoryId === undefined ||
            ind.categoryId === input.categoryId) &&
          (input.serviceCategoryId === undefined ||
            ind.serviceCategoryIds.includes(input.serviceCategoryId)) &&
          (input.status === undefined ||
            matchesStatus(read.status.get(ind.indicatorId), input.status)) &&
          (!input.missingCategory || ind.categoryId === null) &&
          (!input.missingShortLabel || ind.shortLabel.trim() === "") &&
          (naming === undefined || naming.has(ind.indicatorId)) &&
          matchesSearch(foldString(indicatorSearchText(ind, labels)), tokens)
        );
        return formatHfaIndicatorListForAI(read, listed, {
          withIssues: input.status !== undefined,
          withCode: input.withCode === true,
          offset: input.offset ?? 0,
        });
      },
      inProgressLabel: t3({
        en: "Getting the HFA indicators...",
        fr: "Récupération des indicateurs HFA...",
        pt: "A obter os indicadores HFA...",
      }),
      successMessage: t3({
        en: "Retrieved the HFA indicators",
        fr: "Indicateurs HFA récupérés",
        pt: "Indicadores HFA obtidos",
      }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_hfa_indicator_details"),
      handler: async (input) => {
        const ids = [...new Set(input.indicatorIds)];
        refuseOverCap(ids, "indicators");
        const read = await loadReadInput(true);
        const known = new Set(read.indicators.map((i) => i.indicatorId));
        const unknown = ids.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new AIToolFailure(
            `Unknown indicator id(s): ${
              unknown.join(", ")
            }. get_hfa_indicators lists the ids.`,
          );
        }
        return formatHfaIndicatorDetailsForAI(read, ids);
      },
      inProgressLabel: t3({
        en: "Getting the details of HFA indicators...",
        fr: "Récupération du détail d'indicateurs HFA...",
        pt: "A obter o detalhe de indicadores HFA...",
      }),
      successMessage: (input) => {
        const indicators = countIndicators(new Set(input.indicatorIds).size);
        return t3({
          en: `Retrieved the details of ${indicators}`,
          fr: `Détail de ${indicators} récupéré`,
          pt: `Detalhe de ${indicators} obtido`,
        });
      },
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_hfa_variables"),
      handler: async (input) => {
        const read = await loadReadInput(false);
        refuseUnknownTimePoint(input.timePoint, read.dictionary);
        const tokens = searchTokens(input.search ?? "");
        const rounds = read.dictionary.timePoints.filter((tp) =>
          input.timePoint === undefined || tp.timePoint === input.timePoint
        );
        const usage = hfaVariableUsage(read.code, read.variantCode);
        const searched = new Map<string, string[]>();
        const unusedIn = new Set<string>();
        for (const tp of rounds) {
          for (const v of tp.variables) {
            searched.set(v.variableId, [
              ...(searched.get(v.variableId) ?? [v.variableId]),
              v.variableLabel,
            ]);
            if (!usage.get(v.variableId)?.get(tp.timePoint)?.size) {
              unusedIn.add(v.variableId);
            }
          }
        }
        const ids = [...searched].filter(([id, texts]) =>
          matchesSearch(foldString(texts.join(" ")), tokens) &&
          (!input.unusedOnly ||
            (unusedIn.has(id) && !HFA_STRUCTURAL_VARIABLE_IDS.has(id)))
        ).map(([id]) => id);
        return formatHfaVariableListForAI(read, ids, input.offset ?? 0);
      },
      inProgressLabel: t3({
        en: "Getting the HFA survey variables...",
        fr: "Récupération des variables de l'enquête HFA...",
        pt: "A obter as variáveis do inquérito HFA...",
      }),
      successMessage: t3({
        en: "Retrieved the HFA survey variables",
        fr: "Variables de l'enquête HFA récupérées",
        pt: "Variáveis do inquérito HFA obtidas",
      }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_hfa_variable_details"),
      handler: async (input) => {
        const ids = [...new Set(input.variableIds)];
        refuseOverCap(ids, "variables");
        const read = await loadReadInput(true);
        refuseUnknownTimePoint(input.timePoint, read.dictionary);
        return formatHfaVariableDetailsForAI(
          read,
          ids,
          input.timePoint,
        );
      },
      inProgressLabel: (input) => {
        const ids = [...new Set(input.variableIds)].join(", ");
        return t3({
          en: `Getting the details of ${ids}...`,
          fr: `Récupération du détail de ${ids}...`,
          pt: `A obter o detalhe de ${ids}...`,
        });
      },
      successMessage: (input) => {
        const ids = [...new Set(input.variableIds)].join(", ");
        return t3({
          en: `Retrieved the details of ${ids}`,
          fr: `Détail de ${ids} récupéré`,
          pt: `Detalhe de ${ids} obtido`,
        });
      },
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("create_hfa_indicators"),
      approval: {
        propose: async (input) => {
          const state = await loadWriteState();
          const taken = new Set([
            ...state.indicators.map((i) => i.indicatorId),
            ...state.dictionary.timePoints.flatMap((tp) =>
              tp.variables.map((v) => v.variableId)
            ),
          ]);
          const created = input.indicators.map((ind) => {
            const indicatorId = nextHfaIndicatorId(taken);
            taken.add(indicatorId);
            const indicator: HfaIndicator = {
              indicatorId,
              categoryId: ind.categoryId ?? null,
              subCategoryId: ind.subCategoryId ?? null,
              serviceCategoryIds: ind.serviceCategoryIds ?? [],
              shortLabel: ind.shortLabel ?? "",
              definition: ind.definition,
              type: ind.type,
              aggregation: ind.aggregation,
              sortOrder: 0,
              variantGroupId: ind.variantGroupId ?? null,
            };
            return {
              indicator,
              code: ind.code ?? [],
              variantCode: ind.variantCode ?? [],
            };
          });
          const after = {
            ...state,
            indicators: [
              ...state.indicators,
              ...created.map((c) => c.indicator),
            ],
          };
          for (const c of created) {
            refuseDuplicateRows(c.indicator.indicatorId, c.code, c.variantCode);
            refuseUnfitIndicator(c.indicator, c.code, c.variantCode, after);
          }
          const newCode = created.flatMap((c) =>
            c.code.map((r) => ({ ...r, indicatorId: c.indicator.indicatorId }))
          );
          const newVariantCode = created.flatMap((c) =>
            c.variantCode.map((r) => ({
              ...r,
              indicatorId: c.indicator.indicatorId,
            }))
          );
          const status = statusOver(
            after,
            after.indicators,
            [...state.code, ...newCode],
            [...state.variantCode, ...newVariantCode],
            created.map((c) => c.indicator.indicatorId),
          );
          const errors = [...status].flatMap(([id, s]) =>
            s.rounds.flatMap((r) =>
              r.issues.filter((i) => isHfaCodeError(i.kind)).map((i) =>
                `${id} ${issueLine(r, i)}`
              )
            )
          );
          if (errors.length > 0) {
            throw new AIToolFailure(
              `Nothing was proposed: the code has errors. Fix them and call again.\n${
                errors.join("\n")
              }`,
            );
          }
          const warnings = [...status].flatMap(([id, s]) =>
            s.rounds.flatMap((r) =>
              r.issues.map((i) => `${id} ${issueLine(r, i)}`)
            )
          );
          const diff = {
            before: "",
            after: created.map((c) =>
              indicatorLayout(
                c.indicator,
                c.code,
                c.variantCode,
                status.get(c.indicator.indicatorId),
                after,
              )
            ).join("\n\n"),
          };
          const preview = {
            title: t3({
              en: "Create HFA indicators",
              fr: "Créer des indicateurs HFA",
              pt: "Criar indicadores HFA",
            }),
            description: t3({
              en: `Create ${countIndicators(created.length)}?`,
              fr: `Créer ${countIndicators(created.length)} ?`,
              pt: `Criar ${countIndicators(created.length)}?`,
            }),
            diff,
          };
          return {
            preview,
            customProposalUI: (signal: AbortSignal) =>
              openProposalDiff(preview, signal),
            commit: async () => {
              const res = await serverActions.batchUploadHfaIndicators({
                indicators: created.map((c) => c.indicator),
                code: newCode,
                variantCode: newVariantCode,
              });
              if (!res.success) {
                throw new AIToolFailure(
                  `Failed to create HFA indicators; nothing was created: ${res.err}`,
                );
              }
              const createdIds = new Set(res.data.createdIndicatorIds);
              return [
                `Created: ${idList(createdIds)}.`,
                ...created
                  .filter((c) => !createdIds.has(c.indicator.indicatorId))
                  .map((c) =>
                    `Not created: ${c.indicator.indicatorId} (${c.indicator.definition}): another save took this id after the proposal.`
                  ),
                ...(warnings.length > 0 ? ["Warnings:", ...warnings] : []),
              ].join("\n");
            },
          };
        },
        presentation: "modal",
      },
      inProgressLabel: t3({
        en: "Proposing new HFA indicators...",
        fr: "Proposition de nouveaux indicateurs HFA...",
        pt: "A propor novos indicadores HFA...",
      }),
      successMessage: t3({
        en: "Not proposed: no indicator to create",
        fr: "Non proposé : aucun indicateur à créer",
        pt: "Não proposto: nenhum indicador a criar",
      }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("update_hfa_indicators"),
      approval: {
        propose: async (input) => {
          const state = await loadWriteState();
          const byId = new Map(state.indicators.map((i) => [i.indicatorId, i]));
          const seen = new Set<string>();
          const merged = input.updates.map((u) => {
            const before = byId.get(u.indicatorId);
            if (before === undefined) {
              throw new AIToolFailure(
                `Unknown indicator "${u.indicatorId}". get_hfa_indicators lists the ids.`,
              );
            }
            if (seen.has(u.indicatorId)) {
              throw new AIToolFailure(
                `Indicator "${u.indicatorId}" is listed twice; give each indicator one entry.`,
              );
            }
            seen.add(u.indicatorId);
            const { indicatorId: _id, ...given } = u;
            if (Object.values(given).every((v) => v === undefined)) {
              throw new AIToolFailure(
                `The entry for "${u.indicatorId}" names no field to change.`,
              );
            }
            return mergeUpdate(u, before, state);
          });
          const changed = merged.filter((m) => m.changed);
          if (changed.length === 0) {
            return {
              skip: "No change: every given field already has the value given.",
            };
          }
          const changedIds = new Set(changed.map((m) => m.after.indicatorId));
          const indicatorsAfter = state.indicators.map((i) =>
            merged.find((m) => m.after.indicatorId === i.indicatorId)?.after ??
              i
          );
          const after = { ...state, indicators: indicatorsAfter };
          for (const m of changed) {
            refuseUnfitIndicator(m.after, m.code, m.variantCode, after);
          }
          const status = statusOver(
            after,
            indicatorsAfter,
            [
              ...state.code.filter((c) => !changedIds.has(c.indicatorId)),
              ...changed.flatMap((m) =>
                m.code.map((r) => ({ ...r, indicatorId: m.after.indicatorId }))
              ),
            ],
            [
              ...state.variantCode.filter((c) =>
                !changedIds.has(c.indicatorId)
              ),
              ...changed.flatMap((m) =>
                m.variantCode.map((r) => ({
                  ...r,
                  indicatorId: m.after.indicatorId,
                }))
              ),
            ],
            changedIds,
          );
          const written = new Map(changed.map((m) => [
            m.after.indicatorId,
            m.writtenFields,
          ]));
          const errors: string[] = [];
          const warnings: string[] = [];
          const leftInPlace: { id: string; line: string; text: string }[] = [];
          for (const [id, s] of status) {
            for (const r of s.rounds) {
              for (const i of r.issues) {
                const writes = written.get(id)?.has(
                  fieldKey(r.timePoint, i.field, i.itemId),
                );
                if (isHfaCodeError(i.kind) && writes) {
                  errors.push(`${id} ${issueLine(r, i)}`);
                } else if (writes) {
                  warnings.push(`${id} ${issueLine(r, i)}`);
                } else {
                  leftInPlace.push({
                    id,
                    line: `${id} ${issueLine(r, i)}`,
                    text: `${id} ${r.timePoint}: ${t3(i.text)}`,
                  });
                }
              }
            }
          }
          if (errors.length > 0) {
            throw new AIToolFailure(
              `Nothing was proposed: the code you wrote has errors. Fix them and call again.\n${
                errors.join("\n")
              }`,
            );
          }
          const statusBefore = statusOver(
            state,
            state.indicators,
            state.code,
            state.variantCode,
            changedIds,
          );
          const preview = {
            title: t3({
              en: "Update HFA indicators",
              fr: "Mettre à jour des indicateurs HFA",
              pt: "Atualizar indicadores HFA",
            }),
            description: [
              t3({
                en: `Apply these changes to ${
                  countIndicators(changed.length)
                }?`,
                fr: `Appliquer ces modifications à ${
                  countIndicators(changed.length)
                } ?`,
                pt: `Aplicar estas alterações a ${
                  countIndicators(changed.length)
                }?`,
              }),
              ...(leftInPlace.length > 0
                ? [
                  "",
                  t3({
                    en: "Issues this change leaves in place:",
                    fr: "Problèmes que cette modification laisse en place :",
                    pt: "Problemas que esta alteração deixa como estão:",
                  }),
                  ...leftInPlace.map((l) => `- ${l.text}`),
                ]
                : []),
            ].join("\n"),
            diff: {
              before: changed.map((m) =>
                indicatorLayout(
                  m.before,
                  m.codeBefore,
                  m.variantCodeBefore,
                  statusBefore.get(m.after.indicatorId),
                  state,
                )
              ).join("\n\n"),
              after: changed.map((m) =>
                indicatorLayout(
                  m.after,
                  m.code,
                  m.variantCode,
                  status.get(m.after.indicatorId),
                  after,
                )
              ).join("\n\n"),
            },
          };
          return {
            preview,
            customProposalUI: (signal: AbortSignal) =>
              openProposalDiff(preview, signal),
            commit: async () => {
              const res = await serverActions.saveHfaIndicatorsBatch({
                indicators: changed.map((m) => ({
                  indicator: m.after,
                  code: m.wroteCode ? m.code : undefined,
                  variantCode: m.wroteVariantCode ? m.variantCode : undefined,
                })),
              });
              if (!res.success) {
                throw new AIToolFailure(
                  `Failed to update HFA indicators; nothing was saved: ${res.err}`,
                );
              }
              return [
                ...merged.flatMap((m) => [
                  `${m.after.indicatorId}:`,
                  ...m.report.map((line) => `  ${line}`),
                ]),
                ...(warnings.length > 0 ? ["Warnings:", ...warnings] : []),
                ...(leftInPlace.length > 0
                  ? ["Issues left in place:", ...leftInPlace.map((l) => l.line)]
                  : []),
              ].join("\n");
            },
          };
        },
        presentation: "modal",
      },
      inProgressLabel: t3({
        en: "Proposing changes to HFA indicators...",
        fr: "Proposition de modifications d'indicateurs HFA...",
        pt: "A propor alterações de indicadores HFA...",
      }),
      successMessage: (input) =>
        t3(plural(input.updates.length, {
          one: {
            en: "Not proposed: the indicator would not change",
            fr: "Non proposé : l'indicateur ne changerait pas",
            pt: "Não proposto: o indicador não mudaria",
          },
          other: {
            en: "Not proposed: the indicators would not change",
            fr: "Non proposé : les indicateurs ne changeraient pas",
            pt: "Não proposto: os indicadores não mudariam",
          },
        })),
    }),

    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("delete_hfa_indicators"),
      approval: {
        propose: async (input) => {
          const ids = [...new Set(input.indicatorIds)];
          const [indicators, allCode, allVariantCode] = await Promise.all([
            loadIndicators(),
            loadAllCode(),
            loadAllVariantCode(),
          ]);
          const existing = new Map(indicators.map((i) => [i.indicatorId, i]));
          const unknown = ids.filter((v) => !existing.has(v));
          if (unknown.length > 0) {
            throw new AIToolFailure(
              `Unknown indicator(s): ${unknown.join(", ")}.`,
            );
          }
          const deleted = new Set(ids);
          const referencing = new Set<string>();
          for (const c of allCode) {
            if (deleted.has(c.indicatorId)) continue;
            const identifiers = [
              ...hfaIndicatorCodeIdentifiers(c.code),
              ...(c.filterCode
                ? hfaIndicatorCodeIdentifiers(c.filterCode)
                : []),
            ];
            if (identifiers.some((id) => deleted.has(id))) {
              referencing.add(c.indicatorId);
            }
          }
          // References living only in variant snippets must warn too: same
          // union as the manager's findReferencingIndicators.
          for (const c of allVariantCode) {
            if (deleted.has(c.indicatorId)) continue;
            if (
              hfaIndicatorCodeIdentifiers(c.code).some((id) => deleted.has(id))
            ) {
              referencing.add(c.indicatorId);
            }
          }
          const referencedBy = [...referencing].sort().join(", ");
          const referencedByNote = referencing.size > 0
            ? "\n\n" + t3({
              en:
                `Referenced by: ${referencedBy} — their code will fail validation.`,
              fr:
                `Référencés par : ${referencedBy} — leur code échouera à la validation.`,
              pt:
                `Referenciados por: ${referencedBy} — o código deles falhará na validação.`,
            })
            : "";
          return {
            preview: {
              title: t3({
                en: "Delete HFA indicators",
                fr: "Supprimer des indicateurs HFA",
                pt: "Eliminar indicadores HFA",
              }),
              description: t3({
                en: `Permanently delete ${countIndicators(ids.length)}?`,
                fr: `Supprimer définitivement ${countIndicators(ids.length)} ?`,
                pt: `Eliminar definitivamente ${countIndicators(ids.length)}?`,
              }) + referencedByNote,
              changes: ids.map((id) => ({
                label: `${id}: ${
                  composeHfaIndicatorLabel(existing.get(id)!, "full")
                }`,
                after: t3({ en: "deleted", fr: "supprimé", pt: "eliminado" }),
              })),
              intent: "danger",
              confirmLabel: t3({
                en: "Delete",
                fr: "Supprimer",
                pt: "Eliminar",
              }),
            },
            commit: async () => {
              const res = await serverActions.deleteHfaIndicators({
                indicatorIds: ids,
              });
              if (!res.success) {
                throw new AIToolFailure(
                  `Failed to delete HFA indicators: ${res.err}`,
                );
              }
              return [
                `Deleted: ${idList(ids)}.`,
                ...(referencing.size > 0
                  ? [
                    `Still referenced by: ${referencedBy}; their code names a deleted indicator.`,
                  ]
                  : []),
              ].join("\n");
            },
          };
        },
        presentation: "modal",
      },
      inProgressLabel: t3({
        en: "Proposing to delete HFA indicators...",
        fr: "Proposition de supprimer des indicateurs HFA...",
        pt: "A propor eliminar indicadores HFA...",
      }),
      successMessage: t3({
        en: "Not proposed: no indicator to delete",
        fr: "Non proposé : aucun indicateur à supprimer",
        pt: "Não proposto: nenhum indicador a eliminar",
      }),
    }),
  ];
}
