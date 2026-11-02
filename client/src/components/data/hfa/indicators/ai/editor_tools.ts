import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import {
  COPILOT_TOOL_VIEWS,
  describeHfaFieldIssue,
  formatHfaIndicatorDetailsForAI,
  type HfaIndicator,
  hfaIndicatorCodeSchema,
  hfaIndicatorEditSchema,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
  hfaIndicatorVariantCodeSchema,
  type HfaVariableRow,
  t3,
} from "lib";
import {
  copilotViews,
  type HfaIndicatorEditorContext,
  type HfaIndicatorEditorDraft,
  type HfaIndicatorEditorPatch,
} from "~/components/instance/copilot/mod.ts";
import { loadDisplayRows } from "./tools.ts";

// The HFA editor group: the code editor's unsaved draft of one indicator,
// read and written through the view's context. The write checks its ids
// against the taxonomy and the rounds the editor offers before it touches
// the draft, then lands in the editor's store like the user's own edit:
// unsaved, for the user to save or discard. The write never awaits, so the
// editor that set the view is the one it reaches; the read takes the draft
// first and only then awaits the display rows.

const field = hfaIndicatorEditSchema.shape;
const codeRoundSchema = hfaIndicatorCodeSchema.omit({ indicatorId: true });

const patchSchema = z.object({
  shortLabel: field.shortLabel.optional(),
  definition: field.definition.optional().describe("Long label."),
  type: field.type.optional(),
  aggregation: field.aggregation.optional(),
  categoryId: field.categoryId.optional().describe(
    "Category id, null to clear. Changing the category clears the sub-category unless one is given.",
  ),
  subCategoryId: field.subCategoryId.optional().describe(
    "Sub-category id within the category, null to clear.",
  ),
  serviceCategoryIds: field.serviceCategoryIds.optional().describe(
    "The full set of service-category ids.",
  ),
  variantGroupId: field.variantGroupId.optional().describe(
    "Variant group id, null to clear. Changing the group drops the previous group's variant code.",
  ),
  code: z.array(codeRoundSchema.partial({ code: true, filterCode: true }))
    .optional().describe(
      "Rounds to patch; a round not listed is kept. An omitted code or filter code is kept and an empty string clears it.",
    ),
  variantCode: z.array(
    hfaIndicatorVariantCodeSchema.omit({ indicatorId: true }),
  ).optional().describe(
    "Variant rows to set, for items of the group the patch leaves; an empty code removes the row.",
  ),
});

type Patch = z.infer<typeof patchSchema>;

