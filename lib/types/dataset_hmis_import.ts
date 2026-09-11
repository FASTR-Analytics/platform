import type { AssetFilePin } from "./assets.ts";
import type { Dhis2StoredCredentialsInfo } from "./dhis2.ts";

// ============================================================================
// CSV Import Run Types (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase A)
// ============================================================================

export type HmisCsvMappingParams = {
  facility_id: string;
  source_id: string;
  period_id: string;
  count: string;
};

// What the wizard sends at launch: the input asset's fileName plus the
// mappings. The server validates the asset exists and stamps the pin.
export type DatasetHmisCsvRunLaunchInput = {
  fileName: string;
  mappings: HmisCsvMappingParams;
};

// The CSV launch payload stored in dataset_hmis_import_runs.csv_config. The
// file is an instance asset named by fileName, byte-pinned at launch
// validation (see AssetFilePin). resumeFromStaging marks a needs_review run
// resolved with "Integrate anyway": the worker skips the stage leg and
// integrates the surviving per-run staging table.
export type DatasetHmisCsvRunConfig = {
  fileName: string;
  filePin: AssetFilePin;
  mappings: HmisCsvMappingParams;
  resumeFromStaging?: boolean;
};

// ============================================================================
// Staging Result Types
// ============================================================================

export type PeriodSourceStat = {
  periodId: number;
  sourceId: string;
  nRecords: number;
  totalCount: number;
};

export type DatasetCsvStagingResult = {
  sourceType: "csv";
  dateImported: string;
  assetFileName: string;
  periodIndicatorStats: PeriodSourceStat[];
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
    // Rows whose source id is no source of any indicator.
    unknownSources: {
      total: number;
      sample: Array<{
        source_id: string;
        row_count: number;
      }>;
      rowsDropped: number;
    };
  };
};

// Permanent = deterministic config error (4xx, e.g. 409 on a stale dx id):
// re-running without fixing the config will fail again. Transient = server
// health (5xx/timeout): a later re-run may succeed.
export type Dhis2FetchErrorKind = "permanent" | "transient";

// Per-(source, period) fetch instrumentation, so slowness reports arrive
// with their own data. Lives in the run's run_stats blob. One entry per pair
// that reached a fetch: ids the dispatcher refused (classification.unknownIds
// and dhis2IndicatorIds) never fetch and appear only there and in the ledger.
// One dataValueSets pull covers every pair sharing its base element and
// month: each covered pair carries the covering pull's request count and
// wall time (duplicated, not divided).
export type Dhis2PairFetchStat = {
  sourceId: string;
  periodId: number;
  success: boolean;
  requests: number;
  retries: number;
  // Wall time including retry sleeps (retries are capped at 3, so bounded):
  // not pure server think time. HTTP statuses live in the error string +
  // errorKind, not as a separate field.
  totalFetchMs: number;
  maxRequestMs: number;
  rowsFetched: number;
  // Facility values skipped as not non-negative integers (the ledger row
  // carries the sample).
  skippedValues: number;
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
    sourceId: string;
    periodId: number;
    error: string;
    errorKind?: Dhis2FetchErrorKind;
  }>;
  periodIndicatorStats: PeriodSourceStat[];
  finalStagingRowCount: number;
  // Rows removed by the per-pair scoped deletes across the whole run.
  dhis2RowsDeleted?: number;
  // The run that minted this version.
  runId?: number;
  // Legacy fields (pre-run version rows only).
  succeededWorkItems?: Array<{ sourceId: string; periodId: number }>;
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

export type DatasetHmisLedgerSkippedValue = { facilityId: string; value: string };

