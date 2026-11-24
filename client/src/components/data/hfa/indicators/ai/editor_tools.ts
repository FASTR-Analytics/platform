import { AIToolFailure, createAITool } from "panther";
import {
  copilotToolContract,
  describeHfaFieldIssue,
  formatHfaIndicatorDetailsForAI,
  type HfaIndicator,
  type HfaIndicatorEditorDraft,
  type HfaIndicatorEditorPatch,
  type HfaIndicatorsForAIInput,
  hfaIndicatorsStatus,
  type HfaVariableRow,
  t3,
} from "lib";
import {
  copilotViews,
  type HfaIndicatorEditorContext,
} from "~/components/instance/copilot/mod.ts";
import { loadDisplayRows, validateHfaIndicatorPatch } from "../_shared/mod.ts";

// The HFA editor group: the code editor's unsaved draft of one indicator,
// read and written through the view's context. The write checks its ids
// against the taxonomy and the rounds the editor offers before it touches
// the draft, then lands in the editor's store like the user's own edit:
// unsaved, for the user to save or discard. The write never awaits, so the
// editor that set the view is the one it reaches; the read takes the draft
// first and only then awaits the display rows.

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
      ...copilotToolContract("get_hfa_indicator_editor"),
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
      inProgressLabel: t3({
        en: "Getting the indicator editor...",
        fr: "Récupération de l'éditeur d'indicateur...",
        pt: "A obter o editor de indicador...",
      }),
      successMessage: t3({
        en: "Retrieved the indicator editor",
        fr: "Éditeur d'indicateur récupéré",
        pt: "Editor de indicador obtido",
      }),
    }),
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("update_hfa_indicator_editor"),
      handler: (input, view) => {
        const before = view.context.getDraft();
        const checked = validateHfaIndicatorPatch(
          input,
          before,
          view.context.getTaxonomy(),
        );
        if ("error" in checked) throw new AIToolFailure(checked.error);
        view.context.applyDraft(checked.patch);
        const after = view.context.getDraft();
        const status = draftInput(
          view.params.indicatorId,
          after,
          view.context,
          undefined,
        ).status.get(view.params.indicatorId);
        return [
          "Applied in the editor, unsaved: the user saves or discards it.",
          ...describeChanges(checked.patch, before, after),
          "Round status after the change:",
          ...(status?.rounds ?? []).flatMap((r) => [
            `- ${r.timePoint}: ${r.status}`,
            ...r.issues.map((i) => `  ${describeHfaFieldIssue(i)}`),
          ]),
        ].join("\n");
      },
      inProgressLabel: t3({
        en: "Updating the indicator editor...",
        fr: "Mise à jour de l'éditeur d'indicateur...",
        pt: "A atualizar o editor de indicador...",
      }),
      successMessage: t3({
        en: "Updated the indicator editor",
        fr: "Éditeur d'indicateur mis à jour",
        pt: "Editor de indicador atualizado",
      }),
    }),
  ];
}
