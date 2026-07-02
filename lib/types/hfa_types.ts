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
};

export type HfaIndicatorCode = {
  varName: string;
  timePoint: string;
  rCode: string;
  rFilterCode?: string | undefined;
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
  }[];
};

// Payload for importing a full HFA indicator workbook (parsed client-side from
// an .xlsx). Row order in each list defines sort order.
export type HfaWorkbookImport = {
  categories: { id: string; label: string }[];
  subCategories: { id: string; categoryId: string; label: string }[];
  serviceCategories: { id: string; label: string }[];
  indicators: {
    varName: string;
    categoryId: string | null;
    subCategoryId: string | null;
    serviceCategoryIds: string[];
    shortLabel: string;
    definition: string;
    type: "binary" | "numeric";
    aggregation: "sum" | "avg";
  }[];
  code: HfaIndicatorCode[];
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
