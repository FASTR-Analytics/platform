import {
  AIToolFailure,
  createAITool,
  foldString,
  matchesSearch,
  openComponent,
  type ProposalPreview,
  searchTokens,
} from "panther";
import { z } from "zod";
import {
  type APIResponseWithData,
  composeHfaIndicatorLabel,
  composeHfaVariantColumnName,
  COPILOT_TOOL_VIEWS,
  formatHfaIndicatorDetailsForAI,
  formatHfaIndicatorListForAI,
  formatHfaVariableDetailsForAI,
  formatHfaVariableListForAI,
  getHfaIndicatorMeasure,
  HFA_STRUCTURAL_VARIABLE_IDS,
  type HfaDictionaryForValidation,
  type HfaFieldIssue,
  type HfaIndicator,
  type HfaIndicatorCode,
  hfaIndicatorCodeIdentifiers,
  hfaIndicatorCodeSchema,
  hfaIndicatorEditSchema,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
  type HfaIndicatorStatus,
  type HfaIndicatorVariantCode,
  hfaIndicatorVariantCodeSchema,
  type HfaTaxonomyInput,
  type HfaVariableRow,
  hfaVariableUsage,
  isHfaCodeError,
  isReservedHfaId,
  nextHfaIndicatorId,
  t3,
  type TranslatableString,
} from "lib";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  getDatasetHfaDisplayInfoFromCacheOrFetch,
  getHfaDictionaryFromCacheOrFetch,
} from "~/state/instance/t2_datasets";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { HfaProposalDiff } from "./proposal_diff.tsx";

// The indicators, the taxonomy and the code are read fresh on every call so
// the AI acts on current state, its own earlier writes included; the survey
// dictionary and the dataset display read through the T2 caches the manager
// uses, keyed on the instance's HFA cache hash.

async function loadIndicators(): Promise<HfaIndicator[]> {
  const res = await serverActions.getHfaIndicators({});
  if (!res.success) {
    throw new AIToolFailure(`Could not load HFA indicators: ${res.err}`);
  }
  return res.data;
}

async function loadTaxonomy(): Promise<HfaTaxonomyInput> {
  const [categories, subCategories, serviceCategories, groups, items] =
    await Promise.all([
      serverActions.getHfaIndicatorCategories({}),
      serverActions.getHfaIndicatorSubCategories({}),
      serverActions.getHfaIndicatorServiceCategories({}),
      serverActions.getHfaIndicatorVariantGroups({}),
      serverActions.getHfaIndicatorVariantItems({}),
    ]);
  const data = <T>(res: APIResponseWithData<T>): T => {
    if (!res.success) {
      throw new AIToolFailure(`Could not load the HFA taxonomy: ${res.err}`);
    }
    return res.data;
  };
  return {
    categories: data(categories),
    subCategories: data(subCategories),
    serviceCategories: data(serviceCategories),
    variantGroups: data(groups),
    variantItems: data(items),
  };
}

async function loadDictionary(): Promise<HfaDictionaryForValidation> {
  const res = await getHfaDictionaryFromCacheOrFetch(
    instanceState.hfaCacheHash,
  );
  if (!res.success) {
    throw new AIToolFailure(
      `Could not load the HFA survey variable dictionary: ${res.err}`,
    );
  }
  return res.data;
}

async function loadAllCode(): Promise<HfaIndicatorCode[]> {
  const res = await serverActions.getAllHfaIndicatorCode({});
  if (!res.success) {
    throw new AIToolFailure(`Could not load HFA indicator code: ${res.err}`);
  }
  return res.data;
}

async function loadAllVariantCode(): Promise<HfaIndicatorVariantCode[]> {
  const res = await serverActions.getAllHfaIndicatorVariantCode({});
  if (!res.success) {
    throw new AIToolFailure(
      `Could not load HFA indicator variant code: ${res.err}`,
    );
  }
  return res.data;
}

// The display rows need `can_view_data`, which the reads do not: without it
// the formatters print one line saying the counts are left out.
export async function loadDisplayRows(): Promise<HfaVariableRow[] | undefined> {
  if (!instanceState.currentUserPermissions.can_view_data) return undefined;
  const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(
    instanceState.hfaCacheHash,
  );
  if (!res.success) {
    throw new AIToolFailure(
      `Could not load the HFA dataset's variable counts: ${res.err}`,
    );
  }
  return res.data.rows;
}

