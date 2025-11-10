import { CsvDetails, TableColumn } from "./instance.ts";

// ============================================================================
// Upload Attempt Status Types
// ============================================================================

export type DatasetUploadAttemptStatus =
  | {
      status: "configuring";
    }
  | {
      status: "staging";
      progress: number;
    }
  | {
      status: "staging_dhis2";
      progress: number;
      totalWorkItems: number;
      completedWorkItems: number;
      failedWorkItems: number;
      activeWorkItems: Array<{
        indicatorId: string;
        periodId: number;
        facilityBatchesCompleted: number;
        totalFacilityBatches: number;
        startTime: string;
      }>;
      completedWorkItemHistory: Array<{
        indicatorId: string;
        periodId: number;
        success: boolean;
        rowsStaged: number;
        facilityBatchesProcessed: number;
        completedAt: string;
        durationMs: number;
      }>;
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

export type DatasetUploadAttemptStatusLight =
  | {
      status: "configuring";
    }
  | {
      status: "staging";
      progress: number;
    }
  | {
      status: "staging_dhis2";
      progress: number;
      totalWorkItems: number;
      completedWorkItems: number;
      failedWorkItems: number;
      activeWorkItems: Array<{
        indicatorId: string;
        periodId: number;
        facilityBatchesCompleted: number;
        totalFacilityBatches: number;
        startTime: string;
      }>;
      // No completedWorkItemHistory - just summary counts
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

export type DatasetUploadAttemptSummary = {
  id: string;
  dateStarted: string;
  status: DatasetUploadAttemptStatus;
};

export type DatasetUploadAttemptDetailInitial = {
  id: string;
  dateStarted: string;
  step: 0;
  status: DatasetUploadAttemptStatus;
  sourceType: undefined;
  step1Result: undefined;
  step2Result: undefined;
  step3Result: undefined;
};

export type DatasetUploadAttemptDetailCsv = {
  id: string;
  dateStarted: string;
  step: 1 | 2 | 3 | 4;
  status: DatasetUploadAttemptStatus;
  sourceType: "csv";
  // Step 1: CSV upload details
  step1Result: CsvDetails | undefined;
  // Step 2: CSV column mappings
  step2Result: HmisCsvMappingParams | undefined;
  // Step 3: CSV staging result
  step3Result: DatasetCsvStagingResult | undefined;
};

export type HmisCsvMappingParams = {
  facility_id: string;
  raw_indicator_id: string;
  period_id: string;
  count: string;
};

export type DatasetUploadAttemptDetailDhis2 = {
  id: string;
  dateStarted: string;
  step: 1 | 2 | 3 | 4;
  status: DatasetUploadAttemptStatus;
  sourceType: "dhis2";
  // Step 1: DHIS2 confirmation
  step1Result: Dhis2Credentials | undefined;
  // Step 2: DHIS2 selection parameters
  step2Result: Dhis2SelectionParams | undefined;
  // Step 3: DHIS2 staging result
  step3Result: DatasetDhis2StagingResult | undefined;
};

export type DatasetUploadAttemptDetail =
  | DatasetUploadAttemptDetailInitial
  | DatasetUploadAttemptDetailCsv
  | DatasetUploadAttemptDetailDhis2;

// ============================================================================
// Staging Result Types
// ============================================================================

export type PeriodIndicatorStat = {
  periodId: number;
  indicatorCommonId: string;
  nRecords: number;
  totalCount: number;
};

export type PeriodIndicatorRawStat = {
  periodId: number;
  indicatorRawId: string;
  nRecords: number;
  totalCount: number;
};

export type DatasetCsvStagingResult = {
  sourceType: "csv";
  dateImported: string;
  assetFileName: string;
  periodIndicatorStats: PeriodIndicatorRawStat[];
  rawCsvRowCount: number;
  validCsvRowCount: number;
  dedupedRowCount: number;
  finalStagingRowCount: number;
  validation?: {
    // Initial CSV validation failures
    invalidPeriods: {
      rowsDropped: number;
    };
    invalidCounts: {
      rowsDropped: number;
    };
    missingRequiredFields: {
      rowsDropped: number;
    };
    // Reference validation failures
    invalidFacilities: {
      total: number;
      sample: Array<{
        facility_id: string;
        row_count: number;
      }>;
      rowsDropped: number;
    };
    unmappedIndicators: {
      total: number;
      sample: Array<{
        indicator_raw_id: string;
        row_count: number;
      }>;
      rowsDropped: number;
    };
  };
};

export type DatasetDhis2StagingResult = {
  sourceType: "dhis2";
  dateImported: string;
  totalIndicatorPeriodCombos: number;
  successfulFetches: number;
  failedFetches: Array<{
    indicatorRawId: string;
    periodId: number;
    error: string;
  }>;
  periodIndicatorStats: PeriodIndicatorRawStat[];
  finalStagingRowCount: number;
  missingOrgUnits?: string[];
  workItemHistory: Array<{
    indicatorId: string;
    periodId: number;
    success: boolean;
    rowsStaged: number;
    facilityBatchesProcessed: number;
    completedAt: string;
    durationMs: number;
  }>;
};

export type DatasetStagingResult =
  | DatasetCsvStagingResult
  | DatasetDhis2StagingResult;

// ============================================================================
// DHIS2 Import Types
// ============================================================================

export type Dhis2Credentials = {
  url: string;
  username: string;
  password: string;
};

export type Dhis2SelectionParams = {
  rawIndicatorIds: string[];
  startPeriod: number;
  endPeriod: number;
};

// ============================================================================
// API Response Types
// ============================================================================

export type DatasetUploadStatusResponse =
  | {
      id: string;
      step: number;
      status: DatasetUploadAttemptStatusLight;
      isActive: true; // Continue polling
    }
  | {
      id: string;
      step: number;
      status: DatasetUploadAttemptStatusLight;
      isActive: false; // Stop polling
      fullDetail: DatasetUploadAttemptDetail; // Full data for UI transition
    };