// One row per (source, month): the latest import state of that pair
// (PLAN_DHIS2_IMPORTER WS-B). status 'error' keeps the last data-bearing
// counts untouched: the error describes the most recent failed attempt.
export type DatasetHmisImportLedgerItem = {
  sourceId: string;
  periodId: number;
  nRecords: number;
  sumCount: number;
  // DHIS2 facility values left out of the pair at its last import because
  // they were not non-negative integers, with a sample of at most
  // SKIPPED_VALUES_SAMPLE_CAP (facility, value). CSV pairs record none: a
  // bad CSV count is dropped and counted at staging.
  skippedValues: number;
  skippedValuesSample: DatasetHmisLedgerSkippedValue[];
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
// DHIS2 Import Run Types (PLAN_DHIS2_IMPORTER Phase 3: C1/C2 + dispatcher)
// ============================================================================

// A pair is one source × one month: the unit the importer fetches and
// integrates, and the grain of the ledger.
export type Dhis2RunPair = { sourceId: string; periodId: number };

// What a launch, enqueue or schedule fire selects: INDICATORS over a month
// window (PLAN_A3 ruling 7), or explicit source pairs (retry failed,
// re-import from the ledger: that is what a pair is).
export type Dhis2WindowSelectionInput = {
  kind: "window";
  indicatorIds: string[];
  startPeriod: number;
  endPeriod: number;
};

export type Dhis2RunSelectionInput =
  | Dhis2WindowSelectionInput
  | { kind: "pairs"; pairs: Dhis2RunPair[] };

// The expansion of a window selection's indicators to the sources a DHIS2
// run fetches (`expandIndicatorSelectionToSources`, lib): a derived
// indicator flattens to its base ingredients, a base contributes its
// sources. Population terms and sources that are not DHIS2-shaped are
// dropped and listed. Persisted on the run row and carried in the worker
// message, so the worker and the history tab never re-resolve: a source
// added to a base after enqueue is not in that run.
export type Dhis2SelectionExpansion = {
  sourceIds: string[];
  populationTermsDropped: string[];
  nonDhis2SourcesDropped: string[];
};

export type Dhis2WindowSelection =
  & Dhis2WindowSelectionInput
  & Dhis2SelectionExpansion;

// The selection as stored on dataset_hmis_import_runs.selection.
export type Dhis2RunSelection =
  | Dhis2WindowSelection
  | { kind: "pairs"; pairs: Dhis2RunPair[] };

// "queued" = waiting behind the running run; the ~60 s scheduler tick drains
// queued rows FIFO once the import slot is free (PLAN_DHIS2_IMPORTER Phase 4,
// C6: queue, not concurrent execution). "needs_review" = a CSV stage dropped
// rows; the run holds with diagnostics and RELEASES the single-running slot
// until the user integrates anyway or discards.
export type DatasetHmisImportRunStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "complete"
  | "error"
  | "cancelled";

// Small JSON on the run row, rewritten at most every 2 s: DHIS2 runs report
// in-flight pairs (per-pair outcomes live in the ledger); CSV runs report a
// staging/integrating percentage.
export type DatasetHmisImportRunProgress =
  | {
      phase: "classifying" | "fetching" | "finalizing";
      activePairs: Dhis2RunPair[];
    }
  | {
      phase: "staging" | "integrating";
      percent: number;
    };

// The summary projection of a run's selection: window selections pass
// through unchanged (the history label shows the indicator count with the
// source count beside it); explicit pair lists collapse to a count (a
// retry-failed selection can carry ~1,440 pairs: the runs list is polled
// every 2 s and must stay small).
export type Dhis2RunSelectionSummary =
  | Dhis2WindowSelection
  | { kind: "pairs"; nPairs: number };

export type DatasetHmisImportRunSummary = {
  id: number;
  trigger: "manual" | "schedule";
  triggeredBy?: string;
  source: "dhis2" | "csv";
  // DHIS2 runs only.
  dhis2Url?: string;
  selection?: Dhis2RunSelectionSummary;
  // CSV runs only.
  csvFileName?: string;
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
  progress?: DatasetHmisImportRunProgress;
};

// The run_stats blob (durable per-run instrumentation: the home that
// PLAN_DHIS2_IMPORTER §4.1 designated for pairFetchStats). Not shipped in the
// runs list (polled at 2 s, must stay small); served per-run by
// getDatasetHmisImportRunDetail.
export type DatasetHmisImportRunDetail = DatasetHmisImportRunSummary & {
  // Absent when the run was interrupted from outside the worker (cancel /
  // host-detected crash / restart sweep): stats live in worker memory and
  // die with it. run.error explains those cases.
  runStats?: DatasetHmisImportRunStats;
  // CSV runs only: the staging diagnostics (also stored on the version row
  // once the run integrates; served here for the needs_review card).
  csvStagingResult?: DatasetCsvStagingResult;
};

export type DatasetHmisImportRunStats = {
  classification: {
    dvsBareElements: number;
    dvsOperands: number;
    // Source ids that are no data element or operand in DHIS2: permanent
    // ledger errors without any fetch.
    unknownIds: string[];
    // Source ids that are DHIS2 indicators (formulas): permanent ledger
    // errors naming the decomposition importer, no fetch, existing data
    // kept.
    dhis2IndicatorIds: string[];
  };
  pairFetchStats: Dhis2PairFetchStat[];
  // Removed 2026-07-24: older stored run_stats blobs may carry a `shadow`
  // key (the retired first-run DVS-vs-analytics verification).
};

// ============================================================================
// Scheduled Imports (PLAN_DHIS2_IMPORTER Phase 4: C4)
// ============================================================================

// A schedule's selection: "last_n_months" is a rolling window resolved at
// fire time (current instance-calendar month plus the previous monthsBack
// months); "explicit_range" is a fixed start–end period range (one-shot
// schedules only). Both select indicators; the fire path expands them to
// sources like a manual launch.
export type Dhis2ScheduleSelection =
  | {
      kind: "last_n_months";
      indicatorIds: string[];
      monthsBack: number;
    }
  | {
      kind: "explicit_range";
      indicatorIds: string[];
      startPeriod: number;
      endPeriod: number;
    };

export type DatasetHmisScheduledImportKind = "one_shot" | "recurring";

// Recurrence for recurring schedules: an explicit anchor (the first
// occurrence) plus a kind: occurrences are exact arithmetic from the
// anchor, never counted from the last fire (PLAN_SCHEDULE_RECURRENCE).
export type Dhis2ScheduleRecurrence =
  | {
      kind: "daily";
      // "HH:MM" wall time in `timezone` (IANA), all kinds.
      startTime: string;
      timezone: string;
    }
  | {
      kind: "weekly";
      // The date of the FIRST occurrence ("YYYY-MM-DD", a wall date in
      // `timezone`). The weekday is derived from it: no separate field to
      // keep consistent. Occurrences are firstRunDate + k·7·everyNWeeks days.
      firstRunDate: string;
      everyNWeeks: number;
      startTime: string;
      timezone: string;
    }
  | {
      kind: "monthly";
      // nth `weekday` of the month ("first Thursday"); "last" = final one.
      nth: 1 | 2 | 3 | 4 | "last";
      // 0 (Sunday) – 6 (Saturday).
      weekday: number;
      everyNMonths: number;
      // Anchor month ("YYYY-MM") for everyNMonths > 1 phase: months where
      // monthsSince(anchorMonth) % everyNMonths !== 0 have no occurrence.
      anchorMonth: string;
      startTime: string;
      timezone: string;
    };

// "launched" = a run was started (last_run_id points at it). "refused" = the
// fire was blocked at fire time (no stored credentials, or the stored URL
// changed under a queued run): loud, with the reason in lastError.
// "missed" = the fire window
// (occurrence + grace) passed with no fire (server down); skipping loudly
// beats firing into daytime load (PLAN_DHIS2_IMPORTER §2.7).
export type DatasetHmisScheduledImportOutcome = "launched" | "refused" | "missed";

export type DatasetHmisScheduledImport = {
  id: number;
  kind: DatasetHmisScheduledImportKind;
  enabled: boolean;
  selection: Dhis2ScheduleSelection;
  // one_shot: the fire instant (ISO timestamp).
  runAt?: string;
  // recurring only.
  recurrence?: Dhis2ScheduleRecurrence;
  createdBy: string;
  createdAt: string;
  lastFiredAt?: string;
  lastOutcome?: DatasetHmisScheduledImportOutcome;
  lastError?: string;
  lastRunId?: number;
  // Joined from the runs table so the list can show how the launched run
  // actually ended.
  lastRunStatus?: DatasetHmisImportRunStatus;
};

// The editable fields of a schedule (create + update payload). Cross-field
// requirements per kind are validated server-side.
export type DatasetHmisScheduledImportFields = {
  kind: DatasetHmisScheduledImportKind;
  selection: Dhis2ScheduleSelection;
  runAt?: string;
  recurrence?: Dhis2ScheduleRecurrence;
};

// One GET for the whole imports surface: schedules + stored-connection state.
export type Dhis2ImportSchedulingInfo = {
  schedules: DatasetHmisScheduledImport[];
  storedCredentials?: Dhis2StoredCredentialsInfo;
  // false = DHIS2_CREDENTIALS_ENCRYPTION_KEY is not set on the server, so
  // credentials cannot be stored (and nothing can fire unattended).
  encryptionKeyConfigured: boolean;
};
