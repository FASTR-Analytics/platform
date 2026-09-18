import type { AssetFilePin } from "./assets.ts";
import type { Dhis2StoredCredentialsInfo } from "./dhis2.ts";
import { definitionDataId, hasRows, type HmisIndicator } from "./indicators.ts";

// ============================================================================
// CSV Import Run Types (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase A)
// ============================================================================

// The file's columns as the wizard names them. `data_id` is the indicator
// column: the values it says are input to the wizard's mapping (below), not
// ids the app resolves (PLAN_A6 §2).
export type HmisCsvColumns = {
  facility_id: string;
  data_id: string;
  period_id: string;
  count: string;
};

// The wizard's mapping (PLAN_A6 ruling 3): every distinct value in the
// file's indicator column, to the data id its rows land under, or to null
// for a value the user skipped. Stored on the run row, never remembered
// between imports: the next import maps again, seeded by auto-selection.
export type HmisCsvMapping = Record<string, string | null>;

// What the scan reads from the file before the mapping step: each distinct
// value with its row count, sorted by descending row count, and the pin of
// the bytes it read, which the launch passes back so a file swapped between
// the scan and the launch is refused (ruling 4).
export type HmisCsvIndicatorValue = { value: string; rowCount: number };

export type HmisCsvIndicatorScan = {
  pin: AssetFilePin;
  values: HmisCsvIndicatorValue[];
};

// Above this many distinct values the scan refuses rather than truncating:
// a mapping the user cannot complete is worse than a refusal, and that many
// values almost always means the wrong column was chosen.
export const HMIS_CSV_MAX_DISTINCT_INDICATOR_VALUES = 2000;

// The one derivation of a mapping value from the file's indicator cell,
// used by the scan and by the stage leg, so the mapping the wizard made is
// complete by construction when the stage leg looks a value up.
export function csvIndicatorValueFromCell(cell: string): string {
  return cell.trim();
}

// Ruling 3's normalisation: lowercased, everything but letters and digits
// stripped.
export function normaliseIndicatorMatchKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// Auto-selection (ruling 3): a value matches an indicator with rows when it
// equals that indicator's id under normalisation, or, for a DHIS2 element
// only, when it exactly equals its data id (the UID). Nothing matches an
// Uploaded indicator's key. A value that matches two indicators selects
// neither, and two values that match the same indicator select nothing,
// since one import may map one value onto an indicator: the user decides.
export function autoSelectHmisCsvMapping(
  values: string[],
  indicators: HmisIndicator[],
): HmisCsvMapping {
  const byNormalisedId = new Map<string, HmisIndicator[]>();
  const elementsByUid = new Map<string, HmisIndicator>();
  for (const indicator of indicators) {
    if (!hasRows(indicator.definition.type)) continue;
    const key = normaliseIndicatorMatchKey(indicator.indicator_common_id);
    byNormalisedId.set(key, [...(byNormalisedId.get(key) ?? []), indicator]);
    if (indicator.definition.type === "dhis2_element") {
      elementsByUid.set(indicator.definition.data_id, indicator);
    }
  }
  const chosen = new Map<string, string>();
  for (const value of values) {
    const candidates = new Set<string>();
    for (const i of byNormalisedId.get(normaliseIndicatorMatchKey(value)) ?? []) {
      candidates.add(definitionDataId(i.definition)!);
    }
    const element = elementsByUid.get(value);
    if (element !== undefined) candidates.add(definitionDataId(element.definition)!);
    if (candidates.size === 1) chosen.set(value, [...candidates][0]);
  }
  const uses = new Map<string, number>();
  for (const target of chosen.values()) {
    uses.set(target, (uses.get(target) ?? 0) + 1);
  }
  const mapping: HmisCsvMapping = {};
  for (const value of values) {
    const target = chosen.get(value);
    mapping[value] = target !== undefined && uses.get(target) === 1 ? target : null;
  }
  return mapping;
}

// What the wizard sends at launch: the input asset's fileName, the pin the
// scan read, the columns and the mapping. The server refuses a file whose
// bytes no longer match the pin, and checks every mapped target is an
// indicator with rows, named by at most one value.
export type DatasetHmisCsvRunLaunchInput = {
  fileName: string;
  pin: AssetFilePin;
  columns: HmisCsvColumns;
  mapping: HmisCsvMapping;
};

// The CSV launch payload stored in dataset_hmis_import_runs.csv_config. The
// file is an instance asset named by fileName, byte-pinned at the scan and
// checked again at launch and at every deferred read (see AssetFilePin).
// resumeFromStaging marks a needs_review run resolved with "Integrate
// anyway": the worker skips the stage leg and integrates the surviving
// per-run staging table.
export type DatasetHmisCsvRunConfig = {
  fileName: string;
  filePin: AssetFilePin;
  columns: HmisCsvColumns;
  mapping: HmisCsvMapping;
  resumeFromStaging?: boolean;
};

// ============================================================================
// Staging Result Types
// ============================================================================

// Keyed by data id, the key of the rows; the client labels it through the
// dictionary.
export type PeriodIndicatorStat = {
  periodId: number;
  dataId: string;
  nRecords: number;
  totalCount: number;
};

export type DatasetCsvStagingResult = {
  kind: "csv";
  dateImported: string;
  assetFileName: string;
  periodIndicatorStats: PeriodIndicatorStat[];
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
    // Rows whose file value the mapping sends to null (PLAN_A6 ruling 5):
    // reported, never gating, since the user chose it at wizard time.
    skippedByMapping: {
      rowsDropped: number;
    };
  };
};

