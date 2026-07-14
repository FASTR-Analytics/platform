import { Sql } from "postgres";
import {
  _GLOBAL_MAX_YEAR_FOR_PERIODS,
  _GLOBAL_MIN_YEAR_FOR_PERIODS,
} from "@timroberton/panther";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  type DatasetHmisImportRunProgress,
  type DatasetHmisImportRunSummary,
  type Dhis2Credentials,
  type Dhis2RunPair,
  type Dhis2RunSelection,
  type Dhis2RunSelectionSummary,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { instantiateImportHmisDataDhis2Worker } from "../../worker_routines/import_hmis_data_dhis2/instantiate_worker.ts";
import {
  clearWorker,
  getWorker,
  setWorker,
} from "../../worker_routines/worker_store.ts";
import type { DBDatasetHmisImportRun } from "./_main_database_types.ts";

// Facility-scope snapshot for the run's per-pair scoped deletes (see the run
// worker). Unlogged + fixed-name: only one run can exist at a time (the
// partial unique index on status='running'), and a leftover table from a
// crash/cancel is dropped at the next run start.
export const HMIS_DHIS2_RUN_SCOPE_TABLE_NAME = "hmis_dhis2_run_facility_scope";

function toSelectionSummary(selection: Dhis2RunSelection): Dhis2RunSelectionSummary {
  if (selection.kind === "pairs") {
    return { kind: "pairs", nPairs: selection.pairs.length };
  }
  return selection;
}

function toRunSummary(row: DBDatasetHmisImportRun): DatasetHmisImportRunSummary {
  return {
    id: row.id,
    trigger: row.trigger,
    triggeredBy: row.triggered_by ?? undefined,
    dhis2Url: row.dhis2_url,
    selection: toSelectionSummary(
      parseJsonOrThrow<Dhis2RunSelection>(row.selection),
    ),
    status: row.status,
    error: row.error ?? undefined,
    totalPairs: row.total_pairs,
    succeededPairs: row.succeeded_pairs,
    failedPairs: row.failed_pairs,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
    versionId: row.version_id ?? undefined,
    shadowPassed: row.shadow_passed ?? undefined,
    progress: row.progress
      ? parseJsonOrUndefined<DatasetHmisImportRunProgress>(row.progress)
      : undefined,
  };
}

export async function getDatasetHmisImportRunSummaries(
  mainDb: Sql,
): Promise<APIResponseWithData<DatasetHmisImportRunSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBDatasetHmisImportRun[]>`
      SELECT id, trigger, triggered_by, dhis2_url, selection, status, error,
        total_pairs, succeeded_pairs, failed_pairs, started_at, ended_at,
        version_id, shadow_passed, progress
      FROM dataset_hmis_import_runs
      ORDER BY id DESC
      LIMIT 50
    `;
    return { success: true, data: rows.map(toRunSummary) };
  });
}

// CSV staging/integration and windowed deletion call this before claiming:
// a run integrates per-pair transactions that mint version ids, so any
// concurrent version-id writer risks the MAX(id)+1 collision.
export async function assertNoRunningDatasetHmisImportRun(
  mainDb: Sql,
): Promise<void> {
  const running = await mainDb<{ count: string | number }[]>`
    SELECT COUNT(*) as count FROM dataset_hmis_import_runs
    WHERE status = 'running'
  `;
  if (Number(running[0].count) > 0) {
    throw new Error(
      "A DHIS2 import run is in progress. Please wait for it to complete or cancel it.",
    );
  }
}

