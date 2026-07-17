import {
  createAITool,
  createAskUserQuestionsTool,
  openConfirm,
} from "panther";
import { z } from "zod";
import { extractRIdentifiers, serialiseMultiMembershipValues, type HfaDictionaryForValidation, type HfaIndicator, type HfaIndicatorCode } from "lib";
import { serverActions } from "~/server_actions";
import { checkRCodeResultType, hasRCodeErrors, validateRCode } from "../hfa_r_code_validator";

// ---------------------------------------------------------------------------
// Loaders — always read fresh so the AI acts on current state, and so writes
// from earlier in the conversation are reflected.
// ---------------------------------------------------------------------------

async function loadIndicators(): Promise<HfaIndicator[]> {
  const res = await serverActions.getHfaIndicators({});
  if (!res.success) throw new Error("Could not load HFA indicators.");
  return res.data;
}

async function loadTaxonomy() {
  const [cats, subs, svcs] = await Promise.all([
    serverActions.getHfaIndicatorCategories({}),
    serverActions.getHfaIndicatorSubCategories({}),
    serverActions.getHfaIndicatorServiceCategories({}),
  ]);
  if (!cats.success || !subs.success || !svcs.success) {
    throw new Error("Could not load HFA taxonomy.");
  }
  return { categories: cats.data, subCategories: subs.data, serviceCategories: svcs.data };
}

// Apply a set of fully-merged indicators (read-modify-write — the bulk route
// takes whole objects). Transactional server-side: all applied or none.
async function applyIndicatorUpdates(merged: HfaIndicator[]): Promise<void> {
  const res = await serverActions.updateHfaIndicatorsBulk({
    updates: merged.map((indicator) => ({
      oldVarName: indicator.varName,
      indicator,
    })),
  });
  if (!res.success) {
    throw new Error(
      `Failed to apply the ${merged.length} update(s) — nothing was saved. Retry the batch.`,
    );
  }
}

