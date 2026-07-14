import { CsvDetails, TableColumn } from "./instance.ts";
import { Dhis2CredentialsRedacted } from "./structure.ts";

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
  // Step 1: DHIS2 confirmation. Redacted — the password never leaves the
  // server; the full credentials stay in the DB row for the staging worker.
  step1Result: Dhis2CredentialsRedacted | undefined;
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

export type PeriodIndicatorRawStat = {
  periodId: number;
  indicatorRawId: string;
  nRecords: number;
  totalCount: number;
};

// Per-(indicator, period) row count that a DHIS2 scoped delete-then-insert
// integration would remove, computed read-only before integration runs.
export type Dhis2ScopedDeletionPreviewItem = {
  indicatorRawId: string;
  periodId: number;
  rowsToRemove: number;
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

// Permanent = deterministic config error (4xx, e.g. 409 on a stale dx id) —
// re-running without fixing the config will fail again. Transient = server
// health (5xx/timeout) — a later re-run may succeed.
export type Dhis2FetchErrorKind = "permanent" | "transient";

// Per-(indicator, period) fetch instrumentation, rolled up across facility
// batches. The production counterpart of the Phase 0 lab timing evidence, so
// future slowness reports arrive with their own data (PLAN_DHIS2_IMPORTER A1).
export type Dhis2PairFetchStat = {
  indicatorRawId: string;
  periodId: number;
  success: boolean;
  route: "analytics";
  requests: number;
  retries: number;
  totalFetchMs: number;
  maxRequestMs: number;
  rowsFetched: number;
  errorKind?: Dhis2FetchErrorKind;
  error?: string;
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
    errorKind?: Dhis2FetchErrorKind;
  }>;
  periodIndicatorStats: PeriodIndicatorRawStat[];
  finalStagingRowCount: number;
  // NEW: every (indicator, period) work item that fetched cleanly — including
  // those that returned zero rows. Paired with fetchedFacilityIds below, this
  // is the authoritative delete scope for integration. Absent (undefined) ⇒
  // staged by pre-fix code ⇒ fall back to the legacy merge (no scoped delete).
  succeededWorkItems?: Array<{ indicatorRawId: string; periodId: number }>;
  // NEW: the exact facility_id set queried against DHIS2 at staging time (one
  // list, reused for every work item — see Step 2). Integration deletes against
  // this literal snapshot rather than re-deriving "which facilities count" from
  // a regex at a later point in time, so delete-scope == fetch-scope by
  // construction — no separate correctness argument needed.
  fetchedFacilityIds?: string[];
  // NEW: populated only at INTEGRATION time (Step 4), never by the staging
  // worker — undefined here, always. Integration rewrites this field's stored
  // copy after Phase 4 to (a) record how many rows the scoped delete removed,
  // for accurate UI reporting, and (b) drop fetchedFacilityIds from what's
  // persisted (needed only to drive Phase 4, not to be kept in version
  // history — see Step 4).
  dhis2RowsDeleted?: number;
  // Absent on results staged by pre-instrumentation code.
  pairFetchStats?: Dhis2PairFetchStat[];
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
// Import Ledger Types
// ============================================================================

// One row per (raw indicator, month): the latest import state of that pair
// (PLAN_DHIS2_IMPORTER WS-B). status 'error' keeps the last data-bearing
// counts untouched — the error describes the most recent failed attempt.
export type DatasetHmisImportLedgerItem = {
  indicatorRawId: string;
  periodId: number;
  nRecords: number;
  sumCount: number;
  source: "dhis2" | "csv" | "backfill";
  status: "ready" | "error";
  // Prefixed with the failure classification: "[permanent] …" (config error,
  // will fail again until fixed) or "[transient] …" (server health).
  error?: string;
  // ISO timestamp of the last successful import of this pair; undefined =
  // pre-ledger backfill (or an error-only pair that never imported).
  importedAt?: string;
  versionId?: number;
};

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

export type DatasetUploadStatusResponse = {
  id: string;
  step: number;
  status: DatasetUploadAttemptStatusLight;
  isActive: boolean; // false = stop polling
};
