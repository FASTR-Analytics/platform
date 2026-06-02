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

export type HfaIndicator = {
  varName: string;
  categoryId: string | null;
  subCategoryId: string | null;
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
  rFilterCode: string | undefined;
};

// Payload for importing a full HFA indicator workbook (parsed client-side from
// an .xlsx). Row order in each list defines sort order.
export type HfaWorkbookImport = {
  categories: { id: string; label: string }[];
  subCategories: { id: string; categoryId: string; label: string }[];
  indicators: {
    varName: string;
    categoryId: string | null;
    subCategoryId: string | null;
    shortLabel: string;
    definition: string;
    type: "binary" | "numeric";
    aggregation: "sum" | "avg";
  }[];
  code: HfaIndicatorCode[];
  replaceAll: boolean;
};

export type HfaDictionaryForValidation = {
  timePoints: {
    timePoint: string;
    vars: { varName: string; varLabel: string; varType: string }[];
    values: { varName: string; value: string; valueLabel: string }[];
  }[];
};
