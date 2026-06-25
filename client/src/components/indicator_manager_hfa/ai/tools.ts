import {
  createAITool,
  createAskUserQuestionsTool,
  openConfirm,
} from "panther";
import { z } from "zod";
import type { HfaIndicator } from "lib";
import { serverActions } from "~/server_actions";

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

// Apply a set of fully-merged indicators (read-modify-write — updateHfaIndicator
// takes the whole object). Stops and reports on the first failure.
async function applyIndicatorUpdates(merged: HfaIndicator[]): Promise<void> {
  for (const indicator of merged) {
    const res = await serverActions.updateHfaIndicator({
      oldVarName: indicator.varName,
      indicator,
    });
    if (!res.success) {
      throw new Error(`Failed to update "${indicator.varName}".`);
    }
  }
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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
        const confirmed = await openConfirm({
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

          const changed =
            next.categoryId !== cur.categoryId ||
            next.subCategoryId !== cur.subCategoryId ||
            next.serviceCategoryIds.join("|") !== cur.serviceCategoryIds.join("|");
          if (changed) {
            lines.push(`${u.varName} → category: ${next.categoryId ?? "—"}, sub: ${next.subCategoryId ?? "—"}, services: [${next.serviceCategoryIds.join(", ") || "—"}]`);
            merged.push(next);
          }
        }
        if (merged.length === 0) return { applied: false, reason: "No changes — provided assignments match the current state." };
        const confirmed = await openConfirm({
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

    createAskUserQuestionsTool(),
  ];
}
