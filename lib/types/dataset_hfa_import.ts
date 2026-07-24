import { CsvDetails } from "./instance.ts";

// ============================================================================
// Step 1 Result Type (combined CSV + XLSForm)
// ============================================================================

export type DatasetHfaStep1Result = {
  csv: CsvDetails;
  xlsForm: {
    fileName: string;
    filePath: string;
  };
};

// ============================================================================
// Upload Attempt Status Types
// ============================================================================

export type DatasetHfaUploadAttemptStatus =
  | {
      status: "configuring";
    }
  | {
      status: "staging";
      progress: number;
    }
  | {
      status: "staged";
      result?: DatasetHfaCsvStagingResult;
    }
  | {
      status: "integrating";
      progress: number;
    }
  | {
      status: "complete";
      nRowsIntegrated?: number;
    }
  | {
      status: "error";
      err: string;
    };

export type DatasetHfaUploadAttemptStatusLight =
  | {
      status: "configuring";
    }
  | {
      status: "staging";
      progress: number;
    }
  | {
      status: "staged";
    }
  | {
      status: "integrating";
      progress: number;
    }
  | {
      status: "complete";
    }
  | {
      status: "error";
      err: string;
    };

// ============================================================================
// Upload Attempt Detail Types
// ============================================================================

export type DatasetHfaUploadAttemptSummary = {
  id: string;
  dateStarted: string;
  status: DatasetHfaUploadAttemptStatus;
};

export type DatasetHfaUploadAttemptDetail = {
  id: string;
  dateStarted: string;
  // 1 upload, 2 mappings+filters, 3 duplicates review, 4 stage, 5 integrate
  step: 1 | 2 | 3 | 4 | 5;
  status: DatasetHfaUploadAttemptStatus;
  sourceType: "csv";
  step1Result: DatasetHfaStep1Result | undefined;
  step2Result: HfaCsvMappingParams | undefined;
  step3Result: DatasetHfaCsvStagingResult | undefined;
};

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

// ============================================================================
// Staging Result Types
// ============================================================================

export type DatasetHfaCsvStagingResult = {
  stagingTableName: string;
  dictionaryVarsStagingTableName: string;
  dictionaryValuesStagingTableName: string;
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

// ============================================================================
// API Response Types
// ============================================================================

export type DatasetHfaUploadStatusResponse = {
  id: string;
  step: number;
  status: DatasetHfaUploadAttemptStatusLight;
  isActive: boolean; // false = stop polling
};
