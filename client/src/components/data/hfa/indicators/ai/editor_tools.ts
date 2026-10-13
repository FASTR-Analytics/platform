import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import { COPILOT_TOOL_VIEWS, t3 } from "lib";
import {
  copilotViews,
  type HfaIndicatorEditorContext,
  type HfaIndicatorEditorDraft,
  type HfaIndicatorEditorPatch,
} from "~/components/instance/copilot/mod.ts";

// The HFA editor group (ruling 1): the code editor's unsaved draft of one
// indicator, read and written live through the view's context. The write
// checks its ids against the taxonomy and the rounds the editor offers
// before it touches the draft, then lands in the editor's store like the
// user's own edit: unsaved, for the user to save or discard. Neither tool
// awaits, so the editor that set the view is the one a write reaches.

const patchSchema = z.object({
  shortLabel: z.string().optional().describe(
    "New short label (omit to leave unchanged).",
  ),
  definition: z.string().optional().describe(
    "New long label / definition (omit to leave unchanged).",
  ),
  type: z.enum(["binary", "numeric"]).optional(),
  aggregation: z.enum(["sum", "avg"]).optional(),
  categoryId: z.string().nullable().optional().describe(
    "Category id, null to clear, omit to leave unchanged. Changing the category clears the sub-category unless one is given.",
  ),
  subCategoryId: z.string().nullable().optional().describe(
    "Sub-category id (must belong to the category), null to clear, omit to leave unchanged.",
  ),
  serviceCategoryIds: z.array(z.string()).optional().describe(
    "Full replacement set of service-category ids (omit to leave unchanged).",
  ),
  code: z.array(z.object({
    timePoint: z.string(),
    rCode: z.string().optional().describe(
      "The round's R code; omit to keep it.",
    ),
    rFilterCode: z.string().optional().describe(
      "The round's filter code, an empty string to clear it; omit to keep it.",
    ),
  })).optional().describe(
    "Per-round code changes; a round not listed keeps its code.",
  ),
});

type Patch = z.infer<typeof patchSchema>;

function describeDraft(
  indicatorId: string,
  context: HfaIndicatorEditorContext,
): Record<string, unknown> {
  const draft = context.getDraft();
  return {
    indicatorId,
    label: context.getLabel(),
    selectedTimePoint: context.getSelectedTimePoint(),
    unsaved: {
      shortLabel: draft.shortLabel,
      definition: draft.definition,
      type: draft.type,
      aggregation: draft.aggregation,
      categoryId: draft.categoryId,
      subCategoryId: draft.subCategoryId,
      serviceCategoryIds: draft.serviceCategoryIds,
    },
    code: draft.code,
    codeConsistent: draft.codeConsistent,
  };
}

const none = "(none)";

// Every id the patch names is checked against what the editor offers, so a
// throw means nothing changed.
function validatePatch(
  patch: Patch,
  draft: HfaIndicatorEditorDraft,
  context: HfaIndicatorEditorContext,
): HfaIndicatorEditorPatch {
  const given = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (given.length === 0) {
    throw new AIToolFailure(
      "No fields were provided. update_hfa_indicator_editor changes the draft's labels, type, aggregation, categories or per-round code; pass at least one.",
    );
  }
  const { categories, subCategories, serviceCategories } = context
    .getTaxonomy();
  const catIds = new Set(categories.map((c) => c.id));
  const subById = new Map(subCategories.map((s) => [s.id, s]));
  const svcIds = new Set(serviceCategories.map((s) => s.id));

  if (patch.categoryId != null && !catIds.has(patch.categoryId)) {
    throw new AIToolFailure(
      `Category "${patch.categoryId}" does not exist. Valid category ids: ${
        [...catIds].join(", ") || none
      }.`,
    );
  }
  const categoryAfter = patch.categoryId === undefined
    ? draft.categoryId
    : patch.categoryId;
  if (patch.subCategoryId != null) {
    const sub = subById.get(patch.subCategoryId);
    if (!sub) {
      throw new AIToolFailure(
        `Sub-category "${patch.subCategoryId}" does not exist. Valid sub-category ids: ${
          [...subById.keys()].join(", ") || none
        }.`,
      );
    }
    if (sub.categoryId !== categoryAfter) {
      throw new AIToolFailure(
        `Sub-category "${patch.subCategoryId}" belongs to category "${sub.categoryId}", but the indicator's category is "${
          categoryAfter ?? none
        }". Set a matching category in the same call.`,
      );
    }
  }
  if (patch.serviceCategoryIds !== undefined) {
    const bad = patch.serviceCategoryIds.filter((id) => !svcIds.has(id));
    if (bad.length > 0) {
      throw new AIToolFailure(
        `Service categories do not exist: ${
          bad.join(", ")
        }. Valid service-category ids: ${[...svcIds].join(", ") || none}.`,
      );
    }
  }
  if (patch.code !== undefined) {
    const rounds = new Set(draft.code.map((c) => c.timePoint));
    const seen = new Set<string>();
    for (const round of patch.code) {
      if (!rounds.has(round.timePoint)) {
        throw new AIToolFailure(
          `Time point "${round.timePoint}" is not a round of this editor. Rounds: ${
            [...rounds].join(", ")
          }.`,
        );
      }
      if (seen.has(round.timePoint)) {
        throw new AIToolFailure(
          `Time point "${round.timePoint}" is listed twice; list each round once.`,
        );
      }
      seen.add(round.timePoint);
      if (round.rCode === undefined && round.rFilterCode === undefined) {
        throw new AIToolFailure(
          `Round "${round.timePoint}" names no field to change; give rCode, rFilterCode or both.`,
        );
      }
    }
  }
  return patch;
}

