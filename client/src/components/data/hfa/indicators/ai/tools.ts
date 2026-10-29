import {
  AIToolFailure,
  createAITool,
  foldString,
  matchesSearch,
  searchTokens,
} from "panther";
import { z } from "zod";
import {
  type APIResponseWithData,
  COPILOT_TOOL_VIEWS,
  formatHfaIndicatorDetailsForAI,
  formatHfaIndicatorListForAI,
  formatHfaVariableDetailsForAI,
  formatHfaVariableListForAI,
  HFA_STRUCTURAL_VARIABLE_IDS,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCode,
  hfaIndicatorCodeIdentifiers,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
  type HfaIndicatorStatus,
  type HfaIndicatorVariantCode,
  type HfaTaxonomyInput,
  type HfaVariableRow,
  hfaVariableUsage,
  nextHfaIndicatorId,
  serialiseMultiMembershipValues,
  t3,
} from "lib";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  getDatasetHfaDisplayInfoFromCacheOrFetch,
  getHfaDictionaryFromCacheOrFetch,
} from "~/state/instance/t2_datasets";
import { copilotViews } from "~/components/instance/copilot/mod.ts";

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
async function loadDisplayRows(): Promise<HfaVariableRow[] | undefined> {
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

// Everything an HFA read prints, read fresh but for the dictionary and the
// display rows, which come through the manager's T2 caches.
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

// Apply a set of fully-merged indicators (read-modify-write: the bulk route
// takes whole objects). Transactional server-side: all applied or none.
async function applyIndicatorUpdates(merged: HfaIndicator[]): Promise<void> {
  const res = await serverActions.updateHfaIndicatorsBulk({
    indicators: merged,
  });
  if (!res.success) {
    throw new AIToolFailure(
      `Failed to apply the ${merged.length} HFA indicator update(s); nothing was saved: ${res.err}`,
    );
  }
}

type CodeRound = { timePoint: string; rCode: string; rFilterCode?: string };

// What the user sees in a preview. Everything a tool returns to the model
// stays English; everything the approval modal or the chat timeline shows the
// user goes through t3.
function formatCodeRound(round: CodeRound): string {
  return round.rFilterCode?.trim()
    ? `${round.rCode}  [${
      t3({ en: "filter", fr: "filtre", pt: "filtro" })
    }: ${round.rFilterCode}]`
    : round.rCode;
}

function describeAssignment(indicator: HfaIndicator): string {
  const none = "—";
  return t3({
    en: `category: ${indicator.categoryId ?? none}, sub: ${
      indicator.subCategoryId ?? none
    }, services: [${indicator.serviceCategoryIds.join(", ") || none}]`,
    fr: `catégorie : ${indicator.categoryId ?? none}, sous-catégorie : ${
      indicator.subCategoryId ?? none
    }, services : [${indicator.serviceCategoryIds.join(", ") || none}]`,
    pt: `categoria: ${indicator.categoryId ?? none}, subcategoria: ${
      indicator.subCategoryId ?? none
    }, serviços: [${indicator.serviceCategoryIds.join(", ") || none}]`,
  });
}

function countIndicators(n: number): string {
  return t3({
    en: `${n} indicator(s)`,
    fr: `${n} indicateur(s)`,
    pt: `${n} indicador(es)`,
  });
}

async function loadVariantItems() {
  return (await loadTaxonomy()).variantItems;
}

// The status core's verdict per indicator of `only`, as the tools report it:
// whether any round has an error, whether the rounds agree, and each issue
// as an English line.
function validateIndicators(input: {
  indicators: HfaIndicator[];
  code: HfaIndicatorCode[];
  variantCode: HfaIndicatorVariantCode[];
  variantItems: { id: string; groupId: string }[];
  dictionary: HfaDictionaryForValidation;
  only: ReadonlySet<string>;
}): Map<
  string,
  { hasErrors: boolean; codeConsistent: boolean; issues: string[] }
> {
  const status = hfaIndicatorsStatus(input);
  return new Map(
    [...status].map(([id, s]) => [id, {
      hasErrors: s.rounds.some((r) => r.status === "error"),
      codeConsistent: s.consistent,
      issues: s.rounds.flatMap((r) =>
        r.issues.map((i) =>
          `${r.timePoint} ${
            i.itemId === undefined ? i.field : `variant ${i.itemId}`
          }: ${i.text.en}`
        )
      ),
    }]),
  );
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
        refuseOverCap(input.indicatorIds, "indicators");
        const read = await loadReadInput(true);
        const known = new Set(read.indicators.map((i) => i.indicatorId));
        const unknown = input.indicatorIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          throw new AIToolFailure(
            `Unknown indicator id(s): ${
              unknown.join(", ")
            }. get_hfa_indicators lists the ids.`,
          );
        }
        return formatHfaIndicatorDetailsForAI(read, input.indicatorIds);
      },
      inProgressLabel: () =>
        t3({
          en: "Reading HFA indicator details...",
          fr: "Lecture du détail des indicateurs HFA...",
          pt: "A ler o detalhe dos indicadores HFA...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Read ${countIndicators(input.indicatorIds.length)} in detail`,
          fr: `${countIndicators(input.indicatorIds.length)} lu(s) en détail`,
          pt: `${
            countIndicators(input.indicatorIds.length)
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
        refuseOverCap(input.variableIds, "variables");
        const read = await loadReadInput(true);
        refuseUnknownTimePoint(input.timePoint, read.dictionary);
        return formatHfaVariableDetailsForAI(
          read,
          input.variableIds,
          input.timePoint,
        );
      },
      inProgressLabel: (input) =>
        t3({
          en: `Reading ${input.variableIds.join(", ")}...`,
          fr: `Lecture de ${input.variableIds.join(", ")}...`,
          pt: `A ler ${input.variableIds.join(", ")}...`,
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
      name: "update_hfa_indicator_labels",
      availableIn: COPILOT_TOOL_VIEWS.update_hfa_indicator_labels,
      description:
        "Set the short label and/or long label (definition) of existing HFA indicators, in a batch. Only the fields you provide change. The short label is used in dense chart contexts; the long label is the full descriptive text. Does NOT change measurement, categorisation, or indicator code.",
      kind: "write",
      inputSchema: z.object({
        updates: z.array(z.object({
          indicatorId: z.string(),
          shortLabel: z.string().optional().describe(
            "New short label (omit to leave unchanged).",
          ),
          definition: z.string().optional().describe(
            "New long label / definition (omit to leave unchanged).",
          ),
        })).min(1),
      }),
      approval: {
        propose: async (input) => {
          const byIndicatorId = new Map(
            (await loadIndicators()).map((i) => [i.indicatorId, i]),
          );
          const merged: HfaIndicator[] = [];
          const edits: {
            indicatorId: string;
            field: "short label" | "long label";
            before: string;
            after: string;
          }[] = [];
          for (const u of input.updates) {
            const cur = byIndicatorId.get(u.indicatorId);
            if (!cur) {
              throw new AIToolFailure(`Unknown indicator "${u.indicatorId}".`);
            }
            const next = { ...cur };
            if (u.shortLabel !== undefined && u.shortLabel !== cur.shortLabel) {
              edits.push({
                indicatorId: u.indicatorId,
                field: "short label",
                before: cur.shortLabel,
                after: u.shortLabel,
              });
              next.shortLabel = u.shortLabel;
            }
            if (u.definition !== undefined && u.definition !== cur.definition) {
              edits.push({
                indicatorId: u.indicatorId,
                field: "long label",
                before: cur.definition,
                after: u.definition,
              });
              next.definition = u.definition;
            }
            if (
              next.shortLabel !== cur.shortLabel ||
              next.definition !== cur.definition
            ) {
              merged.push(next);
            }
          }
          if (edits.length === 0) {
            return {
              skip: "No changes — provided values match the current labels.",
            };
          }
          const fieldLabel = (field: "short label" | "long label") =>
            field === "short label"
              ? t3({
                en: "short label",
                fr: "libellé court",
                pt: "rótulo curto",
              })
              : t3({
                en: "long label",
                fr: "libellé long",
                pt: "rótulo longo",
              });
          return {
            preview: {
              title: t3({
                en: "Apply label changes",
                fr: "Appliquer les modifications de libellés",
                pt: "Aplicar as alterações de rótulos",
              }),
              description: t3({
                en: `Apply these label changes to ${
                  countIndicators(merged.length)
                }?`,
                fr: `Appliquer ces modifications de libellés à ${
                  countIndicators(merged.length)
                } ?`,
                pt: `Aplicar estas alterações de rótulos a ${
                  countIndicators(merged.length)
                }?`,
              }),
              changes: edits.map((e) => ({
                label: `${e.indicatorId} — ${fieldLabel(e.field)}`,
                before: e.before,
                after: e.after,
              })),
            },
            commit: async () => {
              await applyIndicatorUpdates(merged);
              return {
                applied: true,
                indicatorsUpdated: merged.length,
                changes: edits.map((e) =>
                  `${e.indicatorId} ${e.field}: "${e.before}" → "${e.after}"`
                ),
              };
            },
          };
        },
        presentation: "modal",
      },
      inProgressLabel: () =>
        t3({
          en: "Proposing label changes...",
          fr: "Proposition de modifications de libellés...",
          pt: "A propor alterações de rótulos...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Label changes for ${countIndicators(input.updates.length)}`,
          fr: `Modifications de libellés pour ${
            countIndicators(input.updates.length)
          }`,
          pt: `Alterações de rótulos para ${
            countIndicators(input.updates.length)
          }`,
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "assign_hfa_indicator_categories",
      availableIn: COPILOT_TOOL_VIEWS.assign_hfa_indicator_categories,
      description:
        "Assign or clear the category, sub-category, and/or service categories of existing HFA indicators, in a batch. Only the fields you provide change. Use null to clear a category or sub-category. All ids are validated against the live taxonomy, which get_hfa_indicators prints.",
      kind: "write",
      inputSchema: z.object({
        updates: z.array(z.object({
          indicatorId: z.string(),
          categoryId: z.string().nullable().optional().describe(
            "Category id, null to clear, omit to leave unchanged.",
          ),
          subCategoryId: z.string().nullable().optional().describe(
            "Sub-category id (must belong to the category), null to clear, omit to leave unchanged.",
          ),
          serviceCategoryIds: z.array(z.string()).optional().describe(
            "Full replacement set of service-category ids (omit to leave unchanged).",
          ),
        })).min(1),
      }),
      approval: {
        propose: async (input) => {
          const byIndicatorId = new Map(
            (await loadIndicators()).map((i) => [i.indicatorId, i]),
          );
          const { categories, subCategories, serviceCategories } =
            await loadTaxonomy();
          const catIds = new Set(categories.map((c) => c.id));
          const subById = new Map(subCategories.map((s) => [s.id, s]));
          const svcIds = new Set(serviceCategories.map((s) => s.id));

          const merged: HfaIndicator[] = [];
          const changes: { label: string; before: string; after: string }[] =
            [];
          for (const u of input.updates) {
            const cur = byIndicatorId.get(u.indicatorId);
            if (!cur) {
              throw new AIToolFailure(`Unknown indicator "${u.indicatorId}".`);
            }
            const next = { ...cur };

            if (u.categoryId !== undefined) {
              if (u.categoryId !== null && !catIds.has(u.categoryId)) {
                throw new AIToolFailure(
                  `Category "${u.categoryId}" does not exist. Valid category ids: ${
                    [...catIds].join(", ") || "(none)"
                  }.`,
                );
              }
              next.categoryId = u.categoryId;
            }
            if (u.subCategoryId !== undefined) {
              if (u.subCategoryId !== null) {
                const sub = subById.get(u.subCategoryId);
                if (!sub) {
                  throw new AIToolFailure(
                    `Sub-category "${u.subCategoryId}" does not exist. Valid sub-category ids: ${
                      [...subById.keys()].join(", ") || "(none)"
                    }.`,
                  );
                }
                if (sub.categoryId !== next.categoryId) {
                  throw new AIToolFailure(
                    `Sub-category "${u.subCategoryId}" belongs to category "${sub.categoryId}", but "${u.indicatorId}" is in category "${
                      next.categoryId ?? "(none)"
                    }". Set a matching category first.`,
                  );
                }
              }
              next.subCategoryId = u.subCategoryId;
            }
            if (u.serviceCategoryIds !== undefined) {
              const bad = u.serviceCategoryIds.filter((id) => !svcIds.has(id));
              if (bad.length > 0) {
                throw new AIToolFailure(
                  `Service categories do not exist: ${
                    bad.join(", ")
                  }. Valid service-category ids: ${
                    [...svcIds].join(", ") || "(none)"
                  }.`,
                );
              }
              next.serviceCategoryIds = u.serviceCategoryIds;
            }

            // Match the editor's invariant: a sub-category must belong to the
            // indicator's category. If the category changed and the kept
            // sub-category no longer fits, clear it rather than persist an orphan.
            if (next.subCategoryId !== null) {
              const sub = subById.get(next.subCategoryId);
              if (!sub || sub.categoryId !== next.categoryId) {
                next.subCategoryId = null;
              }
            }

            const changed = next.categoryId !== cur.categoryId ||
              next.subCategoryId !== cur.subCategoryId ||
              serialiseMultiMembershipValues(next.serviceCategoryIds) !==
                serialiseMultiMembershipValues(cur.serviceCategoryIds);
            if (changed) {
              changes.push({
                label: u.indicatorId,
                before: describeAssignment(cur),
                after: describeAssignment(next),
              });
              merged.push(next);
            }
          }
          if (merged.length === 0) {
            return {
              skip:
                "No changes — provided assignments match the current state.",
            };
          }
          return {
            preview: {
              title: t3({
                en: "Apply category changes",
                fr: "Appliquer les modifications de catégories",
                pt: "Aplicar as alterações de categorias",
              }),
              description: t3({
                en: `Apply these category assignments to ${
                  countIndicators(merged.length)
                }?`,
                fr: `Appliquer ces affectations de catégories à ${
                  countIndicators(merged.length)
                } ?`,
                pt: `Aplicar estas atribuições de categorias a ${
                  countIndicators(merged.length)
                }?`,
              }),
              changes,
            },
            commit: async () => {
              await applyIndicatorUpdates(merged);
              return {
                applied: true,
                indicatorsUpdated: merged.length,
                changes: merged.map((m) =>
                  `${m.indicatorId} → category: ${
                    m.categoryId ?? "none"
                  }, sub: ${m.subCategoryId ?? "none"}, services: [${
                    m.serviceCategoryIds.join(", ")
                  }]`
                ),
              };
            },
          };
        },
        presentation: "modal",
      },
      inProgressLabel: () =>
        t3({
          en: "Proposing category changes...",
          fr: "Proposition de modifications de catégories...",
          pt: "A propor alterações de categorias...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Category changes for ${countIndicators(input.updates.length)}`,
          fr: `Modifications de catégories pour ${
            countIndicators(input.updates.length)
          }`,
          pt: `Alterações de categorias para ${
            countIndicators(input.updates.length)
          }`,
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "create_hfa_indicators",
      availableIn: COPILOT_TOOL_VIEWS.create_hfa_indicators,
      description:
        'Create new HFA indicators from the survey dataset, in a batch. For each: a long label (definition), type + aggregation (usually binary+avg for "% of facilities" — see the modelling guidance), optional category/sub-category/service categories (must already exist), and per-round indicator code. The app assigns each indicator\'s id and returns it; time points are validated and indicator code is validated against the dictionary (including a result-type check).',
      kind: "write",
      inputSchema: z.object({
        indicators: z.array(z.object({
          definition: z.string().describe(
            "Long label / full descriptive text.",
          ),
          shortLabel: z.string().optional(),
          type: z.enum(["binary", "numeric"]),
          aggregation: z.enum(["sum", "avg"]),
          categoryId: z.string().nullable().optional(),
          subCategoryId: z.string().nullable().optional(),
          serviceCategoryIds: z.array(z.string()).optional(),
          code: z.array(z.object({
            timePoint: z.string(),
            rCode: z.string(),
            rFilterCode: z.string().optional(),
          })).optional().describe(
            "Per-round indicator code. Keep identical across rounds unless the survey changed.",
          ),
        })).min(1),
      }),
      approval: {
        propose: async (input) => {
          const existing = await loadIndicators();
          const existingIds = new Set(existing.map((i) => i.indicatorId));
          const { categories, subCategories, serviceCategories } =
            await loadTaxonomy();
          const dict = await loadDictionary();
          const catIds = new Set(categories.map((c) => c.id));
          const subById = new Map(subCategories.map((s) => [s.id, s]));
          const svcIds = new Set(serviceCategories.map((s) => s.id));
          const validTimePoints = new Set(
            dict.timePoints.map((t) => t.timePoint),
          );

          const variableIds = dict.timePoints.flatMap((tp) =>
            tp.variables.map((v) => v.variableId)
          );
          const taken = new Set([...existingIds, ...variableIds]);
          const withIds = input.indicators.map((ind) => {
            const indicatorId = nextHfaIndicatorId(taken);
            taken.add(indicatorId);
            return { ...ind, indicatorId };
          });
          const indicatorsToCreate: HfaIndicator[] = [];
          const codeToCreate: HfaIndicatorCode[] = [];
          for (const ind of withIds) {
            if (ind.categoryId != null && !catIds.has(ind.categoryId)) {
              throw new AIToolFailure(
                `Category "${ind.categoryId}" does not exist. Valid: ${
                  [...catIds].join(", ") || "(none)"
                }.`,
              );
            }
            if (ind.subCategoryId != null) {
              const sub = subById.get(ind.subCategoryId);
              if (!sub) {
                throw new AIToolFailure(
                  `Sub-category "${ind.subCategoryId}" does not exist.`,
                );
              }
              if (sub.categoryId !== (ind.categoryId ?? null)) {
                throw new AIToolFailure(
                  `Sub-category "${ind.subCategoryId}" belongs to category "${sub.categoryId}", not "${
                    ind.categoryId ?? "(none)"
                  }".`,
                );
              }
            }
            const svc = ind.serviceCategoryIds ?? [];
            const badSvc = svc.filter((id) => !svcIds.has(id));
            if (badSvc.length > 0) {
              throw new AIToolFailure(
                `Service categories do not exist: ${badSvc.join(", ")}.`,
              );
            }
            const code = ind.code ?? [];
            for (const c of code) {
              if (!validTimePoints.has(c.timePoint)) {
                throw new AIToolFailure(
                  `Time point "${c.timePoint}" is not in the dataset. Valid: ${
                    [...validTimePoints].join(", ")
                  }.`,
                );
              }
            }
            indicatorsToCreate.push({
              indicatorId: ind.indicatorId,
              categoryId: ind.categoryId ?? null,
              subCategoryId: ind.subCategoryId ?? null,
              serviceCategoryIds: svc,
              shortLabel: ind.shortLabel ?? "",
              definition: ind.definition,
              type: ind.type,
              aggregation: ind.aggregation,
              sortOrder: 0,
              variantGroupId: null,
            });
            for (const c of code) {
              codeToCreate.push({
                indicatorId: ind.indicatorId,
                timePoint: c.timePoint,
                rCode: c.rCode,
                rFilterCode: c.rFilterCode,
              });
            }
          }
          // A new indicator has no variant group and the cycle graph reads
          // main code only, so no variant code can change these verdicts.
          const verdicts = validateIndicators({
            indicators: [...existing, ...indicatorsToCreate],
            code: [...await loadAllCode(), ...codeToCreate],
            variantCode: [],
            variantItems: [],
            dictionary: dict,
            only: new Set(indicatorsToCreate.map((i) => i.indicatorId)),
          });
          const issuesById = new Map(
            [...verdicts]
              .filter(([, v]) => v.issues.length > 0)
              .map(([id, v]) => [id, v.issues]),
          );
          const changes = indicatorsToCreate.map((ind) => {
            const issues = issuesById.get(ind.indicatorId) ?? [];
            return {
              label: ind.definition,
              after: `${ind.type}/${ind.aggregation}${
                issues.length
                  ? ` — ${
                    t3({
                      en: `${issues.length} issue(s)`,
                      fr: `${issues.length} problème(s)`,
                      pt: `${issues.length} problema(s)`,
                    })
                  }: ${issues.join("; ")}`
                  : ""
              }`,
            };
          });

          return {
            preview: {
              title: t3({
                en: "Create HFA indicators",
                fr: "Créer des indicateurs HFA",
                pt: "Criar indicadores HFA",
              }),
              description: t3({
                en: `Create ${countIndicators(indicatorsToCreate.length)}?`,
                fr: `Créer ${countIndicators(indicatorsToCreate.length)} ?`,
                pt: `Criar ${countIndicators(indicatorsToCreate.length)}?`,
              }),
              changes,
            },
            commit: async () => {
              const res = await serverActions.batchUploadHfaIndicators({
                indicators: indicatorsToCreate,
                code: codeToCreate,
                replaceAll: false,
              });
              if (!res.success) {
                throw new AIToolFailure(
                  `Failed to create HFA indicators: ${res.err}`,
                );
              }
              const createdIds = new Set(res.data.createdIndicatorIds);
              const created = indicatorsToCreate.filter((i) =>
                createdIds.has(i.indicatorId)
              );
              return {
                applied: true,
                created: created.map((i) => ({
                  indicatorId: i.indicatorId,
                  definition: i.definition,
                })),
                notCreated: indicatorsToCreate
                  .filter((i) => !createdIds.has(i.indicatorId))
                  .map((i) => ({
                    indicatorId: i.indicatorId,
                    definition: i.definition,
                    reason:
                      "an HFA indicator with this id was saved after the proposal; nothing was created for it",
                  })),
                withValidationIssues: created
                  .filter((i) => issuesById.has(i.indicatorId))
                  .map((i) => ({
                    indicatorId: i.indicatorId,
                    issues: issuesById.get(i.indicatorId),
                  })),
              };
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
      name: "set_hfa_indicator_code",
      availableIn: COPILOT_TOOL_VIEWS.set_hfa_indicator_code,
      description:
        "Set the per-round indicator code of EXISTING HFA indicators (to fix or change how they are computed). Each entry replaces that indicator+round's rCode/rFilterCode; other rounds are kept. Validation (including the result-type check) is recomputed automatically.",
      kind: "write",
      inputSchema: z.object({
        updates: z.array(z.object({
          indicatorId: z.string(),
          timePoint: z.string(),
          rCode: z.string(),
          rFilterCode: z.string().optional(),
        })).min(1),
      }),
      approval: {
        propose: async (input) => {
          const indicators = await loadIndicators();
          const byIndicatorId = new Map(
            indicators.map((i) => [i.indicatorId, i]),
          );
          const [allCode, dict, allVariantCode, variantItems] = await Promise
            .all([
              loadAllCode(),
              loadDictionary(),
              loadAllVariantCode(),
              loadVariantItems(),
            ]);
          const validTimePoints = new Set(
            dict.timePoints.map((t) => t.timePoint),
          );

          const codeByIndicatorId = new Map<string, CodeRound[]>();
          for (const c of allCode) {
            const arr = codeByIndicatorId.get(c.indicatorId) ?? [];
            arr.push({
              timePoint: c.timePoint,
              rCode: c.rCode,
              rFilterCode: c.rFilterCode,
            });
            codeByIndicatorId.set(c.indicatorId, arr);
          }
          const affected = new Set<string>();
          const changes: { label: string; before: string; after: string }[] =
            [];
          for (const u of input.updates) {
            if (!byIndicatorId.has(u.indicatorId)) {
              throw new AIToolFailure(`Unknown indicator "${u.indicatorId}".`);
            }
            if (!validTimePoints.has(u.timePoint)) {
              throw new AIToolFailure(
                `Time point "${u.timePoint}" is not in the dataset. Valid: ${
                  [...validTimePoints].join(", ")
                }.`,
              );
            }
            const arr = codeByIndicatorId.get(u.indicatorId) ?? [];
            const idx = arr.findIndex((c) => c.timePoint === u.timePoint);
            const before = idx >= 0
              ? formatCodeRound(arr[idx])
              : t3({ en: "(none)", fr: "(aucun)", pt: "(nenhum)" });
            const round = {
              timePoint: u.timePoint,
              rCode: u.rCode,
              rFilterCode: u.rFilterCode,
            };
            if (idx >= 0) arr[idx] = round;
            else arr.push(round);
            codeByIndicatorId.set(u.indicatorId, arr);
            affected.add(u.indicatorId);
            changes.push({
              label: `${u.indicatorId} — ${u.timePoint}`,
              before,
              after: formatCodeRound(round),
            });
          }

          const verdicts = validateIndicators({
            indicators,
            code: [...codeByIndicatorId].flatMap(([indicatorId, rounds]) =>
              rounds.map((r) => ({ ...r, indicatorId }))
            ),
            variantCode: allVariantCode,
            variantItems,
            dictionary: dict,
            only: affected,
          });
          return {
            preview: {
              title: t3({
                en: "Update HFA indicator code",
                fr: "Mettre à jour le code des indicateurs HFA",
                pt: "Atualizar o código dos indicadores HFA",
              }),
              description: t3({
                en: `Update indicator code for ${
                  countIndicators(affected.size)
                }?`,
                fr: `Mettre à jour le code de ${
                  countIndicators(affected.size)
                } ?`,
                pt: `Atualizar o código de ${countIndicators(affected.size)}?`,
              }),
              changes,
            },
            commit: async () => {
              const results = [...affected].map((indicatorId) => ({
                indicatorId,
                indicator: byIndicatorId.get(indicatorId)!,
                code: codeByIndicatorId.get(indicatorId) ?? [],
                ...verdicts.get(indicatorId)!,
              }));
              const res = await serverActions.saveHfaIndicatorsCode({
                indicators: results.map((r) => ({
                  indicator: r.indicator,
                  code: r.code.map((c) => ({
                    timePoint: c.timePoint,
                    rCode: c.rCode,
                    rFilterCode: c.rFilterCode,
                  })),
                })),
              });
              if (!res.success) {
                throw new AIToolFailure(
                  `Failed to update HFA indicator code; nothing was saved: ${res.err}`,
                );
              }
              return {
                applied: true,
                updated: results.length,
                withValidationIssues: results
                  .filter((r) =>
                    r.hasErrors || !r.codeConsistent ||
                    r.issues.length > 0
                  )
                  .map((r) => ({
                    indicatorId: r.indicatorId,
                    hasErrors: r.hasErrors,
                    codeConsistent: r.codeConsistent,
                    issues: r.issues,
                  })),
              };
            },
          };
        },
        presentation: "modal",
      },
      inProgressLabel: () =>
        t3({
          en: "Proposing code changes...",
          fr: "Proposition de modifications de code...",
          pt: "A propor alterações de código...",
        }),
      completionMessage: (input) =>
        t3({
          en: `Code changes for ${input.updates.length} round(s)`,
          fr: `Modifications de code pour ${input.updates.length} vague(s)`,
          pt: `Alterações de código para ${input.updates.length} ronda(s)`,
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
          const existing = new Set(
            (await loadIndicators()).map((i) => i.indicatorId),
          );
          const unknown = input.indicatorIds.filter((v) => !existing.has(v));
          if (unknown.length > 0) {
            throw new AIToolFailure(
              `Unknown indicator(s): ${unknown.join(", ")}.`,
            );
          }
          const allCode = await loadAllCode();
          const allVariantCode = await loadAllVariantCode();
          const deleted = new Set(input.indicatorIds);
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
                en: `Permanently delete ${
                  countIndicators(input.indicatorIds.length)
                }?`,
                fr: `Supprimer définitivement ${
                  countIndicators(input.indicatorIds.length)
                } ?`,
                pt: `Eliminar definitivamente ${
                  countIndicators(input.indicatorIds.length)
                }?`,
              }) + referencedByNote,
              changes: input.indicatorIds.map((vn) => ({
                label: vn,
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
                indicatorIds: input.indicatorIds,
              });
              if (!res.success) {
                throw new AIToolFailure(
                  `Failed to delete HFA indicators: ${res.err}`,
                );
              }
              return {
                applied: true,
                deleted: input.indicatorIds.length,
                stillReferencedBy: referencing.size > 0
                  ? [...referencing].sort()
                  : undefined,
              };
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
          en: `Delete ${countIndicators(input.indicatorIds.length)}`,
          fr: `Supprimer ${countIndicators(input.indicatorIds.length)}`,
          pt: `Eliminar ${countIndicators(input.indicatorIds.length)}`,
        }),
    }),
  ];
}