async function loadReadInput(
  withDisplayRows: boolean,
): Promise<HfaIndicatorsForAIInput> {
  const [indicators, taxonomy, code, variantCode, dictionary, displayRows] =
    await Promise.all([
      loadIndicators(),
      loadTaxonomy(),
      loadAllCode(),
      loadAllVariantCode(),
      loadDictionary(),
      withDisplayRows ? loadDisplayRows() : Promise.resolve(undefined),
    ]);
  return {
    indicators,
    taxonomy,
    code,
    variantCode,
    dictionary,
    displayRows,
    status: hfaIndicatorsStatus({
      indicators,
      code,
      variantCode,
      variantItems: taxonomy.variantItems,
      dictionary,
    }),
  };
}

const DETAIL_CAP = 20;

function refuseOverCap(ids: string[], what: string): void {
  if (ids.length > DETAIL_CAP) {
    throw new AIToolFailure(
      `At most ${DETAIL_CAP} ${what} per call; ${ids.length} were given. Split the ids across calls.`,
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
  return t3({
    en: `${n} indicator(s)`,
    fr: `${n} indicateur(s)`,
    pt: `${n} indicador(es)`,
  });
}

// The write tools' inputs derive from the contract's schemas: a round of main
// code, a variant row, and the indicator's own fields.
const codeRoundSchema = hfaIndicatorCodeSchema.omit({ indicatorId: true });
const variantRowSchema = hfaIndicatorVariantCodeSchema.omit({
  indicatorId: true,
});
const field = hfaIndicatorEditSchema.shape;

const updateEntrySchema = z.object({
  indicatorId: z.string(),
  shortLabel: field.shortLabel.optional(),
  definition: field.definition.optional().describe("Long label."),
  type: field.type.optional(),
  aggregation: field.aggregation.optional(),
  categoryId: field.categoryId.optional().describe(
    "Category id, null to clear.",
  ),
  subCategoryId: field.subCategoryId.optional().describe(
    "Sub-category id within the category, null to clear.",
  ),
  serviceCategoryIds: field.serviceCategoryIds.optional().describe(
    "The full set of service-category ids.",
  ),
  variantGroupId: field.variantGroupId.optional().describe(
    "Variant group id, null to clear.",
  ),
  code: z.array(codeRoundSchema.partial({ rCode: true })).min(1).optional()
    .describe("Rounds to patch; a round not listed is kept."),
  variantCode: z.array(variantRowSchema).min(1).optional().describe(
    "Variant rows to set; an empty rCode removes the row.",
  ),
});

type CodeRound = z.infer<typeof codeRoundSchema>;
type VariantRow = z.infer<typeof variantRowSchema>;

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
  code: CodeRound[],
  variantCode: VariantRow[],
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
  return `${r.timePoint} ${
    i.itemId === undefined ? i.field : `variant ${i.itemId}`
  } (${i.kind}): ${i.text.en}`;
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
  code: CodeRound[],
  variantCode: VariantRow[],
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
    if (!main?.rCode.trim() && !main?.rFilterCode?.trim() && !variants.length) {
      continue;
    }
    const warnings = status?.rounds.find((r) => r.timePoint === tp)?.issues
      .filter((i) => i.kind === "result_type")
      .map((i) => t3(i.text)) ?? [];
    lines.push(
      `  ${tp}: ${main?.rCode.trim() ?? ""}${
        warnings.length ? `   (${warnings.join("; ")})` : ""
      }`,
    );
    if (main?.rFilterCode?.trim()) {
      lines.push(
        `    ${
          t3({ en: "filter", fr: "filtre", pt: "filtro" })
        }: ${main.rFilterCode.trim()}`,
      );
    }
    for (const v of variants) {
      lines.push(`    ${v.itemId}: ${v.rCode.trim()}`);
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

type UpdateEntry = z.infer<typeof updateEntrySchema>;

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
  keyof UpdateEntry & keyof HfaIndicator,
  TranslatableString,
])[];

function scalarText(value: string | string[] | null): string {
  return Array.isArray(value) ? `[${value.join(", ")}]` : value ?? "(none)";
}

function firstDuplicate(keys: string[]): string | undefined {
  const seen = new Set<string>();
  return keys.find((k) => seen.has(k) || !seen.add(k));
}

function codeKey(code: CodeRound[], variantCode: VariantRow[]): string {
  return JSON.stringify([
    code.map((c) => [c.timePoint, c.rCode.trim(), c.rFilterCode?.trim() ?? ""])
      .sort(),
    variantCode.map((v) => [v.timePoint, v.itemId, v.rCode.trim()]).sort(),
  ]);
}

function refuseDuplicateRows(
  id: string,
  code: { timePoint: string }[],
  variantCode: VariantRow[],
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
function mergeUpdate(u: UpdateEntry, before: HfaIndicator, state: WriteState) {
  const id = before.indicatorId;
  refuseDuplicateRows(id, u.code ?? [], u.variantCode ?? []);
  const codeBefore: CodeRound[] = state.code
    .filter((c) => c.indicatorId === id)
    .map((c) => ({
      timePoint: c.timePoint,
      rCode: c.rCode,
      rFilterCode: c.rFilterCode,
    }));
  const variantCodeBefore: VariantRow[] = state.variantCode
    .filter((c) => c.indicatorId === id)
    .map((c) => ({ timePoint: c.timePoint, itemId: c.itemId, rCode: c.rCode }));

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
    if (r.rCode === undefined && r.rFilterCode === undefined) {
      throw new AIToolFailure(
        `${id}: round "${r.timePoint}" names neither rCode nor rFilterCode.`,
      );
    }
    const round = rounds.get(r.timePoint) ??
      { timePoint: r.timePoint, rCode: "" };
    if (r.rCode !== undefined) {
      round.rCode = r.rCode;
      writtenFields.add(`${r.timePoint}|rCode|`);
    }
    if (r.rFilterCode !== undefined) {
      round.rFilterCode = r.rFilterCode || undefined;
      writtenFields.add(`${r.timePoint}|rFilterCode|`);
    }
    // Clearing a round's code orphans its variant rows, so the call writes
    // them too and their errors refuse it.
    if (r.rCode !== undefined && !r.rCode.trim()) {
      for (const v of variantCodeBefore) {
        if (v.timePoint === r.timePoint) {
          writtenFields.add(`${r.timePoint}|variantCode|${v.itemId}`);
        }
      }
    }
    if (
      (r.rCode === "" && !r.rFilterCode) ||
      (!round.rCode.trim() && !round.rFilterCode?.trim())
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
    if (v.rCode.trim() === "") rows.delete(key);
    else rows.set(key, v);
    writtenFields.add(`${v.timePoint}|variantCode|${v.itemId}`);
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
  const roundText = (c: CodeRound | undefined) =>
    c === undefined
      ? "(none)"
      : c.rFilterCode?.trim()
      ? `${c.rCode.trim()} [filter: ${c.rFilterCode.trim()}]`
      : c.rCode.trim();
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
    )?.rCode.trim() ?? "(none)";
    const a = rows.get(`${v.timePoint}|${v.itemId}`)?.rCode.trim() ?? "(none)";
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
// them refuses at the call through the chat's guard, under
// `canWriteHfaIndicators()` for the writes.

export function buildHfaIndicatorTools() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_hfa_indicators",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_indicators,
      description:
        "List HFA indicators, one line each: id, long label, type and aggregation, category, sub-category and service categories, variant group, rounds with code, round status and whether the rounds agree, under the taxonomy (categories, sub-categories, service categories, variant groups and items, each id: label). The ids it prints are what every other HFA tool takes. Filter rather than list everything: the default workbook holds hundreds of indicators. Filtering by status also prints each round's issues. The search reads labels and ids, not code: to find the indicators whose code names a variable, read that variable with get_hfa_variable_details.",
      kind: "read",
      inputSchema: z.object({
        search: z.string().optional().describe(
          "Only indicators whose id, short and long labels and category, sub-category and service-category labels together contain every word of this text, in any order (case- and accent-insensitive).",
        ),
        categoryId: z.string().optional().describe(
          "Only indicators in this category id.",
        ),
        serviceCategoryId: z.string().optional().describe(
          "Only indicators that include this service-category id.",
        ),
        status: z.enum(["error", "warning", "inconsistent", "none"])
          .optional()
          .describe(
            "error: some round has an error. warning: some round has a warning and none an error. inconsistent: the rounds' code differs. none: no round has code.",
          ),
        missingCategory: z.boolean().optional().describe(
          "Only indicators with no category assigned.",
        ),
        missingShortLabel: z.boolean().optional().describe(
          "Only indicators with an empty short label.",
        ),
      }),
      handler: async (input) => {
        const read = await loadReadInput(false);
        const tokens = searchTokens(input.search ?? "");
        const labels = taxonomyLabels(read.taxonomy);
        const listed = read.indicators.filter((ind) =>
          (input.categoryId === undefined ||
            ind.categoryId === input.categoryId) &&
          (input.serviceCategoryId === undefined ||
            ind.serviceCategoryIds.includes(input.serviceCategoryId)) &&
          (input.status === undefined ||
            matchesStatus(read.status.get(ind.indicatorId), input.status)) &&
          (!input.missingCategory || ind.categoryId === null) &&
          (!input.missingShortLabel || ind.shortLabel.trim() === "") &&
          matchesSearch(foldString(indicatorSearchText(ind, labels)), tokens)
        );
        return formatHfaIndicatorListForAI(read, listed, {
          withIssues: input.status !== undefined,
        });
      },
      inProgressLabel: () =>
        t3({
          en: "Reading HFA indicators...",
          fr: "Lecture des indicateurs HFA...",
          pt: "A ler os indicadores HFA...",
        }),
      completionMessage: () =>
        t3({
          en: "Read HFA indicators",
          fr: "Indicateurs HFA lus",
          pt: "Indicadores HFA lidos",
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "get_hfa_indicator_details",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_indicator_details,
      description:
        `Read HFA indicators in full, up to ${DETAIL_CAP} per call: both labels, the measure, type and aggregation, categories, the variant group and its items, and per round the code, the filter, each item's variant code, the round status and its issues. Then, once for the whole set, every survey variable the code names (per round its label, type, options with their sentinel class, and the facility counts and values present) and every other indicator the code names (its code and status per round). Use it to judge whether an indicator's code measures what its labels say.`,
      kind: "read",
      inputSchema: z.object({
        indicatorIds: z.array(z.string()).min(1).describe(
          "The indicator ids to read, as get_hfa_indicators prints them.",
        ),
      }),
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
      inProgressLabel: () =>
        t3({
          en: "Reading HFA indicator details...",
          fr: "Lecture du détail des indicateurs HFA...",
          pt: "A ler o detalhe dos indicadores HFA...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Read ${
            countIndicators(new Set(input.indicatorIds).size)
          } in detail`,
          fr: `${
            countIndicators(new Set(input.indicatorIds).size)
          } lu(s) en détail`,
          pt: `${
            countIndicators(new Set(input.indicatorIds).size)
          } lido(s) em detalhe`,
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "get_hfa_variables",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_variables,
      description:
        "List the HFA survey variables, one line each: id, label and type, and per round it is in, how many indicators' code of that round names it. Filter rather than list everything: a survey has hundreds of variables. To see a variable's options, counts and values, and which indicators name it, use get_hfa_variable_details.",
      kind: "read",
      inputSchema: z.object({
        search: z.string().optional().describe(
          "Only variables whose id and labels together contain every word of this text, in any order (case- and accent-insensitive).",
        ),
        timePoint: z.string().optional().describe(
          "Only variables in this round.",
        ),
        unusedOnly: z.boolean().optional().describe(
          "Only variables that no indicator's code names in some round they are in (in the given round, when one is given). Structural columns are never listed.",
        ),
      }),
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
        return formatHfaVariableListForAI(read, ids);
      },
      inProgressLabel: () =>
        t3({
          en: "Reading the HFA survey variables...",
          fr: "Lecture des variables de l'enquête HFA...",
          pt: "A ler as variáveis do inquérito HFA...",
        }),
      completionMessage: () =>
        t3({
          en: "Read the HFA survey variables",
          fr: "Variables de l'enquête HFA lues",
          pt: "Variáveis do inquérito HFA lidas",
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "get_hfa_variable_details",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_variable_details,
      description:
        `Read HFA survey variables in full, up to ${DETAIL_CAP} per call: per round the label and type, the options (code: label, with the sentinel class of a don't-know, refused, other, not-applicable or question-specific code, and a mark on a text code, which the run reads as missing), the facilities with a row, blank and non-blank, the values present, and the indicators whose code names it. Read a variable here before comparing it to a code.`,
      kind: "read",
      inputSchema: z.object({
        variableIds: z.array(z.string()).min(1).describe(
          "The survey variable ids to read.",
        ),
        timePoint: z.string().optional().describe(
          "Only this round.",
        ),
      }),
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
      inProgressLabel: (input) =>
        t3({
          en: `Reading ${[...new Set(input.variableIds)].join(", ")}...`,
          fr: `Lecture de ${[...new Set(input.variableIds)].join(", ")}...`,
          pt: `A ler ${[...new Set(input.variableIds)].join(", ")}...`,
        }),
      completionMessage: () =>
        t3({
          en: "Read HFA variable details",
          fr: "Détail des variables HFA lu",
          pt: "Detalhe das variáveis HFA lido",
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "create_hfa_indicators",
      availableIn: COPILOT_TOOL_VIEWS.create_hfa_indicators,
      description:
        'Create new HFA indicators, in a batch. For each: the long label (definition), an optional short label, type and aggregation (usually binary and avg, "% of facilities"), optional category, sub-category and service categories, an optional variant group, per-round code (rCode and an optional rFilterCode) and, for a variant group, per-round code for each item. The app assigns each id and returns it. Every id is checked against the taxonomy and the rounds, and code with an error (syntax, unknown variable, a filter or variant code without code, a cycle) is refused before anything is proposed; a result-type mismatch is a warning. The user confirms the batch in a dialog.',
      kind: "write",
      inputSchema: z.object({
        indicators: z.array(z.object({
          definition: field.definition.describe(
            "Long label: the full descriptive text.",
          ),
          shortLabel: field.shortLabel.optional().describe(
            "Short label for dense charts.",
          ),
          type: field.type,
          aggregation: field.aggregation,
          categoryId: field.categoryId.optional(),
          subCategoryId: field.subCategoryId.optional().describe(
            "Must belong to the category.",
          ),
          serviceCategoryIds: field.serviceCategoryIds.optional(),
          variantGroupId: field.variantGroupId.optional(),
          code: z.array(codeRoundSchema).optional().describe(
            "Per-round code. Keep it identical across rounds unless the survey changed.",
          ),
          variantCode: z.array(variantRowSchema).optional().describe(
            "Per-round code for each item of the variant group; the round's filter applies to every item.",
          ),
        })).min(1),
      }),
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
      inProgressLabel: () =>
        t3({
          en: "Proposing new HFA indicators...",
          fr: "Proposition de nouveaux indicateurs HFA...",
          pt: "A propor novos indicadores HFA...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Create ${countIndicators(input.indicators.length)}`,
          fr: `Créer ${countIndicators(input.indicators.length)}`,
          pt: `Criar ${countIndicators(input.indicators.length)}`,
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "update_hfa_indicators",
      availableIn: COPILOT_TOOL_VIEWS.update_hfa_indicators,
      description:
        "Change existing HFA indicators, in a batch: any of the labels, type, aggregation, category, sub-category, service categories, variant group, per-round code and per-item variant code, in one call. Give only the fields to change. Code is patched: a round or variant row not listed is kept; in a listed round an omitted rCode or rFilterCode is kept and an empty string clears it; clearing rCode removes the round's code; a variant row with an empty rCode is removed. Changing the category clears a sub-category that no longer fits; changing the variant group drops the previous group's variant code. Ids are checked against the taxonomy and the rounds, and code you write with an error is refused before anything is proposed. The user confirms the batch in a dialog.",
      kind: "write",
      inputSchema: z.object({
        updates: z.array(updateEntrySchema).min(1),
      }),
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
          const fieldKey = (tp: string, i: HfaFieldIssue) =>
            `${tp}|${i.field}|${i.itemId ?? ""}`;
          const errors: string[] = [];
          const warnings: string[] = [];
          const leftInPlace: { id: string; line: string; text: string }[] = [];
          for (const [id, s] of status) {
            for (const r of s.rounds) {
              for (const i of r.issues) {
                if (
                  isHfaCodeError(i.kind) &&
                  written.get(id)?.has(fieldKey(r.timePoint, i))
                ) {
                  errors.push(`${id} ${issueLine(r, i)}`);
                } else if (written.get(id)?.has(fieldKey(r.timePoint, i))) {
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
      inProgressLabel: () =>
        t3({
          en: "Proposing HFA indicator changes...",
          fr: "Proposition de modifications d'indicateurs HFA...",
          pt: "A propor alterações de indicadores HFA...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Changes for ${countIndicators(input.updates.length)}`,
          fr: `Modifications pour ${countIndicators(input.updates.length)}`,
          pt: `Alterações para ${countIndicators(input.updates.length)}`,
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "delete_hfa_indicators",
      availableIn: COPILOT_TOOL_VIEWS.delete_hfa_indicators,
      description:
        "Permanently delete HFA indicators by indicator id (and their indicator code). Use with care.",
      kind: "write",
      inputSchema: z.object({ indicatorIds: z.array(z.string()).min(1) }),
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
              ...hfaIndicatorCodeIdentifiers(c.rCode),
              ...(c.rFilterCode
                ? hfaIndicatorCodeIdentifiers(c.rFilterCode)
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
              hfaIndicatorCodeIdentifiers(c.rCode).some((id) => deleted.has(id))
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
      inProgressLabel: () =>
        t3({
          en: "Proposing deletion...",
          fr: "Proposition de suppression...",
          pt: "A propor a eliminação...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Delete ${countIndicators(new Set(input.indicatorIds).size)}`,
          fr: `Supprimer ${countIndicators(new Set(input.indicatorIds).size)}`,
          pt: `Eliminar ${countIndicators(new Set(input.indicatorIds).size)}`,
        }),
    }),
  ];
}
