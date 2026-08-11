export type HfaIndicatorCategory = {
  id: string;
  label: string;
  sortOrder: number;
};

export type HfaIndicatorSubCategory = {
  id: string;
  categoryId: string;
  label: string;
  sortOrder: number;
};

export type HfaIndicatorServiceCategory = {
  id: string;
  label: string;
  sortOrder: number;
};

export type HfaIndicatorVariantGroup = {
  id: string;
  label: string;
  sortOrder: number;
};

export type HfaIndicatorVariantItem = {
  id: string;
  groupId: string;
  label: string;
  sortOrder: number;
};

export type HfaIndicator = {
  varName: string;
  categoryId: string | null;
  subCategoryId: string | null;
  serviceCategoryIds: string[];
  shortLabel: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sortOrder: number;
  hasSyntaxError: boolean;
  codeConsistent: boolean;
  variantGroupId: string | null;
};

export type HfaIndicatorCode = {
  varName: string;
  timePoint: string;
  rCode: string;
  rFilterCode?: string | undefined;
};

// Per-item numerator code for an indicator's variant group. Filter code has no
// per-item slot: `rFilterCode` on the parent's HfaIndicatorCode row is shared
// by all items of that (indicator, time_point).
export type HfaIndicatorVariantCode = {
  varName: string;
  timePoint: string;
  itemId: string;
  rCode: string;
};

// The no-run / unreadable-run state: every taxonomy list empty.
export const EMPTY_HFA_TAXONOMY: HfaTaxonomyForAI = {
  categories: [],
  subCategories: [],
  serviceCategories: [],
  variantGroups: [],
  variantItems: [],
  timePoints: [],
  indicators: [],
};

// Full HFA indicator taxonomy surfaced to the AI (get_available_metrics).
// Sourced from the per-project snapshot tables, so it reflects the project's
// service-category scoping. Categories/sub-categories/service-categories carry
// their IDs so the model can query the hfa_category / hfa_sub_category /
// hfa_service_category disaggregations; indicators reference those IDs.
export type HfaTaxonomyForAI = {
  categories: { id: string; label: string }[];
  subCategories: { id: string; categoryId: string; label: string }[];
  serviceCategories: { id: string; label: string }[];
  // Variant groups/items feed the hfa_variant_item disaggregation: item ids are
  // the column's values, and indicators reference their group via variantGroupId.
  variantGroups: { id: string; label: string }[];
  variantItems: { id: string; groupId: string; label: string }[];
  // Time points are instance-wide (the whole instance shares HFA survey
  // rounds), not project-scoped. `id` is the time_point value used in data /
  // filters (the label PK); `periodId` is the period it maps to.
  timePoints: { id: string; label: string; periodId: string }[];
  indicators: {
    id: string;
    label: string;
    // Human description of the measurement, e.g. "% of facilities" — rendered as
    // a separate annotation so the model knows what the value means.
    measure: string;
    categoryId: string | null;
    subCategoryId: string | null;
    serviceCategoryIds: string[];
    variantGroupId: string | null;
  }[];
};

// Payload for importing a full HFA indicator workbook (parsed client-side from
// an .xlsx). Row order in each list defines sort order.
export type HfaWorkbookImport = {
  categories: { id: string; label: string }[];
  subCategories: { id: string; categoryId: string; label: string }[];
  serviceCategories: { id: string; label: string }[];
  variantGroups: { id: string; label: string }[];
  variantItems: { id: string; groupId: string; label: string }[];
  indicators: {
    varName: string;
    categoryId: string | null;
    subCategoryId: string | null;
    serviceCategoryIds: string[];
    shortLabel: string;
    definition: string;
    type: "binary" | "numeric";
    aggregation: "sum" | "avg";
    variantGroupId: string | null;
  }[];
  code: HfaIndicatorCode[];
  variantCode: HfaIndicatorVariantCode[];
  replaceAll: boolean;
};

export type HfaWorkbookImportResult = {
  imported: number;
  // Add mode only: varNames present in the workbook that already exist on the
  // platform and were therefore left untouched.
  skippedExisting: string[];
};

export type HfaDictionaryForValidation = {
  timePoints: {
    timePoint: string;
    vars: { varName: string; varLabel: string; varType: string }[];
    values: { varName: string; value: string; valueLabel: string }[];
  }[];
};