function changeLine(
  field: string,
  before: string | null,
  after: string | null,
): string {
  return before === after
    ? `${field}: no change`
    : `${field}: "${before ?? none}" → "${after ?? none}"`;
}

// What the write did, field by field: a field whose new value equals the
// draft's is reported as no change, never as an update.
function describeChanges(
  patch: HfaIndicatorEditorPatch,
  before: HfaIndicatorEditorDraft,
  after: HfaIndicatorEditorDraft,
): string[] {
  const lines: string[] = [];
  const scalar = (
    field:
      | "shortLabel"
      | "definition"
      | "type"
      | "aggregation"
      | "categoryId"
      | "subCategoryId",
  ) => {
    if (patch[field] !== undefined) {
      lines.push(changeLine(field, before[field], after[field]));
    }
  };
  scalar("shortLabel");
  scalar("definition");
  scalar("type");
  scalar("aggregation");
  scalar("categoryId");
  if (patch.subCategoryId !== undefined) {
    scalar("subCategoryId");
  } else if (before.subCategoryId !== after.subCategoryId) {
    lines.push(
      `subCategoryId: cleared ("${before.subCategoryId}" belonged to the previous category)`,
    );
  }
  if (patch.serviceCategoryIds !== undefined) {
    lines.push(
      changeLine(
        "serviceCategoryIds",
        `[${before.serviceCategoryIds.join(", ")}]`,
        `[${after.serviceCategoryIds.join(", ")}]`,
      ),
    );
  }
  for (const round of patch.code ?? []) {
    const b = before.code.find((c) => c.timePoint === round.timePoint);
    const a = after.code.find((c) => c.timePoint === round.timePoint);
    if (b === undefined || a === undefined) continue;
    if (round.rCode !== undefined) {
      lines.push(changeLine(`${round.timePoint} rCode`, b.rCode, a.rCode));
    }
    if (round.rFilterCode !== undefined) {
      lines.push(
        changeLine(
          `${round.timePoint} rFilterCode`,
          b.rFilterCode,
          a.rFilterCode,
        ),
      );
    }
  }
  return lines;
}

export function getClientToolsForHfaIndicatorEditor() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_hfa_indicator_editor",
      availableIn: COPILOT_TOOL_VIEWS.get_hfa_indicator_editor,
      description:
        "Read the HFA indicator open in the code editor as its unsaved draft stands: the labels, type, aggregation, category, sub-category and service categories, the R code and filter code of every round with the issues the editor's validation finds in each, whether the rounds agree, and the round the user is looking at. Call this before update_hfa_indicator_editor.",
      inputSchema: z.object({}),
      kind: "read",
      handler: (_input, view) =>
        describeDraft(view.params.indicatorId, view.context),
      inProgressLabel: () =>
        t3({
          en: "Reading the indicator editor...",
          fr: "Lecture de l'éditeur d'indicateur...",
          pt: "A ler o editor de indicador...",
        }),
      completionMessage: () =>
        t3({
          en: "Read the indicator editor",
          fr: "Éditeur d'indicateur lu",
          pt: "Editor de indicador lido",
        }),
    }),
    createAITool({
      viewRegistry: copilotViews,
      name: "update_hfa_indicator_editor",
      availableIn: COPILOT_TOOL_VIEWS.update_hfa_indicator_editor,
      description:
        "Change the HFA indicator open in the code editor. Provide only the fields to change (labels, type, aggregation, category, sub-category, service categories, per-round R code and filter code); everything else is kept. The change lands in the editor's draft like the user's own edit, unsaved: the user keeps it with Save or discards it with Cancel. Ids are checked against the taxonomy and the editor's rounds before anything changes. Call get_hfa_indicator_editor first.",
      inputSchema: patchSchema,
      kind: "write",
      handler: (input, view) => {
        const before = view.context.getDraft();
        const patch = validatePatch(input, before, view.context);
        view.context.applyDraft(patch);
        const after = view.context.getDraft();
        return {
          applied: "in the editor, unsaved: the user saves or discards it",
          changes: describeChanges(patch, before, after),
          code: after.code,
          codeConsistent: after.codeConsistent,
        };
      },
      inProgressLabel: () =>
        t3({
          en: "Updating the indicator editor...",
          fr: "Mise à jour de l'éditeur d'indicateur...",
          pt: "A atualizar o editor de indicador...",
        }),
      completionMessage: () =>
        t3({
          en: "Updated the indicator editor",
          fr: "Éditeur d'indicateur mis à jour",
          pt: "Editor de indicador atualizado",
        }),
    }),
  ];
}