// panther's openConfirm drives a single global dialog. The chat engine can run a
// turn's tool calls concurrently (Promise.all), so two confirms in flight would
// clobber each other's resolver and hang the turn. Serialise them so each runs,
// and resolves, before the next opens.
let confirmChain: Promise<void> = Promise.resolve();
async function confirmGate(
  opts: Parameters<typeof openConfirm>[0],
): Promise<boolean> {
  const prev = confirmChain;
  let release!: () => void;
  confirmChain = new Promise<void>((r) => (release = r));
  await prev;
  try {
    return await openConfirm(opts);
  } finally {
    release();
  }
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function loadDictionary(): Promise<HfaDictionaryForValidation> {
  const res = await serverActions.getHfaDictionaryForValidation({});
  if (!res.success) throw new Error("Could not load the survey variable dictionary.");
  return res.data;
}

async function loadAllCode(): Promise<HfaIndicatorCode[]> {
  const res = await serverActions.getAllHfaIndicatorCode({});
  if (!res.success) throw new Error("Could not load indicator code.");
  return res.data;
}

type CodeRound = { timePoint: string; rCode: string; rFilterCode?: string };

// Mirrors the manager's "Revalidate all" computation (syntax + variable
// existence → hasSyntaxError; identical non-empty rounds → codeConsistent), plus
// two additions: an unknown time point also counts as a syntax error, and
// advisory findings (lone-`=` warnings, the binary/numeric result-type check)
// are surfaced in `issues` ONLY — they never flip hasSyntaxError, so the stored
// status stays consistent with the editor for everything the editor itself
// treats as an error.
function computeIndicatorValidation(
  code: CodeRound[],
  dict: HfaDictionaryForValidation,
  otherVarNames: Set<string>,
  expectedType: "binary" | "numeric",
): { hasSyntaxError: boolean; codeConsistent: boolean; issues: string[] } {
  const issues: string[] = [];
  let hasSyntaxError = false;
  for (const c of code) {
    const tp = dict.timePoints.find((t) => t.timePoint === c.timePoint);
    if (!tp) {
      issues.push(`Time point "${c.timePoint}" is not in the dataset.`);
      hasSyntaxError = true;
      continue;
    }
    const availableVars = new Set(tp.vars.map((v) => v.varName));
    const fields: [string, string][] = [
      ["rCode", c.rCode],
      ["rFilterCode", c.rFilterCode ?? ""],
    ];
    for (const [field, codeStr] of fields) {
      if (!codeStr.trim()) continue;
      const r = validateRCode(codeStr, availableVars, otherVarNames);
      if (hasRCodeErrors(r)) {
        hasSyntaxError = true;
      }
      for (const e of r.syntaxErrors) issues.push(`${c.timePoint} ${field}: ${e}`);
      for (const e of r.unknownVariableErrors) issues.push(`${c.timePoint} ${field}: ${e}`);
      for (const w of r.warnings) issues.push(`${c.timePoint} ${field}: WARNING: ${w}`);
    }
    // Result-type only applies to the main rCode (the filter is always boolean).
    for (const w of checkRCodeResultType(c.rCode, expectedType)) {
      issues.push(`${c.timePoint} rCode: ${w}`);
    }
  }
  const nonEmpty = code.filter((c) => c.rCode.trim() || (c.rFilterCode ?? "").trim());
  let codeConsistent = true;
  if (nonEmpty.length > 1) {
    const first = nonEmpty[0];
    codeConsistent = nonEmpty.every(
      (c) =>
        c.rCode.trim() === first.rCode.trim() &&
        (c.rFilterCode?.trim() ?? "") === (first.rFilterCode?.trim() ?? ""),
    );
  }
  return { hasSyntaxError, codeConsistent, issues };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function buildHfaIndicatorTools() {
  return [
    createAITool({
      name: "get_hfa_indicators",
      description:
        "List HFA indicators with their labels, measurement (type/aggregation), category / sub-category / service-category assignments, and validation status. Optional filters narrow the result; omit all to get every indicator.",
      inputSchema: z.object({
        categoryId: z.string().optional().describe("Only indicators in this category id."),
        serviceCategoryId: z.string().optional().describe("Only indicators that include this service-category id."),
        missingShortLabel: z.boolean().optional().describe("Only indicators with an empty short label."),
        missingCategory: z.boolean().optional().describe("Only indicators with no category assigned."),
        withValidationErrors: z.boolean().optional().describe("Only indicators flagged with a syntax error or inconsistent code."),
      }),
      handler: async (input) => {
        let rows = await loadIndicators();
        if (input.categoryId !== undefined) rows = rows.filter((i) => i.categoryId === input.categoryId);
        if (input.serviceCategoryId !== undefined) rows = rows.filter((i) => i.serviceCategoryIds.includes(input.serviceCategoryId!));
        if (input.missingShortLabel) rows = rows.filter((i) => i.shortLabel.trim() === "");
        if (input.missingCategory) rows = rows.filter((i) => i.categoryId === null);
        if (input.withValidationErrors) rows = rows.filter((i) => i.hasSyntaxError || !i.codeConsistent);
        return {
          count: rows.length,
          indicators: rows.map((i) => ({
            varName: i.varName,
            shortLabel: i.shortLabel,
            definition: i.definition,
            type: i.type,
            aggregation: i.aggregation,
            categoryId: i.categoryId,
            subCategoryId: i.subCategoryId,
            serviceCategoryIds: i.serviceCategoryIds,
            hasSyntaxError: i.hasSyntaxError,
            codeConsistent: i.codeConsistent,
          })),
        };
      },
      inProgressLabel: () => "Reading indicators...",
      completionMessage: "Read indicators",
    }),

    createAITool({
      name: "get_hfa_taxonomy",
      description:
        "List the available categories, sub-categories (each with its parent categoryId), and service categories — the valid ids that indicators can be assigned to.",
      inputSchema: z.object({}),
      handler: async () => {
        const { categories, subCategories, serviceCategories } = await loadTaxonomy();
        return {
          categories: categories.map((c) => ({ id: c.id, label: c.label })),
          subCategories: subCategories.map((s) => ({ id: s.id, categoryId: s.categoryId, label: s.label })),
          serviceCategories: serviceCategories.map((s) => ({ id: s.id, label: s.label })),
        };
      },
      inProgressLabel: () => "Reading taxonomy...",
      completionMessage: () => "Read taxonomy",
    }),

    createAITool({
      name: "update_hfa_indicator_labels",
      description:
        "Set the short label and/or long label (definition) of existing indicators, in a batch. Only the fields you provide change. The short label is used in dense chart contexts; the long label is the full descriptive text. Does NOT change measurement, categorisation, or r-code.",
      inputSchema: z.object({
        updates: z.array(z.object({
          varName: z.string(),
          shortLabel: z.string().optional().describe("New short label (omit to leave unchanged)."),
          definition: z.string().optional().describe("New long label / definition (omit to leave unchanged)."),
        })).min(1),
      }),
      handler: async (input) => {
        const byVar = new Map((await loadIndicators()).map((i) => [i.varName, i]));
        const merged: HfaIndicator[] = [];
        const lines: string[] = [];
        for (const u of input.updates) {
          const cur = byVar.get(u.varName);
          if (!cur) throw new Error(`Unknown indicator "${u.varName}".`);
          const next = { ...cur };
          if (u.shortLabel !== undefined && u.shortLabel !== cur.shortLabel) {
            lines.push(`${u.varName} · short: "${trunc(cur.shortLabel, 30)}" → "${trunc(u.shortLabel, 30)}"`);
            next.shortLabel = u.shortLabel;
          }
          if (u.definition !== undefined && u.definition !== cur.definition) {
            lines.push(`${u.varName} · long: "${trunc(cur.definition, 40)}" → "${trunc(u.definition, 40)}"`);
            next.definition = u.definition;
          }
          merged.push(next);
        }
        if (lines.length === 0) return { applied: false, reason: "No changes — provided values match the current labels." };
        const confirmed = await confirmGate({
          title: "Apply label changes",
          text: `Apply these label changes to ${merged.length} indicator(s)?\n\n${lines.join("\n")}`,
          confirmButtonLabel: "Apply",
        });
        if (!confirmed) return { applied: false, reason: "User cancelled — no changes made." };
        await applyIndicatorUpdates(merged);
        return { applied: true, indicatorsUpdated: merged.length, changes: lines };
      },
      inProgressLabel: () => "Proposing label changes...",
      completionMessage: (input) => `Label changes for ${input.updates.length} indicator(s)`,
    }),

    createAITool({
      name: "assign_hfa_indicator_categories",
      description:
        "Assign or clear the category, sub-category, and/or service categories of existing indicators, in a batch. Only the fields you provide change. Use null to clear a category or sub-category. All ids are validated against the live taxonomy (call get_hfa_taxonomy first if unsure).",
      inputSchema: z.object({
        updates: z.array(z.object({
          varName: z.string(),
          categoryId: z.string().nullable().optional().describe("Category id, null to clear, omit to leave unchanged."),
          subCategoryId: z.string().nullable().optional().describe("Sub-category id (must belong to the category), null to clear, omit to leave unchanged."),
          serviceCategoryIds: z.array(z.string()).optional().describe("Full replacement set of service-category ids (omit to leave unchanged)."),
        })).min(1),
      }),
      handler: async (input) => {
        const byVar = new Map((await loadIndicators()).map((i) => [i.varName, i]));
        const { categories, subCategories, serviceCategories } = await loadTaxonomy();
        const catIds = new Set(categories.map((c) => c.id));
        const subById = new Map(subCategories.map((s) => [s.id, s]));
        const svcIds = new Set(serviceCategories.map((s) => s.id));

        const merged: HfaIndicator[] = [];
        const lines: string[] = [];
        for (const u of input.updates) {
          const cur = byVar.get(u.varName);
          if (!cur) throw new Error(`Unknown indicator "${u.varName}".`);
          const next = { ...cur };

          if (u.categoryId !== undefined) {
            if (u.categoryId !== null && !catIds.has(u.categoryId)) {
              throw new Error(`Category "${u.categoryId}" does not exist. Valid category ids: ${[...catIds].join(", ") || "(none)"}.`);
            }
            next.categoryId = u.categoryId;
          }
          if (u.subCategoryId !== undefined) {
            if (u.subCategoryId !== null) {
              const sub = subById.get(u.subCategoryId);
              if (!sub) {
                throw new Error(`Sub-category "${u.subCategoryId}" does not exist. Valid sub-category ids: ${[...subById.keys()].join(", ") || "(none)"}.`);
              }
              if (sub.categoryId !== next.categoryId) {
                throw new Error(`Sub-category "${u.subCategoryId}" belongs to category "${sub.categoryId}", but "${u.varName}" is in category "${next.categoryId ?? "(none)"}". Set a matching category first.`);
              }
            }
            next.subCategoryId = u.subCategoryId;
          }
          if (u.serviceCategoryIds !== undefined) {
            const bad = u.serviceCategoryIds.filter((id) => !svcIds.has(id));
            if (bad.length > 0) {
              throw new Error(`Service categories do not exist: ${bad.join(", ")}. Valid service-category ids: ${[...svcIds].join(", ") || "(none)"}.`);
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

          const changed =
            next.categoryId !== cur.categoryId ||
            next.subCategoryId !== cur.subCategoryId ||
            serialiseMultiMembershipValues(next.serviceCategoryIds) !==
              serialiseMultiMembershipValues(cur.serviceCategoryIds);
          if (changed) {
            lines.push(`${u.varName} → category: ${next.categoryId ?? "—"}, sub: ${next.subCategoryId ?? "—"}, services: [${next.serviceCategoryIds.join(", ") || "—"}]`);
            merged.push(next);
          }
        }
        if (merged.length === 0) return { applied: false, reason: "No changes — provided assignments match the current state." };
        const confirmed = await confirmGate({
          title: "Apply category changes",
          text: `Apply these category assignments to ${merged.length} indicator(s)?\n\n${lines.join("\n")}`,
          confirmButtonLabel: "Apply",
        });
        if (!confirmed) return { applied: false, reason: "User cancelled — no changes made." };
        await applyIndicatorUpdates(merged);
        return { applied: true, indicatorsUpdated: merged.length, changes: lines };
      },
      inProgressLabel: () => "Proposing category changes...",
      completionMessage: (input) => `Category changes for ${input.updates.length} indicator(s)`,
    }),

    createAITool({
      name: "get_hfa_variable_dictionary",
      description:
        "List the survey variables in the dataset — name, human label, and data type — per round (time point). Compact by default. To see a variable's coded response options, missingness and the values actually present, use inspect_hfa_variable.",
      inputSchema: z.object({
        timePoint: z.string().optional().describe("Restrict to one round / time point."),
        search: z.string().optional().describe("Only variables whose name or label contains this text (case-insensitive)."),
      }),
      handler: async (input) => {
        const dict = await loadDictionary();
        const search = input.search?.toLowerCase();
        const tps = input.timePoint
          ? dict.timePoints.filter((t) => t.timePoint === input.timePoint)
          : dict.timePoints;
        return {
          timePoints: tps.map((tp) => {
            let vars = tp.vars;
            if (search) {
              vars = vars.filter(
                (v) =>
                  v.varName.toLowerCase().includes(search) ||
                  v.varLabel.toLowerCase().includes(search),
              );
            }
            return {
              timePoint: tp.timePoint,
              variableCount: vars.length,
              variables: vars.map((v) => ({ varName: v.varName, label: v.varLabel, dataType: v.varType })),
            };
          }),
        };
      },
      inProgressLabel: () => "Reading the dataset dictionary...",
      completionMessage: "Read variable dictionary",
    }),

    createAITool({
      name: "inspect_hfa_variable",
      description:
        "Inspect one or more survey variables in depth: per round, the coded response options (value → label), how many facilities answered vs are missing, and the distinct values actually present in the data. Use this before writing r-code that compares against a variable's codes.",
      inputSchema: z.object({
        varNames: z.array(z.string()).min(1).describe("The survey variable name(s) to inspect."),
        timePoint: z.string().optional().describe("Restrict to one round / time point."),
      }),
      handler: async (input) => {
        const res = await serverActions.getDatasetHfaDisplayInfo({});
        if (!res.success) throw new Error("Could not load the dataset variable details.");
        const wanted = new Set(input.varNames);
        let rows = res.data.rows.filter((r) => wanted.has(r.varName));
        if (input.timePoint) rows = rows.filter((r) => r.timePoint === input.timePoint);
        const found = new Set(rows.map((r) => r.varName));
        const missing = input.varNames.filter((v) => !found.has(v));
        return {
          variables: rows.map((r) => ({
            varName: r.varName,
            label: r.varLabel,
            dataType: r.varType,
            timePoint: r.timePoint,
            answered: r.count,
            missing: r.missing,
            responseOptions: r.questionnaireValues || "(not a coded variable)",
            valuesPresentInData: r.dataValues,
          })),
          notFound: missing.length > 0 ? missing : undefined,
        };
      },
      inProgressLabel: (input) => `Inspecting ${input.varNames.join(", ")}...`,
      completionMessage: "Inspected variable(s)",
    }),

    createAITool({
      name: "get_hfa_indicator_code",
      description: "Read the per-round r-code (rCode and optional rFilterCode) of existing indicators.",
      inputSchema: z.object({
        varNames: z.array(z.string()).optional().describe("Restrict to these indicators; omit for all."),
        timePoint: z.string().optional().describe("Restrict to one round / time point."),
      }),
      handler: async (input) => {
        let code = await loadAllCode();
        if (input.varNames) {
          const s = new Set(input.varNames);
          code = code.filter((c) => s.has(c.varName));
        }
        if (input.timePoint) code = code.filter((c) => c.timePoint === input.timePoint);
        return {
          count: code.length,
          code: code.map((c) => ({ varName: c.varName, timePoint: c.timePoint, rCode: c.rCode, rFilterCode: c.rFilterCode ?? null })),
        };
      },
      inProgressLabel: () => "Reading indicator code...",
      completionMessage: "Read indicator code",
    }),

    createAITool({
      name: "validate_hfa_indicators",
      description:
        "Validate indicators' r-code against the survey dictionary and persist the result (the manager's ready/error status). Returns, per checked indicator, whether it has syntax / unknown-variable / result-type issues, whether its code is consistent across rounds, and the specific issues. Run it after creating or editing code, and to find indicators that need fixing.",
      inputSchema: z.object({
        varNames: z.array(z.string()).optional().describe("Indicators to validate; omit to validate all."),
      }),
      handler: async (input) => {
        const indicators = await loadIndicators();
        const allCode = await loadAllCode();
        const dict = await loadDictionary();
        const allNames = new Set(indicators.map((i) => i.varName));
        const codeByVar = new Map<string, CodeRound[]>();
        for (const c of allCode) {
          const arr = codeByVar.get(c.varName) ?? [];
          arr.push({ timePoint: c.timePoint, rCode: c.rCode, rFilterCode: c.rFilterCode });
          codeByVar.set(c.varName, arr);
        }
        const target = input.varNames
          ? indicators.filter((i) => input.varNames!.includes(i.varName))
          : indicators;
        const results = target.map((ind) => {
          const other = new Set(allNames);
          other.delete(ind.varName);
          const v = computeIndicatorValidation(codeByVar.get(ind.varName) ?? [], dict, other, ind.type);
          return { varName: ind.varName, hasSyntaxError: v.hasSyntaxError, codeConsistent: v.codeConsistent, issues: v.issues };
        });
        const withIssues = results.filter((r) => r.hasSyntaxError || !r.codeConsistent || r.issues.length > 0);
        const confirmed = await confirmGate({
          title: "Save validation status",
          text: `Save the computed ready/error status for ${results.length} indicator(s)? (${withIssues.length} with issues)`,
          confirmButtonLabel: "Save",
        });
        if (!confirmed) return { applied: false, reason: "User cancelled — validation was computed but not saved.", validated: results.length, withIssues };
        const persistRes = await serverActions.bulkUpdateHfaIndicatorValidation({
          updates: results.map((r) => ({ varName: r.varName, hasSyntaxError: r.hasSyntaxError, codeConsistent: r.codeConsistent })),
        });
        if (!persistRes.success) throw new Error("Validation was computed but could not be saved.");
        return { validated: results.length, withIssues };
      },
      inProgressLabel: () => "Validating r-code...",
      completionMessage: (input) => (input.varNames ? `Validated ${input.varNames.length} indicator(s)` : "Validated all indicators"),
    }),

    createAITool({
      name: "create_hfa_indicators",
      description:
        "Create new HFA indicators from the survey dataset, in a batch. For each: a unique varName, a long label (definition), type + aggregation (usually binary+avg for \"% of facilities\" — see the modelling guidance), optional category/sub-category/service categories (must already exist), and per-round r-code. Ids and time points are validated; r-code is validated against the dictionary (including a result-type check). Fails if a varName already exists.",
      inputSchema: z.object({
        indicators: z.array(z.object({
          varName: z.string(),
          definition: z.string().describe("Long label / full descriptive text."),
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
          })).optional().describe("Per-round r-code. Keep identical across rounds unless the survey changed."),
        })).min(1),
      }),
      handler: async (input) => {
        const existing = await loadIndicators();
        const existingNames = new Set(existing.map((i) => i.varName));
        const { categories, subCategories, serviceCategories } = await loadTaxonomy();
        const dict = await loadDictionary();
        const catIds = new Set(categories.map((c) => c.id));
        const subById = new Map(subCategories.map((s) => [s.id, s]));
        const svcIds = new Set(serviceCategories.map((s) => s.id));
        const validTimePoints = new Set(dict.timePoints.map((t) => t.timePoint));

        const newNames = input.indicators.map((i) => i.varName);
        const dupInBatch = newNames.filter((n, i) => newNames.indexOf(n) !== i);
        if (dupInBatch.length > 0) throw new Error(`Duplicate varNames in this batch: ${[...new Set(dupInBatch)].join(", ")}.`);
        const allNamesAfter = new Set([...existingNames, ...newNames]);

        const indicatorsToCreate: HfaIndicator[] = [];
        const codeToCreate: HfaIndicatorCode[] = [];
        const summaries: string[] = [];
        for (const ind of input.indicators) {
          if (existingNames.has(ind.varName)) throw new Error(`Indicator "${ind.varName}" already exists. Pick a new varName, or edit it with set_hfa_indicator_code / the update tools.`);
          if (ind.categoryId != null && !catIds.has(ind.categoryId)) throw new Error(`Category "${ind.categoryId}" does not exist. Valid: ${[...catIds].join(", ") || "(none)"}.`);
          if (ind.subCategoryId != null) {
            const sub = subById.get(ind.subCategoryId);
            if (!sub) throw new Error(`Sub-category "${ind.subCategoryId}" does not exist.`);
            if (sub.categoryId !== (ind.categoryId ?? null)) throw new Error(`Sub-category "${ind.subCategoryId}" belongs to category "${sub.categoryId}", not "${ind.categoryId ?? "(none)"}".`);
          }
          const svc = ind.serviceCategoryIds ?? [];
          const badSvc = svc.filter((id) => !svcIds.has(id));
          if (badSvc.length > 0) throw new Error(`Service categories do not exist: ${badSvc.join(", ")}.`);
          const code = ind.code ?? [];
          for (const c of code) {
            if (!validTimePoints.has(c.timePoint)) throw new Error(`Time point "${c.timePoint}" is not in the dataset. Valid: ${[...validTimePoints].join(", ")}.`);
          }
          const other = new Set(allNamesAfter);
          other.delete(ind.varName);
          const v = computeIndicatorValidation(code, dict, other, ind.type);
          indicatorsToCreate.push({
            varName: ind.varName,
            categoryId: ind.categoryId ?? null,
            subCategoryId: ind.subCategoryId ?? null,
            serviceCategoryIds: svc,
            shortLabel: ind.shortLabel ?? "",
            definition: ind.definition,
            type: ind.type,
            aggregation: ind.aggregation,
            sortOrder: 0,
            hasSyntaxError: v.hasSyntaxError,
            codeConsistent: v.codeConsistent,
          });
          for (const c of code) codeToCreate.push({ varName: ind.varName, timePoint: c.timePoint, rCode: c.rCode, rFilterCode: c.rFilterCode });
          summaries.push(`${ind.varName} (${ind.type}/${ind.aggregation})${v.issues.length ? "  ⚠\n   " + v.issues.join("\n   ") : ""}`);
        }

        const confirmed = await confirmGate({
          title: "Create indicators",
          text: `Create ${indicatorsToCreate.length} new indicator(s)?\n\n${summaries.join("\n")}`,
          confirmButtonLabel: "Create",
        });
        if (!confirmed) return { applied: false, reason: "User cancelled — nothing created." };
        const res = await serverActions.batchUploadHfaIndicators({ indicators: indicatorsToCreate, code: codeToCreate, replaceAll: false });
        if (!res.success) throw new Error("Failed to create indicators.");
        return {
          applied: true,
          created: indicatorsToCreate.length,
          withValidationIssues: indicatorsToCreate.filter((i) => i.hasSyntaxError).map((i) => i.varName),
        };
      },
      inProgressLabel: () => "Proposing new indicators...",
      completionMessage: (input) => `Create ${input.indicators.length} indicator(s)`,
    }),

    createAITool({
      name: "set_hfa_indicator_code",
      description:
        "Set the per-round r-code of EXISTING indicators (to fix or change how they are computed). Each entry replaces that indicator+round's rCode/rFilterCode; other rounds are kept. Validation (including the result-type check) is recomputed automatically.",
      inputSchema: z.object({
        updates: z.array(z.object({
          varName: z.string(),
          timePoint: z.string(),
          rCode: z.string(),
          rFilterCode: z.string().optional(),
        })).min(1),
      }),
      handler: async (input) => {
        const indicators = await loadIndicators();
        const byVar = new Map(indicators.map((i) => [i.varName, i]));
        const allCode = await loadAllCode();
        const dict = await loadDictionary();
        const allNames = new Set(indicators.map((i) => i.varName));
        const validTimePoints = new Set(dict.timePoints.map((t) => t.timePoint));

        const codeByVar = new Map<string, CodeRound[]>();
        for (const c of allCode) {
          const arr = codeByVar.get(c.varName) ?? [];
          arr.push({ timePoint: c.timePoint, rCode: c.rCode, rFilterCode: c.rFilterCode });
          codeByVar.set(c.varName, arr);
        }
        const affected = new Set<string>();
        for (const u of input.updates) {
          if (!byVar.has(u.varName)) throw new Error(`Unknown indicator "${u.varName}".`);
          if (!validTimePoints.has(u.timePoint)) throw new Error(`Time point "${u.timePoint}" is not in the dataset. Valid: ${[...validTimePoints].join(", ")}.`);
          const arr = codeByVar.get(u.varName) ?? [];
          const idx = arr.findIndex((c) => c.timePoint === u.timePoint);
          const round = { timePoint: u.timePoint, rCode: u.rCode, rFilterCode: u.rFilterCode };
          if (idx >= 0) arr[idx] = round;
          else arr.push(round);
          codeByVar.set(u.varName, arr);
          affected.add(u.varName);
        }
        const summaries = [...affected].map((vn) => `${vn}: rounds ${input.updates.filter((u) => u.varName === vn).map((u) => u.timePoint).join(", ")}`);
        const confirmed = await confirmGate({
          title: "Update indicator code",
          text: `Update r-code for ${affected.size} indicator(s)?\n\n${summaries.join("\n")}`,
          confirmButtonLabel: "Apply",
        });
        if (!confirmed) return { applied: false, reason: "User cancelled — no changes made." };

        const results: { varName: string; hasSyntaxError: boolean; codeConsistent: boolean; issues: string[] }[] = [];
        for (const vn of affected) {
          const indicator = byVar.get(vn)!;
          const code = codeByVar.get(vn) ?? [];
          const other = new Set(allNames);
          other.delete(vn);
          const v = computeIndicatorValidation(code, dict, other, indicator.type);
          const res = await serverActions.saveHfaIndicatorFull({
            oldVarName: vn,
            indicator: { ...indicator, hasSyntaxError: v.hasSyntaxError, codeConsistent: v.codeConsistent },
            code: code.map((c) => ({ timePoint: c.timePoint, rCode: c.rCode, rFilterCode: c.rFilterCode })),
            hasSyntaxError: v.hasSyntaxError,
            codeConsistent: v.codeConsistent,
          });
          if (!res.success) throw new Error(`Failed to update code for "${vn}".`);
          results.push({ varName: vn, hasSyntaxError: v.hasSyntaxError, codeConsistent: v.codeConsistent, issues: v.issues });
        }
        return { applied: true, updated: results.length, withValidationIssues: results.filter((r) => r.hasSyntaxError || !r.codeConsistent || r.issues.length > 0) };
      },
      inProgressLabel: () => "Proposing code changes...",
      completionMessage: (input) => `Code changes for ${input.updates.length} round(s)`,
    }),

    createAITool({
      name: "delete_hfa_indicators",
      description: "Permanently delete indicators by varName (and their r-code). Use with care.",
      inputSchema: z.object({ varNames: z.array(z.string()).min(1) }),
      handler: async (input) => {
        const existing = new Set((await loadIndicators()).map((i) => i.varName));
        const unknown = input.varNames.filter((v) => !existing.has(v));
        if (unknown.length > 0) throw new Error(`Unknown indicator(s): ${unknown.join(", ")}.`);
        const allCode = await loadAllCode();
        const deleted = new Set(input.varNames);
        const referencing = new Set<string>();
        for (const c of allCode) {
          if (deleted.has(c.varName)) continue;
          const identifiers = [
            ...extractRIdentifiers(c.rCode),
            ...(c.rFilterCode ? extractRIdentifiers(c.rFilterCode) : []),
          ];
          if (identifiers.some((id) => deleted.has(id))) referencing.add(c.varName);
        }
        const referencedByNote = referencing.size > 0
          ? `\n\nReferenced by: ${[...referencing].sort().join(", ")} — their code will fail validation.`
          : "";
        const confirmed = await confirmGate({
          title: "Delete indicators",
          text: `Permanently delete ${input.varNames.length} indicator(s)?\n\n${input.varNames.join(", ")}${referencedByNote}`,
          intent: "danger",
          confirmButtonLabel: "Delete",
        });
        if (!confirmed) return { applied: false, reason: "User cancelled — nothing deleted." };
        const res = await serverActions.deleteHfaIndicators({ varNames: input.varNames });
        if (!res.success) throw new Error("Failed to delete indicators.");
        return {
          applied: true,
          deleted: input.varNames.length,
          stillReferencedBy: referencing.size > 0 ? [...referencing].sort() : undefined,
        };
      },
      inProgressLabel: () => "Proposing deletion...",
      completionMessage: (input) => `Delete ${input.varNames.length} indicator(s)`,
    }),

    createAskUserQuestionsTool(),
  ];
}