// The draft in place of the indicator's saved state, over everything else the
// manager handed the editor: what the detail block and the status print.
function draftInput(
  indicatorId: string,
  draft: HfaIndicatorEditorDraft,
  context: HfaIndicatorEditorContext,
  displayRows: HfaVariableRow[] | undefined,
): HfaIndicatorsForAIInput {
  const indicators = context.getIndicators().map((i): HfaIndicator =>
    i.indicatorId === indicatorId
      ? {
        ...i,
        shortLabel: draft.shortLabel,
        definition: draft.definition,
        type: draft.type,
        aggregation: draft.aggregation,
        categoryId: draft.categoryId,
        subCategoryId: draft.subCategoryId,
        serviceCategoryIds: draft.serviceCategoryIds,
        variantGroupId: draft.variantGroupId,
      }
      : i
  );
  const code = [
    ...context.getAllCode().filter((c) => c.indicatorId !== indicatorId),
    ...draft.code.map((c) => ({
      indicatorId,
      timePoint: c.timePoint,
      code: c.code,
      filterCode: c.filterCode || undefined,
    })),
  ];
  const variantCode = [
    ...context.getAllVariantCode().filter((c) => c.indicatorId !== indicatorId),
    ...draft.variantCode.map((c) => ({ ...c, indicatorId })),
  ];
  const taxonomy = context.getTaxonomy();
  const dictionary = context.getDictionary();
  return {
    indicators,
    code,
    variantCode,
    taxonomy,
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
      "No fields were provided. Pass at least one field to change.",
    );
  }
  const t = context.getTaxonomy();
  if (
    patch.categoryId != null &&
    !t.categories.some((c) => c.id === patch.categoryId)
  ) {
    throw new AIToolFailure(
      `Category "${patch.categoryId}" does not exist. Valid category ids: ${
        t.categories.map((c) => c.id).join(", ") || none
      }.`,
    );
  }
  const categoryAfter = patch.categoryId === undefined
    ? draft.categoryId
    : patch.categoryId;
  if (patch.subCategoryId != null) {
    const sub = t.subCategories.find((s) => s.id === patch.subCategoryId);
    if (sub === undefined) {
      throw new AIToolFailure(
        `Sub-category "${patch.subCategoryId}" does not exist. Valid sub-category ids: ${
          t.subCategories.map((s) => s.id).join(", ") || none
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
    const bad = patch.serviceCategoryIds.filter((id) =>
      !t.serviceCategories.some((s) => s.id === id)
    );
    if (bad.length > 0) {
      throw new AIToolFailure(
        `Service categories do not exist: ${
          bad.join(", ")
        }. Valid service-category ids: ${
          t.serviceCategories.map((s) => s.id).join(", ") || none
        }.`,
      );
    }
  }
  if (
    patch.variantGroupId != null &&
    !t.variantGroups.some((g) => g.id === patch.variantGroupId)
  ) {
    throw new AIToolFailure(
      `Variant group "${patch.variantGroupId}" does not exist. Valid group ids: ${
        t.variantGroups.map((g) => g.id).join(", ") || none
      }.`,
    );
  }
  const rounds = new Set(draft.code.map((c) => c.timePoint));
  const offered = (timePoint: string) => {
    if (!rounds.has(timePoint)) {
      throw new AIToolFailure(
        `Time point "${timePoint}" is not a round of this editor. Rounds: ${
          [...rounds].join(", ")
        }.`,
      );
    }
  };
  const seenRounds = new Set<string>();
  for (const round of patch.code ?? []) {
    offered(round.timePoint);
    if (seenRounds.has(round.timePoint)) {
      throw new AIToolFailure(
        `Time point "${round.timePoint}" is listed twice; list each round once.`,
      );
    }
    seenRounds.add(round.timePoint);
    if (round.code === undefined && round.filterCode === undefined) {
      throw new AIToolFailure(
        `Round "${round.timePoint}" names no field to change; give code, filter code or both.`,
      );
    }
  }
  const groupAfter = patch.variantGroupId === undefined
    ? draft.variantGroupId
    : patch.variantGroupId;
  const items = t.variantItems.filter((i) => i.groupId === groupAfter);
  const seenRows = new Set<string>();
  for (const row of patch.variantCode ?? []) {
    offered(row.timePoint);
    if (!items.some((i) => i.id === row.itemId)) {
      throw new AIToolFailure(
        `Variant item "${row.itemId}" is not in the variant group "${
          groupAfter ?? none
        }" the change leaves. Its items: ${
          items.map((i) => i.id).join(", ") || none
        }.`,
      );
    }
    const key = `${row.timePoint} / ${row.itemId}`;
    if (seenRows.has(key)) {
      throw new AIToolFailure(
        `Variant row "${key}" is listed twice; list each row once.`,
      );
    }
    seenRows.add(key);
  }
  return patch;
}

function changeLine(
  label: string,
  before: string | null,
  after: string | null,
): string {
  return before === after
    ? `${label}: no change`
    : `${label}: "${before ?? none}" → "${after ?? none}"`;
}

// What the write did, field by field: a field whose new value equals the
// draft's is reported as no change, never as an update.
function describeChanges(
  patch: HfaIndicatorEditorPatch,
  before: HfaIndicatorEditorDraft,
  after: HfaIndicatorEditorDraft,
): string[] {
  const lines: string[] = [];
  for (
    const key of [
      "shortLabel",
      "definition",
      "type",
      "aggregation",
      "categoryId",
      "variantGroupId",
    ] as const
  ) {
    if (patch[key] !== undefined) {
      lines.push(changeLine(key, before[key], after[key]));
    }
  }
  if (patch.subCategoryId !== undefined) {
    lines.push(
      changeLine("subCategoryId", before.subCategoryId, after.subCategoryId),
    );
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
  if (before.variantGroupId !== after.variantGroupId) {
    const dropped = before.variantCode.map((v) => `${v.timePoint} ${v.itemId}`);
    if (dropped.length > 0) {
      lines.push(
        `variant code of the previous group dropped: ${dropped.join(", ")}`,
      );
    }
  }
  for (const round of patch.code ?? []) {
    const b = before.code.find((c) => c.timePoint === round.timePoint);
    const a = after.code.find((c) => c.timePoint === round.timePoint);
    if (b === undefined || a === undefined) continue;
    if (round.code !== undefined) {
      lines.push(changeLine(`${round.timePoint} code`, b.code, a.code));
    }
    if (round.filterCode !== undefined) {
      lines.push(
        changeLine(
          `${round.timePoint} filter code`,
          b.filterCode,
          a.filterCode,
        ),
      );
    }
  }
  for (const row of patch.variantCode ?? []) {
    const find = (d: HfaIndicatorEditorDraft) =>
      d.variantCode.find((v) =>
        v.timePoint === row.timePoint && v.itemId === row.itemId
      )?.code ?? null;
    lines.push(
      changeLine(
        `${row.timePoint} variant ${row.itemId}`,
        find(before),
        find(after),
      ),
    );
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
        "Read the HFA indicator open in the code editor as its unsaved draft stands, in full: both labels, the measure, type and aggregation, categories, the variant group and its items, and per round the code, the filter, each item's variant code, the round status and its issues; then every survey variable and every other indicator the code names, once. Also names the round the user is looking at. Call this before update_hfa_indicator_editor.",
      inputSchema: z.object({}),
      kind: "read",
      handler: async (_input, view) => {
        const indicatorId = view.params.indicatorId;
        const draft = view.context.getDraft();
        const selected = view.context.getSelectedTimePoint();
        const input = draftInput(
          indicatorId,
          draft,
          view.context,
          await loadDisplayRows(),
        );
        return [
          `The unsaved state of indicator ${indicatorId} in the code editor: nothing here is saved until the user saves. The user is looking at round ${selected}.`,
          "",
          formatHfaIndicatorDetailsForAI(input, [indicatorId]),
        ].join("\n");
      },
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
        "Change the HFA indicator open in the code editor. Provide only the fields to change (labels, type, aggregation, category, sub-category, service categories, variant group, per-round code and filter, per-item variant code); everything else is kept. The change lands in the editor's draft like the user's own edit, unsaved: the user keeps it with Save or discards it with Cancel. Ids, items and rounds are checked before anything changes. The result gives each round's status after the change. Call get_hfa_indicator_editor first.",
      inputSchema: patchSchema,
      kind: "write",
      handler: (input, view) => {
        const before = view.context.getDraft();
        const patch = validatePatch(input, before, view.context);
        view.context.applyDraft(patch);
        const after = view.context.getDraft();
        const status = draftInput(
          view.params.indicatorId,
          after,
          view.context,
          undefined,
        ).status.get(view.params.indicatorId);
        return [
          "Applied in the editor, unsaved: the user saves or discards it.",
          ...describeChanges(patch, before, after),
          "Round status after the change:",
          ...(status?.rounds ?? []).flatMap((r) => [
            `- ${r.timePoint}: ${r.status}`,
            ...r.issues.map((i) => `  ${describeHfaFieldIssue(i)}`),
          ]),
        ].join("\n");
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
