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

export type DatasetUploadAttemptStatusLight = DatasetUploadAttemptStatus;

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

export type DatasetUploadAttemptDetail =
  | DatasetUploadAttemptDetailInitial
  | DatasetUploadAttemptDetailCsv;

// ============================================================================
// Staging Result Types
// ============================================================================

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

// Permanent = deterministic config error (4xx, e.g. 409 on a stale dx id) —
// re-running without fixing the config will fail again. Transient = server
// health (5xx/timeout) — a later re-run may succeed.
export type Dhis2FetchErrorKind = "permanent" | "transient";

// Per-(indicator, period) fetch instrumentation. The production counterpart
// of the Phase 0 lab timing evidence, so future slowness reports arrive with
// their own data (PLAN_DHIS2_IMPORTER A1). Lives in the run's run_stats blob.
// One entry per pair that REACHED a fetch route — unknown-id pairs (rule 4)
// never fetch and appear only in classification.unknownIds + the ledger.
// For the "dvs" route one pull covers many pairs — each covered pair carries
// the covering pull's request count and wall time (duplicated, not divided).
export type Dhis2PairFetchStat = {
  indicatorRawId: string;
  periodId: number;
  success: boolean;
  route: "analytics" | "dvs";
  requests: number;
  retries: number;
  // Wall time including retry sleeps (retries are capped at 3, so bounded) —
  // not pure server think time. HTTP statuses live in the error string +
  // errorKind, not as a separate field.
  totalFetchMs: number;
  maxRequestMs: number;
  rowsFetched: number;
  errorKind?: Dhis2FetchErrorKind;
  error?: string;
};

// The staging_result stored on a DHIS2 run's version row, written once at run
// end (slim: the version history UI needs only sourceType, dateImported,
// failedFetches, dhis2RowsDeleted, and counts). Per-run instrumentation lives
// in dataset_hmis_import_runs.run_stats, not here. The optional fields exist
// only so version rows written by the pre-run (stage-then-integrate) code
// still parse; the run worker never writes them.
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
  // Rows removed by the per-pair scoped deletes across the whole run.
  dhis2RowsDeleted?: number;
  // The run that minted this version.
  runId?: number;
  // Legacy fields (pre-run version rows only).
  succeededWorkItems?: Array<{ indicatorRawId: string; periodId: number }>;
  fetchedFacilityIds?: string[];
  pairFetchStats?: Dhis2PairFetchStat[];
  workItemHistory?: Array<{
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
// DHIS2 Import Run Types (PLAN_DHIS2_IMPORTER Phase 3 — C1/C2 + dispatcher)
// ============================================================================

export type Dhis2RunPair = { indicatorRawId: string; periodId: number };

export type Dhis2RunSelection =
  | {
      kind: "window";
      rawIndicatorIds: string[];
      startPeriod: number;
      endPeriod: number;
    }
  | { kind: "pairs"; pairs: Dhis2RunPair[] };

// Dispatcher route per raw indicator (PLAN_DHIS2_IMPORTER §4.4): "dvs" =
// dataValueSets (bare data elements and operands), "analytics" = the
// analytics engine (computed DHIS2 indicators + non-monthly re-routes).
export type Dhis2RunRoute = "dvs" | "analytics";

export type DatasetHmisImportRunStatus =
  | "running"
  | "complete"
  | "error"
  | "cancelled";

// Small JSON on the run row, rewritten at most every 2 s while fetching —
// per-pair outcomes live in the ledger, this is only "what is in flight now".
export type DatasetHmisImportRunProgress = {
  phase: "classifying" | "fetching" | "finalizing";
  activePairs: Array<{
    indicatorRawId: string;
    periodId: number;
    route: Dhis2RunRoute;
  }>;
};

// The summary projection of a run's selection: explicit pair lists collapse
// to a count (a retry-failed selection can carry ~1,440 pairs — the runs
// list is polled every 2 s and must stay small).
export type Dhis2RunSelectionSummary =
  | {
      kind: "window";
      rawIndicatorIds: string[];
      startPeriod: number;
      endPeriod: number;
    }
  | { kind: "pairs"; nPairs: number };

export type DatasetHmisImportRunSummary = {
  id: number;
  trigger: "manual" | "schedule";
  triggeredBy?: string;
  dhis2Url: string;
  selection: Dhis2RunSelectionSummary;
  status: DatasetHmisImportRunStatus;
  // Fatal run-level error (classification failed, credentials died, crash).
  // Per-pair failures are ledger rows + failedPairs, not this.
  error?: string;
  totalPairs: number;
  succeededPairs: number;
  failedPairs: number;
  startedAt: string;
  endedAt?: string;
  versionId?: number;
  // true = this run's shadow verification passed (first dispatcher run per
  // instance); undefined = shadow did not run (already passed previously).
  shadowPassed?: boolean;
  progress?: DatasetHmisImportRunProgress;
};

// The run_stats blob (durable per-run instrumentation — the home that
// PLAN_DHIS2_IMPORTER §4.1 designated for pairFetchStats). Not shipped in the
// runs list; server-side/debugging surface for now.
export type DatasetHmisImportRunStats = {
  classification: {
    dvsBareElements: number;
    dvsOperands: number;
    computedIndicators: number;
    // Raw indicator ids that exist in no DHIS2 metadata endpoint — recorded
    // as permanent ledger errors without any fetch (dispatcher rule 4).
    unknownIds: string[];
    // Elements re-routed to analytics after a non-monthly period id was
    // observed in their dataValueSets response (dispatcher rule 5).
    nonMonthlyElements: string[];
  };
  pairFetchStats: Dhis2PairFetchStat[];
  shadow?: {
    pairsChecked: number;
    facilitiesCompared: number;
    // "hard" fails the pair (and ≥3 hard-mismatch pairs abort the run);
    // "soft" = zero-vs-absent endpoint ambiguity, recorded only.
    mismatches: Array<{
      kind: "hard" | "soft";
      indicatorRawId: string;
      periodId: number;
      facilityId: string;
      dvsValue: number | undefined;
      analyticsValue: number | undefined;
    }>;
  };
};

// ============================================================================
// DHIS2 Import Types
// ============================================================================

export type Dhis2Credentials = {
  url: string;
  username: string;
  password: string;
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
