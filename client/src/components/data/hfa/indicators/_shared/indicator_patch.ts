import type {
  HfaIndicatorEditorDraft,
  HfaIndicatorEditorPatch,
  HfaTaxonomyInput,
} from "lib";

const none = "(none)";

function idList(items: { id: string }[]): string {
  return items.map((i) => i.id).join(", ") || none;
}

// Every id the patch names is checked against the taxonomy and the rounds the
// editor offers, its draft's rounds, before anything changes: the editor's
// write skips a round it does not hold without saying so. The error is
// written for the model that made the patch.
export function validateHfaIndicatorPatch(
  patch: HfaIndicatorEditorPatch,
  draft: HfaIndicatorEditorDraft,
  taxonomy: HfaTaxonomyInput,
): { patch: HfaIndicatorEditorPatch } | { error: string } {
  const given = Object.values(patch).filter((v) => v !== undefined);
  if (given.length === 0) {
    return {
      error: "No fields were provided. Pass at least one field to change.",
    };
  }
  if (
    patch.categoryId != null &&
    !taxonomy.categories.some((c) => c.id === patch.categoryId)
  ) {
    return {
      error:
        `Category "${patch.categoryId}" does not exist. Valid category ids: ${
          idList(taxonomy.categories)
        }.`,
    };
  }
  const categoryAfter = patch.categoryId === undefined
    ? draft.categoryId
    : patch.categoryId;
  if (patch.subCategoryId != null) {
    const sub = taxonomy.subCategories.find((s) =>
      s.id === patch.subCategoryId
    );
    if (sub === undefined) {
      return {
        error:
          `Sub-category "${patch.subCategoryId}" does not exist. Valid sub-category ids: ${
            idList(taxonomy.subCategories)
          }.`,
      };
    }
    if (sub.categoryId !== categoryAfter) {
      return {
        error:
          `Sub-category "${patch.subCategoryId}" belongs to category "${sub.categoryId}", but the indicator's category is "${
            categoryAfter ?? none
          }". Set a matching category in the same call.`,
      };
    }
  }
  if (patch.serviceCategoryIds !== undefined) {
    const bad = patch.serviceCategoryIds.filter((id) =>
      !taxonomy.serviceCategories.some((s) => s.id === id)
    );
    if (bad.length > 0) {
      return {
        error: `Service categories do not exist: ${
          bad.join(", ")
        }. Valid service-category ids: ${idList(taxonomy.serviceCategories)}.`,
      };
    }
  }
  if (
    patch.variantGroupId != null &&
    !taxonomy.variantGroups.some((g) => g.id === patch.variantGroupId)
  ) {
    return {
      error:
        `Variant group "${patch.variantGroupId}" does not exist. Valid group ids: ${
          idList(taxonomy.variantGroups)
        }.`,
    };
  }
  const rounds = new Set(draft.code.map((c) => c.timePoint));
  const notOffered = (timePoint: string) =>
    `Time point "${timePoint}" is not a round of this editor. Rounds: ${
      [...rounds].join(", ")
    }.`;
  const seenRounds = new Set<string>();
  for (const round of patch.code ?? []) {
    if (!rounds.has(round.timePoint)) {
      return { error: notOffered(round.timePoint) };
    }
    if (seenRounds.has(round.timePoint)) {
      return {
        error:
          `Time point "${round.timePoint}" is listed twice; list each round once.`,
      };
    }
    seenRounds.add(round.timePoint);
    if (round.code === undefined && round.filterCode === undefined) {
      return {
        error:
          `Round "${round.timePoint}" names no field to change; give code, filter code or both.`,
      };
    }
  }
  const groupAfter = patch.variantGroupId === undefined
    ? draft.variantGroupId
    : patch.variantGroupId;
  const items = taxonomy.variantItems.filter((i) => i.groupId === groupAfter);
  const seenRows = new Set<string>();
  for (const row of patch.variantCode ?? []) {
    if (!rounds.has(row.timePoint)) {
      return { error: notOffered(row.timePoint) };
    }
    if (!items.some((i) => i.id === row.itemId)) {
      return {
        error: `Variant item "${row.itemId}" is not in the variant group "${
          groupAfter ?? none
        }" the change leaves. Its items: ${idList(items)}.`,
      };
    }
    const key = `${row.timePoint} / ${row.itemId}`;
    if (seenRows.has(key)) {
      return {
        error: `Variant row "${key}" is listed twice; list each row once.`,
      };
    }
    seenRows.add(key);
  }
  return { patch };
}