// Permanent = deterministic config error (4xx, e.g. 409 on a stale dx id):
// re-running without fixing the config will fail again. Transient = server
// health (5xx/timeout): a later re-run may succeed.
export type Dhis2FetchErrorKind = "permanent" | "transient";

// Per-(data id, period) fetch instrumentation, so slowness reports arrive
// with their own data. Lives in the run's run_stats blob. One entry per pair
// that reached a fetch: ids the dispatcher refused (classification.unknownIds
// and dhis2IndicatorIds) never fetch and appear only there and in the ledger.
// One dataValueSets pull covers every pair sharing its data element and
// month: each covered pair carries the covering pull's request count and
// wall time (duplicated, not divided).
export type Dhis2PairFetchStat = {
  dataId: string;
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
// end (slim: the version history UI needs only kind, dateImported,
// failedFetches, dhis2RowsDeleted, and counts). Per-run instrumentation lives
// in dataset_hmis_import_runs.run_stats, not here. The optional fields exist
// only so version rows written by the pre-run (stage-then-integrate) code
// still parse; the run worker never writes them.
export type DatasetDhis2StagingResult = {
  kind: "dhis2";
  dateImported: string;
  totalIndicatorPeriodCombos: number;
  successfulFetches: number;
  failedFetches: Array<{
    dataId: string;
    periodId: number;
    error: string;
    errorKind?: Dhis2FetchErrorKind;
  }>;
  periodIndicatorStats: PeriodIndicatorStat[];
  finalStagingRowCount: number;
  // Rows removed by the per-pair scoped deletes across the whole run.
  dhis2RowsDeleted?: number;
  // The run that minted this version.
  runId?: number;
  // Legacy fields (pre-run version rows only).
  succeededWorkItems?: Array<{ dataId: string; periodId: number }>;
  fetchedFacilityIds?: string[];
  pairFetchStats?: Dhis2PairFetchStat[];
  workItemHistory?: Array<{
    dataId: string;
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

// One row per (data id, month): the latest import state of that pair
// (PLAN_DHIS2_IMPORTER WS-B). status 'error' keeps the last data-bearing
// counts untouched: the error describes the most recent failed attempt.
export type DatasetHmisImportLedgerItem = {
  dataId: string;
  periodId: number;
  nRecords: number;
  sumCount: number;
  // DHIS2 facility values left out of the pair at its last import because
  // they were not non-negative integers, with a sample of at most
  // SKIPPED_VALUES_SAMPLE_CAP (facility, value). CSV pairs record none: a
  // bad CSV count is dropped and counted at staging.
  skippedValues: number;
  skippedValuesSample: DatasetHmisLedgerSkippedValue[];
  route: "dhis2" | "csv" | "backfill";
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

// What a DHIS2 run fetches: a DHIS2 element's data id, the element or
// operand DHIS2 knows it by, whose values are written under that same key
// (PLAN_A5 ruling 9). Resolved once, where the selection is validated, and
// persisted on the run row and in the worker message, so the worker never
// re-resolves.
export type Dhis2FetchTarget = { dataId: string };

// A pair is one data id × one month: the unit the importer fetches and
// integrates, and the grain of the ledger.
export type Dhis2RunPair = Dhis2FetchTarget & { periodId: number };

// What a launch, enqueue or schedule fire selects: INDICATORS over a month
// window, or explicit (data id, month) pairs (retry failed, re-import from
// the ledger, which is keyed by data id). The server checks each pair's
// data id belongs to a DHIS2 element at validation and resolves nothing.
export type Dhis2WindowSelectionInput = {
  kind: "window";
  indicatorIds: string[];
  startPeriod: number;
  endPeriod: number;
};

export type Dhis2RunPairInput = { dataId: string; periodId: number };

export type Dhis2PairSelectionInput = {
  kind: "pairs";
  pairs: Dhis2RunPairInput[];
};

export type Dhis2RunSelectionInput =
  | Dhis2WindowSelectionInput
  | Dhis2PairSelectionInput;

// The expansion of a window selection's indicators to what a DHIS2 run
// fetches (`expandIndicatorSelection`, lib): a sum expands to its members,
// a calculated flattens through the resolver to the counts it reaches, and the
// DHIS2 elements among them contribute their data ids. Population terms and
// Uploaded indicators are dropped and listed. Persisted on the run row and
// carried in the worker message, so the worker and the history tab never
// re-resolve: an element assigned after enqueue is not in that run.
export type Dhis2SelectionExpansion = {
  dataIds: string[];
  populationTermsDropped: string[];
  uploadedIndicatorsDropped: string[];
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
// data id count beside it); explicit pair lists collapse to a count (a
// retry-failed selection can carry ~1,440 pairs: the runs list is polled
// every 2 s and must stay small).
export type Dhis2RunSelectionSummary =
  | Dhis2WindowSelection
  | { kind: "pairs"; nPairs: number };

export type DatasetHmisImportRunSummary = {
  id: number;
  trigger: "manual" | "schedule";
  triggeredBy?: string;
  route: "dhis2" | "csv";
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
    // data ids that are no data element or operand in DHIS2: permanent
    // ledger errors without any fetch.
    unknownIds: string[];
    // data ids that are DHIS2 indicators (formulas): permanent ledger
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
// schedules only). Both select indicators; the fire path expands them like
// a manual launch.
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
