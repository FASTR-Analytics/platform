// ============================================================================
// Wizard config types
// ============================================================================

export type HfaRowFilter = {
  column: string;
  op: "equals" | "not_equals";
  value: string;
};

export type HfaDedupOverride = {
  facilityId: string;
  keepRow: number; // 1-based position of the data row in the file (computed, not a column)
};

export type HfaCsvMappingParams = {
  facilityIdColumn: string;
  timePoint: string;
  rowFilters: HfaRowFilter[];
  dedupStrategy: "first" | "last";
  dedupOverrides: HfaDedupOverride[];
};

export type HfaDuplicateGroup = {
  facilityId: string;
  rows: number[]; // surviving row numbers, ascending
};

export type HfaDuplicatePreview = {
  groups: HfaDuplicateGroup[];
  nRowsFilteredOut: number;
};

// What the wizard sends at launch. The file names are NOT part of it — they
// are re-derived server-side from the temp uploads, which are the authority.
export type HfaCsvRunLaunchInput = {
  csvUploadToken: string;
  xlsFormUploadToken: string;
  mappings: HfaCsvMappingParams;
};

// The launch payload stored in hfa_import_runs.csv_config. Two token-keyed
// temp uploads (the data CSV and the XLSForm questionnaire) plus the wizard's
// mappings. resumeFromStaging marks a needs_review run resolved with
// "Integrate anyway": the worker skips the stage leg and integrates the
// surviving per-run staging tables.
export type HfaCsvRunConfig = {
  csvUploadToken: string;
  csvFileName: string;
  xlsFormUploadToken: string;
  xlsFormFileName: string;
  mappings: HfaCsvMappingParams;
  resumeFromStaging?: boolean;
};

// ============================================================================
// Import Run Types (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase B)
// ============================================================================

// "needs_review" = staging dropped facility rows; the run holds with its
// diagnostics and RELEASES the single-running slot until the user integrates
// anyway or discards. No "queued" — HFA refuses a second launch explicitly.
export type HfaImportRunStatus =
  | "running"
  | "needs_review"
  | "complete"
  | "error"
  | "cancelled";

// Small JSON on the run row, rewritten at most every 2 s.
export type HfaImportRunProgress = {
  phase: "staging" | "integrating";
  percent: number;
};

export type HfaImportRunSummary = {
  id: number;
  triggeredBy?: string;
  timePoint: string;
  csvFileName: string;
  status: HfaImportRunStatus;
  error?: string;
  progress?: HfaImportRunProgress;
  // The staging diagnostics, durable for the run's whole life (written at the
  // needs_review hold AND at complete). Small enough to ride the polled list.
  diagnostics?: DatasetHfaCsvStagingResult;
  nRowsIntegrated?: number;
  startedAt: string;
  endedAt?: string;
};

// ============================================================================
// Staging Result Types
// ============================================================================

// The staging tables are named per run (see the run worker's
// hfaStagingTableNames) — never recorded here.
export type DatasetHfaCsvStagingResult = {
  dateImported: string;
  assetFileName: string;
  nRowsInFile: number;
  nRowsValid: number;
  nRowsInvalidMissingFacilityId: number;
  nRowsInvalidFacilityNotFound: number;
  nRowsDuplicated: number;
  nRowsFilteredOut: number;
  dedupStrategy: "first" | "last";
  nDedupOverridesApplied: number;
  nRowsTotal: number;
  timePoint: string;
  nDictionaryVars: number;
  nDictionaryValues: number;
  nXlsFormVarsNotInCsv: number;
  nCsvColsNotInXlsForm: number;
  nSelectMultipleExpanded: number;
};
