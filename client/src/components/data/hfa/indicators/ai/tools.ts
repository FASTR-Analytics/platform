import {
  AIToolFailure,
  createAITool,
  foldString,
  matchesSearch,
  searchTokens,
} from "panther";
import { z } from "zod";
import {
  COPILOT_TOOL_VIEWS,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCode,
  hfaIndicatorCodeIdentifiers,
  hfaIndicatorsStatus,
  type HfaIndicatorVariantCode,
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

// ---------------------------------------------------------------------------
// Loaders. The indicators, the taxonomy and the code are read fresh on every
// call so the AI acts on current state, its own earlier writes included; the
// survey dictionary and the dataset display read through the T2 caches the
// manager uses, keyed on the instance's HFA cache hash.
// ---------------------------------------------------------------------------

async function loadIndicators(): Promise<HfaIndicator[]> {
  const res = await serverActions.getHfaIndicators({});
  if (!res.success) {
    throw new AIToolFailure(`Could not load HFA indicators: ${res.err}`);
  }
  return res.data;
}

async function loadTaxonomy() {
  const [cats, subs, svcs] = await Promise.all([
    serverActions.getHfaIndicatorCategories({}),
    serverActions.getHfaIndicatorSubCategories({}),
    serverActions.getHfaIndicatorServiceCategories({}),
  ]);
  if (!cats.success) {
    throw new AIToolFailure(`Could not load the HFA taxonomy: ${cats.err}`);
  }
  if (!subs.success) {
    throw new AIToolFailure(`Could not load the HFA taxonomy: ${subs.err}`);
  }
  if (!svcs.success) {
    throw new AIToolFailure(`Could not load the HFA taxonomy: ${svcs.err}`);
  }
  return {
    categories: cats.data,
    subCategories: subs.data,
    serviceCategories: svcs.data,
  };
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
  const res = await serverActions.getHfaIndicatorVariantItems({});
  if (!res.success) {
    throw new AIToolFailure(
      `Could not load the HFA variant items: ${res.err}`,
    );
  }
  return res.data;
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

// ---------------------------------------------------------------------------
// Tools: the HFA reads and HFA writes of the chat's catalogue, registered for
// every user and gated by view through `availableIn` (the reads in the manager,
// the code editor and the Excel import; the writes in the manager alone, where
// each proposes a modal approval). Who may call them refuses at the call
// through the chat's guard, under `canWriteHfaIndicators()` for the writes.
// ---------------------------------------------------------------------------

export function buildHfaIndicatorTools() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_hfa_indicators",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_indicators,
      description:
        "List HFA indicators with their labels, measurement (type/aggregation) and category / sub-category / service-category assignments. Optional filters narrow the result; omit all to get every indicator.",
      kind: "read",
      inputSchema: z.object({
        categoryId: z.string().optional().describe(
          "Only indicators in this category id.",
        ),
        serviceCategoryId: z.string().optional().describe(
          "Only indicators that include this service-category id.",
        ),
        missingShortLabel: z.boolean().optional().describe(
          "Only indicators with an empty short label.",
        ),
        missingCategory: z.boolean().optional().describe(
          "Only indicators with no category assigned.",
        ),
      }),
      handler: async (input) => {
        let rows = await loadIndicators();
        if (input.categoryId !== undefined) {
          rows = rows.filter((i) => i.categoryId === input.categoryId);
        }
        if (input.serviceCategoryId !== undefined) {
          rows = rows.filter((i) =>
            i.serviceCategoryIds.includes(input.serviceCategoryId!)
          );
        }
        if (input.missingShortLabel) {
          rows = rows.filter((i) => i.shortLabel.trim() === "");
        }
        if (input.missingCategory) {
          rows = rows.filter((i) => i.categoryId === null);
        }
        return {
          count: rows.length,
          indicators: rows.map((i) => ({
            indicatorId: i.indicatorId,
            shortLabel: i.shortLabel,
            definition: i.definition,
            type: i.type,
            aggregation: i.aggregation,
            categoryId: i.categoryId,
            subCategoryId: i.subCategoryId,
            serviceCategoryIds: i.serviceCategoryIds,
          })),
        };
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
      name: "get_hfa_taxonomy",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_taxonomy,
      description:
        "List the HFA indicator taxonomy: the available categories, sub-categories (each with its parent categoryId), and service categories — the valid ids that HFA indicators can be assigned to.",
      kind: "read",
      inputSchema: z.object({}),
      handler: async () => {
        const { categories, subCategories, serviceCategories } =
          await loadTaxonomy();
        return {
          categories: categories.map((c) => ({ id: c.id, label: c.label })),
          subCategories: subCategories.map((s) => ({
            id: s.id,
            categoryId: s.categoryId,
            label: s.label,
          })),
          serviceCategories: serviceCategories.map((s) => ({
            id: s.id,
            label: s.label,
          })),
        };
      },
      inProgressLabel: () =>
        t3({
          en: "Reading the HFA taxonomy...",
          fr: "Lecture de la taxonomie HFA...",
          pt: "A ler a taxonomia HFA...",
        }),
      completionMessage: () =>
        t3({
          en: "Read the HFA taxonomy",
          fr: "Taxonomie HFA lue",
          pt: "Taxonomia HFA lida",
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
        "Assign or clear the category, sub-category, and/or service categories of existing HFA indicators, in a batch. Only the fields you provide change. Use null to clear a category or sub-category. All ids are validated against the live taxonomy (call get_hfa_taxonomy first if unsure).",
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
      name: "get_hfa_variable_dictionary",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_variable_dictionary,
      description:
        "List the HFA survey variables in the dataset — variable id, human label, and data type — per round (time point). Compact by default. To see a variable's coded response options, missingness and the values actually present, use inspect_hfa_variable.",
      kind: "read",
      inputSchema: z.object({
        timePoint: z.string().optional().describe(
          "Restrict to one round / time point.",
        ),
        search: z.string().optional().describe(
          "Only variables whose id and label together contain every word of this text, in any order (case- and accent-insensitive).",
        ),
      }),
      handler: async (input) => {
        const dict = await loadDictionary();
        const tokens = searchTokens(input.search ?? "");
        const tps = input.timePoint
          ? dict.timePoints.filter((t) => t.timePoint === input.timePoint)
          : dict.timePoints;
        return {
          timePoints: tps.map((tp) => {
            const variables = tp.variables.filter((v) =>
              matchesSearch(
                foldString(`${v.variableId} ${v.variableLabel}`),
                tokens,
              )
            );
            return {
              timePoint: tp.timePoint,
              variableCount: variables.length,
              variables: variables.map((v) => ({
                variableId: v.variableId,
                label: v.variableLabel,
                dataType: v.variableType,
              })),
            };
          }),
        };
      },
      inProgressLabel: () =>
        t3({
          en: "Reading the HFA survey dictionary...",
          fr: "Lecture du dictionnaire de l'enquête HFA...",
          pt: "A ler o dicionário do inquérito HFA...",
        }),
      completionMessage: () =>
        t3({
          en: "Read the HFA survey dictionary",
          fr: "Dictionnaire de l'enquête HFA lu",
          pt: "Dicionário do inquérito HFA lido",
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "inspect_hfa_variable",
      availableIn: COPILOT_TOOL_VIEWS.inspect_hfa_variable,
      description:
        "Inspect one or more HFA survey variables in depth: per round, the coded response options (value → label), how many facilities answered vs are missing, and the distinct values actually present in the data. Use this before writing indicator code that compares against a variable's codes.",
      kind: "read",
      inputSchema: z.object({
        variableIds: z.array(z.string()).min(1).describe(
          "The survey variable id(s) to inspect.",
        ),
        timePoint: z.string().optional().describe(
          "Restrict to one round / time point.",
        ),
      }),
      handler: async (input) => {
        const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(
          instanceState.hfaCacheHash,
        );
        if (!res.success) {
          throw new AIToolFailure(
            `Could not load the HFA dataset variable details: ${res.err}`,
          );
        }
        const wanted = new Set(input.variableIds);
        let rows = res.data.rows.filter((r) => wanted.has(r.variableId));
        if (input.timePoint) {
          rows = rows.filter((r) => r.timePoint === input.timePoint);
        }
        const found = new Set(rows.map((r) => r.variableId));
        const missing = input.variableIds.filter((v) => !found.has(v));
        return {
          variables: rows.map((r) => ({
            variableId: r.variableId,
            label: r.variableLabel,
            dataType: r.variableType,
            timePoint: r.timePoint,
            answered: r.count,
            missing: r.missing,
            responseOptions: r.questionnaireValues || "(not a coded variable)",
            valuesPresentInData: r.dataValues,
          })),
          notFound: missing.length > 0 ? missing : undefined,
        };
      },
      inProgressLabel: (input) =>
        t3({
          en: `Inspecting ${input.variableIds.join(", ")}...`,
          fr: `Inspection de ${input.variableIds.join(", ")}...`,
          pt: `A inspecionar ${input.variableIds.join(", ")}...`,
        }),
      completionMessage: () =>
        t3({
          en: "Inspected HFA variable(s)",
          fr: "Variable(s) HFA inspectée(s)",
          pt: "Variável(eis) HFA inspecionada(s)",
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "get_hfa_indicator_code",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_indicator_code,
      description:
        "Read the per-round indicator code (rCode and optional rFilterCode) of existing HFA indicators.",
      kind: "read",
      inputSchema: z.object({
        indicatorIds: z.array(z.string()).min(1).optional().describe(
          "Restrict to these indicators; omit for all.",
        ),
        timePoint: z.string().optional().describe(
          "Restrict to one round / time point.",
        ),
      }),
      handler: async (input) => {
        let code = await loadAllCode();
        if (input.indicatorIds) {
          const s = new Set(input.indicatorIds);
          code = code.filter((c) => s.has(c.indicatorId));
        }
        if (input.timePoint) {
          code = code.filter((c) => c.timePoint === input.timePoint);
        }
        return {
          count: code.length,
          code: code.map((c) => ({
            indicatorId: c.indicatorId,
            timePoint: c.timePoint,
            rCode: c.rCode,
            rFilterCode: c.rFilterCode ?? null,
          })),
        };
      },
      inProgressLabel: () =>
        t3({
          en: "Reading HFA indicator code...",
          fr: "Lecture du code des indicateurs HFA...",
          pt: "A ler o código dos indicadores HFA...",
        }),
      completionMessage: () =>
        t3({
          en: "Read HFA indicator code",
          fr: "Code des indicateurs HFA lu",
          pt: "Código dos indicadores HFA lido",
        }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "validate_hfa_indicators",
      availableIn: COPILOT_TOOL_VIEWS.validate_hfa_indicators,
      description:
        "Validate HFA indicators' code against the HFA survey dictionary. Writes nothing. Returns how many indicators were checked and, for each one with an issue, whether it has syntax / unknown-variable / result-type issues, whether its code is consistent across rounds, and the specific issues. Run it after creating or editing code, and to find indicators that need fixing.",
      kind: "read",
      inputSchema: z.object({
        indicatorIds: z.array(z.string()).min(1).optional().describe(
          "Indicators to validate; omit to validate all.",
        ),
      }),
      handler: async (input) => {
        const indicators = await loadIndicators();
        const target = input.indicatorIds
          ? indicators.filter((i) =>
            input.indicatorIds!.includes(i.indicatorId)
          )
          : indicators;
        const verdicts = validateIndicators({
          indicators,
          code: await loadAllCode(),
          variantCode: await loadAllVariantCode(),
          variantItems: await loadVariantItems(),
          dictionary: await loadDictionary(),
          only: new Set(target.map((i) => i.indicatorId)),
        });
        const results = target.map((ind) => ({
          indicatorId: ind.indicatorId,
          ...verdicts.get(ind.indicatorId)!,
        }));
        const withIssues = results.filter((r) =>
          r.hasErrors || !r.codeConsistent || r.issues.length > 0
        );
        return { validated: results.length, withIssues };
      },
      inProgressLabel: () =>
        t3({
          en: "Validating HFA indicator code...",
          fr: "Validation du code des indicateurs HFA...",
          pt: "A validar o código dos indicadores HFA...",
        }),
      completionMessage: (input) =>
        input.indicatorIds
          ? t3({
            en: `Validated ${countIndicators(input.indicatorIds.length)}`,
            fr: `${countIndicators(input.indicatorIds.length)} validé(s)`,
            pt: `${countIndicators(input.indicatorIds.length)} validado(s)`,
          })
          : t3({
            en: "Validated all HFA indicators",
            fr: "Tous les indicateurs HFA validés",
            pt: "Todos os indicadores HFA validados",
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
          const verdicts = validateIndicators({
            indicators: [...existing, ...indicatorsToCreate],
            code: [...await loadAllCode(), ...codeToCreate],
            variantCode: await loadAllVariantCode(),
            variantItems: await loadVariantItems(),
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
          const allCode = await loadAllCode();
          const dict = await loadDictionary();
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
              const verdicts = validateIndicators({
                indicators,
                code: [...codeByIndicatorId].flatMap(([indicatorId, rounds]) =>
                  rounds.map((r) => ({ ...r, indicatorId }))
                ),
                variantCode: await loadAllVariantCode(),
                variantItems: await loadVariantItems(),
                dictionary: dict,
                only: affected,
              });
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