export async function launchDatasetHmisDhis2ImportRun(
  mainDb: Sql,
  args: {
    credentials: Dhis2Credentials;
    selection: Dhis2RunSelection;
    triggeredBy: string;
    onComplete?: () => void;
  },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const { credentials, selection, triggeredBy, onComplete } = args;

    const pairs = enumerateRunPairs(selection);
    if (pairs.length === 0) {
      throw new Error("The selection contains no (indicator, month) pairs.");
    }

    // Fail fast on indicators that don't exist — per-pair integration inserts
    // against an indicators_raw FK.
    const selectedIndicatorIds = Array.from(
      new Set(pairs.map((p) => p.indicatorRawId)),
    );
    const existing = await mainDb<{ indicator_raw_id: string }[]>`
      SELECT indicator_raw_id FROM indicators_raw
      WHERE indicator_raw_id = ANY(${selectedIndicatorIds})
    `;
    if (existing.length < selectedIndicatorIds.length) {
      const existingSet = new Set(existing.map((r) => r.indicator_raw_id));
      const missing = selectedIndicatorIds.filter((id) => !existingSet.has(id));
      throw new Error(
        `The following selected raw indicators do not exist: ${missing.join(", ")}.`,
      );
    }

    const [{ count: facilityCount }] = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM facilities_hmis
      WHERE facility_id ~ '^[a-zA-Z][a-zA-Z0-9]{10}$'
    `;
    if (facilityCount === 0) {
      throw new Error(
        "No DHIS2-shaped HMIS facilities found. Import HMIS facilities from DHIS2 before importing data.",
      );
    }

    // Read-guards for friendly errors; the atomic claim is the INSERT below
    // (partial unique index: at most one status='running' row).
    const activeAttempts = await mainDb<{ count: string | number }[]>`
      SELECT COUNT(*) as count FROM dataset_hmis_upload_attempts
      WHERE status_type IN ('staging', 'integrating')
    `;
    if (Number(activeAttempts[0].count) > 0) {
      throw new Error(
        "A CSV import operation is in progress. Please wait for it to complete.",
      );
    }
    await assertNoRunningDatasetHmisImportRun(mainDb);
    if (getWorker("hmis") || getWorker("hmis_dhis2_run")) {
      throw new Error(
        "An HMIS import operation is already in progress. Please wait for it to complete.",
      );
    }

    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO dataset_hmis_import_runs
        (trigger, triggered_by, dhis2_url, selection, status, total_pairs, progress)
      VALUES
        ('manual', ${triggeredBy}, ${credentials.url}, ${JSON.stringify(selection)},
         'running', ${pairs.length},
         ${JSON.stringify({ phase: "classifying", activePairs: [] })})
      RETURNING id
    `;
    const runId = inserted[0].id;

    // Re-check the cross-table guard after the claim: a CSV claim can land
    // between the read-guard above and our INSERT.
    const attemptsAfterClaim = await mainDb<{ count: string | number }[]>`
      SELECT COUNT(*) as count FROM dataset_hmis_upload_attempts
      WHERE status_type IN ('staging', 'integrating')
    `;
    if (Number(attemptsAfterClaim[0].count) > 0) {
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = 'A CSV import claimed the import slot concurrently. Try again once it completes.'
        WHERE id = ${runId}
      `;
      throw new Error(
        "A CSV import operation is in progress. Please wait for it to complete.",
      );
    }

    // Credentials travel only in the worker message — never stored on the run
    // row (C3 adds encrypted stored credentials in Phase 4).
    const worker = instantiateImportHmisDataDhis2Worker({
      runId,
      credentials,
      selection,
    });
    setWorker("hmis_dhis2_run", worker);

    worker.addEventListener("error", async (e) => {
      console.error("DHIS2 import run worker crashed:", e);
      e.preventDefault();
      try {
        await mainDb`
          UPDATE dataset_hmis_import_runs
          SET status = 'error', ended_at = now(), progress = NULL,
            error = ${`Worker crashed: ${e.message || "Unknown error"}. Pairs completed before the crash are preserved in the ledger.`}
          WHERE id = ${runId} AND status = 'running'
        `;
      } catch (dbError) {
        console.error("Failed to mark run errored after worker crash:", dbError);
      }
      clearWorker("hmis_dhis2_run", worker);
      worker.terminate();
    });

    worker.addEventListener("message", async (e) => {
      if (e.data === "COMPLETED") {
        clearWorker("hmis_dhis2_run", worker);
        worker.terminate();
        try {
          await onComplete?.();
        } catch (err) {
          console.error("DHIS2 import run onComplete callback failed:", err);
        }
      }
    });

    return { success: true, data: { runId } };
  });
}

export async function cancelDatasetHmisImportRun(
  mainDb: Sql,
  runId: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const worker = getWorker("hmis_dhis2_run");
    if (worker) {
      worker.terminate();
      clearWorker("hmis_dhis2_run", worker);
    }
    // Terminating the worker aborts its in-flight pair transaction; completed
    // pairs are already committed with their ledger rows — that is the point
    // of per-pair units.
    const updated = await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'cancelled', ended_at = now(), progress = NULL,
        error = 'Cancelled by user. Pairs completed before cancellation are preserved in the ledger.'
      WHERE id = ${runId} AND status = 'running'
    `;
    if (updated.count === 0) {
      throw new Error("This run is not running.");
    }
    await mainDb.unsafe(
      `DROP TABLE IF EXISTS ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME}`,
    );
    return { success: true };
  });
}

// Startup sweep: a restart mid-run leaves a 'running' row with no live worker,
// and the concurrency guards would then block all future imports.
export async function markStaleRunningDatasetHmisImportRuns(
  mainDb: Sql,
): Promise<number> {
  const updated = await mainDb`
    UPDATE dataset_hmis_import_runs
    SET status = 'error', ended_at = now(), progress = NULL,
      error = 'Import run interrupted by a server restart. Pairs completed before the restart are preserved in the ledger.'
    WHERE status = 'running'
  `;
  return updated.count;
}

// Expands a run selection to its (indicator, month) pairs. Window enumeration
// mirrors the run worker exactly — totals recorded at launch must equal the
// worker's work list.
export function enumerateRunPairs(
  selection: Dhis2RunSelection,
): Dhis2RunPair[] {
  if (selection.kind === "pairs") {
    const seen = new Set<string>();
    const pairs: Dhis2RunPair[] = [];
    for (const p of selection.pairs) {
      const key = `${p.indicatorRawId}|${p.periodId}`;
      if (!seen.has(key) && isValidPeriodId(p.periodId)) {
        seen.add(key);
        pairs.push(p);
      }
    }
    return pairs;
  }
  const pairs: Dhis2RunPair[] = [];
  for (const indicatorRawId of selection.rawIndicatorIds) {
    for (
      let periodId = selection.startPeriod;
      periodId <= selection.endPeriod;
      periodId++
    ) {
      if (isValidPeriodId(periodId)) {
        pairs.push({ indicatorRawId, periodId });
      }
    }
  }
  return pairs;
}

function isValidPeriodId(periodId: number): boolean {
  const year = Math.floor(periodId / 100);
  const month = periodId % 100;
  return (
    year >= _GLOBAL_MIN_YEAR_FOR_PERIODS &&
    year <= _GLOBAL_MAX_YEAR_FOR_PERIODS &&
    month >= 1 &&
    month <= 12
  );
}
