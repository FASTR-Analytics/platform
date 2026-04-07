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
  step: 1 | 2 | 3 | 4;
  status: DatasetHfaUploadAttemptStatus;
  sourceType: "csv";
  // Step 1: CSV + XLSForm upload details
  step1Result: DatasetHfaStep1Result | undefined;
  // Step 2: CSV column mappings
  step2Result: HfaCsvMappingParams | undefined;
  // Step 3: CSV staging result
  step3Result: DatasetHfaCsvStagingResult | undefined;
};

export type HfaCsvMappingParams = {
  facility_id: string;
  timePointId: string;
  timePointLabel: string;
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
  nRowsTotal: number;
  byVariable: [];
  timePointValue: string;
  nDictionaryVars: number;
  nDictionaryValues: number;
  nXlsFormVarsNotInCsv: number;
  nCsvColsNotInXlsForm: number;
  nSelectMultipleExpanded: number;
};

// ============================================================================
// API Response Types
// ============================================================================

export type DatasetHfaUploadStatusResponse =
  | {
      id: string;
      step: number;
      status: DatasetHfaUploadAttemptStatusLight;
      isActive: true; // Continue polling
    }
  | {
      id: string;
      step: number;
      status: DatasetHfaUploadAttemptStatusLight;
      isActive: false; // Stop polling
      fullDetail: DatasetHfaUploadAttemptDetail; // Full data for UI transition
    };
