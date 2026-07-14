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
  type DatasetDhis2StagingResult,
  type DatasetHmisImportRunProgress,
  type DatasetHmisImportRunSummary,
  type Dhis2RunCredentialsSource,
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

export async function hasRunningDatasetHmisImportRun(
  mainDb: Sql,
): Promise<boolean> {
  const running = await mainDb<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM dataset_hmis_import_runs WHERE status = 'running'
    ) as exists
  `;
  return running[0].exists;
}

// CSV staging/integration and windowed deletion call this before claiming:
// a run integrates per-pair transactions that mint version ids, so any
// concurrent version-id writer risks the MAX(id)+1 collision.
export async function assertNoRunningDatasetHmisImportRun(
  mainDb: Sql,
): Promise<void> {
  if (await hasRunningDatasetHmisImportRun(mainDb)) {
    throw new Error(
      "A DHIS2 import run is in progress. Please wait for it to complete or cancel it.",
    );
  }
}

// Validates a selection + instance state shared by launch and enqueue: the
// enumerated pairs, the indicators_raw FK pre-check, and the UID-shaped
// facility requirement.
async function validateRunSelection(
  mainDb: Sql,
  selection: Dhis2RunSelection,
): Promise<Dhis2RunPair[]> {
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
  return pairs;
}

export async function countActiveCsvAttempts(mainDb: Sql): Promise<number> {
  const rows = await mainDb<{ count: string | number }[]>`
    SELECT COUNT(*) as count FROM dataset_hmis_upload_attempts
    WHERE status_type IN ('staging', 'integrating')
  `;
  return Number(rows[0].count);
}

// Spawns the run worker for a row already claimed as 'running' and wires the
// host-side listeners (crash → error + finalize; COMPLETED → teardown). A
// spawn failure must release the claim: a 'running' row with no worker blocks
// every import until someone notices and cancels it.
async function spawnRunWorker(
  mainDb: Sql,
  args: {
    runId: number;
    credentialsSource: Dhis2RunCredentialsSource;
    selection: Dhis2RunSelection;
    onComplete?: () => void;
  },
): Promise<void> {
  const { runId, credentialsSource, selection, onComplete } = args;
  let worker: Worker;
  try {
    worker = instantiateImportHmisDataDhis2Worker({
      runId,
      credentialsSource,
      selection,
    });
    setWorker("hmis_dhis2_run", worker);
  } catch (spawnError) {
    await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'error', ended_at = now(), progress = NULL,
        error = ${`Failed to start the import worker: ${spawnError instanceof Error ? spawnError.message : String(spawnError)}`}
      WHERE id = ${runId}
    `;
    throw spawnError;
  }

  worker.addEventListener("error", async (e) => {
    console.error("DHIS2 import run worker crashed:", e);
    e.preventDefault();
    // Terminate before finalizing: finalize recomputes from committed
    // state, so no writer may still be committing pairs while it reads.
    clearWorker("hmis_dhis2_run", worker);
    worker.terminate();
    try {
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = ${`Worker crashed: ${e.message || "Unknown error"}. Pairs completed before the crash are preserved in the ledger.`}
        WHERE id = ${runId} AND status = 'running'
      `;
      await finalizeInterruptedDatasetHmisRunVersion(mainDb, runId);
    } catch (dbError) {
      console.error("Failed to mark run errored after worker crash:", dbError);
    }
    try {
      await onComplete?.();
    } catch (err) {
      console.error("DHIS2 import run onComplete callback failed:", err);
    }
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
}

export async function launchDatasetHmisDhis2ImportRun(
  mainDb: Sql,
  args: {
    credentialsSource: Dhis2RunCredentialsSource;
    // The URL recorded on the run row (shadow_passed is keyed to it). For
    // inline credentials this is credentials.url; for stored, the stored url.
    dhis2Url: string;
    selection: Dhis2RunSelection;
    trigger: "manual" | "schedule";
    triggeredBy: string;
    onComplete?: () => void;
  },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const { credentialsSource, dhis2Url, selection, trigger, triggeredBy, onComplete } =
      args;

    const pairs = await validateRunSelection(mainDb, selection);

    // Read-guards for friendly errors; the atomic claim is the INSERT below
    // (partial unique index: at most one status='running' row).
    if ((await countActiveCsvAttempts(mainDb)) > 0) {
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
        (${trigger}, ${triggeredBy}, ${dhis2Url}, ${JSON.stringify(selection)},
         'running', ${pairs.length},
         ${JSON.stringify({ phase: "classifying", activePairs: [] })})
      RETURNING id
    `;
    const runId = inserted[0].id;

    // Re-check the cross-table guard after the claim: a CSV claim can land
    // between the read-guard above and our INSERT.
    if ((await countActiveCsvAttempts(mainDb)) > 0) {
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

    // Inline credentials travel only in the worker message — never stored on
    // the run row; stored credentials are decrypted inside the worker (C3).
    await spawnRunWorker(mainDb, { runId, credentialsSource, selection, onComplete });

    return { success: true, data: { runId } };
  });
}

// C6 — queue, not concurrent execution: a queued row is inert (no claim, no
// worker) until the ~60 s scheduler tick drains it FIFO through
// launchQueuedDatasetHmisImportRun once the import slot is free. Queued fires
// are unattended, so they require stored credentials (a prompted plaintext
// credential must never be persisted to survive until the queue drains).
export async function enqueueDatasetHmisImportRun(
  mainDb: Sql,
  args: { dhis2Url: string; selection: Dhis2RunSelection; triggeredBy: string },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const pairs = await validateRunSelection(mainDb, args.selection);
    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO dataset_hmis_import_runs
        (trigger, triggered_by, dhis2_url, selection, status, total_pairs)
      VALUES
        ('manual', ${args.triggeredBy}, ${args.dhis2Url},
         ${JSON.stringify(args.selection)}, 'queued', ${pairs.length})
      RETURNING id
    `;
    return { success: true, data: { runId: inserted[0].id } };
  });
}

export async function getOldestQueuedDatasetHmisImportRun(
  mainDb: Sql,
): Promise<{ id: number; dhis2Url: string; selection: Dhis2RunSelection } | null> {
  const rows = await mainDb<{ id: number; dhis2_url: string; selection: string }[]>`
    SELECT id, dhis2_url, selection FROM dataset_hmis_import_runs
    WHERE status = 'queued'
    ORDER BY id
    LIMIT 1
  `;
  const row = rows.at(0);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    dhis2Url: row.dhis2_url,
    selection: parseJsonOrThrow<Dhis2RunSelection>(row.selection),
  };
}

export async function countQueuedDatasetHmisImportRuns(
  mainDb: Sql,
): Promise<number> {
  const rows = await mainDb<{ count: string | number }[]>`
    SELECT COUNT(*) as count FROM dataset_hmis_import_runs WHERE status = 'queued'
  `;
  return Number(rows[0].count);
}

// Flips a queued row to an error with a loud reason (fire-time refusals:
// stored credentials gone, connection re-pointed, unattended gate unpassed).
export async function refuseQueuedDatasetHmisImportRun(
  mainDb: Sql,
  runId: number,
  reason: string,
): Promise<void> {
  await mainDb`
    UPDATE dataset_hmis_import_runs
    SET status = 'error', ended_at = now(), error = ${reason}
    WHERE id = ${runId} AND status = 'queued'
  `;
}

// Claims a queued row by conditional UPDATE — the partial unique index on
// status='running' still arbitrates (a concurrent running row makes the
// UPDATE throw, and the row simply stays queued for the next tick). Returns
// false when the claim was not taken (row removed, or slot busy).
export async function launchQueuedDatasetHmisImportRun(
  mainDb: Sql,
  args: {
    runId: number;
    selection: Dhis2RunSelection;
    onComplete?: () => void;
  },
): Promise<boolean> {
  if (getWorker("hmis") || getWorker("hmis_dhis2_run")) {
    return false;
  }
  let claimed: number;
  try {
    const updated = await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'running', started_at = now(),
        progress = ${JSON.stringify({ phase: "classifying", activePairs: [] })}
      WHERE id = ${args.runId} AND status = 'queued'
    `;
    claimed = updated.count;
  } catch (e) {
    // Unique-violation on the single-running index: another run took the
    // slot between the tick's idle check and this claim.
    console.log(
      `Queued run ${args.runId} lost the launch race — staying queued:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
  if (claimed === 0) {
    return false;
  }

  // Same post-claim CSV re-check as launch; reverting to 'queued' (not error)
  // lets a later tick retry once the CSV phase ends.
  if ((await countActiveCsvAttempts(mainDb)) > 0) {
    await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'queued', progress = NULL
      WHERE id = ${args.runId} AND status = 'running'
    `;
    return false;
  }

  await spawnRunWorker(mainDb, {
    runId: args.runId,
    credentialsSource: { kind: "stored" },
    selection: args.selection,
    onComplete: args.onComplete,
  });
  return true;
}

// The §7 C4 unattended gate: nothing fires unattended (one-shot, recurring,
// or queued) until a run against this DHIS2 URL has shadow-verified clean.
// Trailing-slash-tolerant: a manual first run entered as "https://x.org/"
// must unlock stored credentials saved as "https://x.org".
export async function hasShadowPassedForDhis2Url(
  mainDb: Sql,
  url: string,
): Promise<boolean> {
  const rows = await mainDb<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM dataset_hmis_import_runs
      WHERE shadow_passed = true
        AND rtrim(dhis2_url, '/') = rtrim(${url}, '/')
    ) as exists
  `;
  return rows[0].exists;
}

export async function cancelDatasetHmisImportRun(
  mainDb: Sql,
  runId: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // A queued row has no worker and no version — removing it is just a flip.
    const removedFromQueue = await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'cancelled', ended_at = now(),
        error = 'Removed from the queue before starting.'
      WHERE id = ${runId} AND status = 'queued'
    `;
    if (removedFromQueue.count > 0) {
      return { success: true };
    }
    // The status flip comes FIRST and is conditional on the given runId: a
    // cancel aimed at an already-finished run (stale tab, old list) must not
    // touch the worker — it belongs to whatever run is actually running.
    const updated = await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'cancelled', ended_at = now(), progress = NULL,
        error = 'Cancelled by user. Pairs completed before cancellation are preserved in the ledger.'
      WHERE id = ${runId} AND status = 'running'
    `;
    if (updated.count === 0) {
      throw new Error("This run is not running.");
    }
    // Terminating the worker aborts its in-flight pair transaction; completed
    // pairs are already committed with their ledger rows — that is the point
    // of per-pair units. Between the flip and the terminate the worker may
    // still commit a pair (counter increments are deliberately unguarded —
    // finalize recomputes from them) but can never resurrect the run:
    // progress and completion writes are status-guarded.
    const worker = getWorker("hmis_dhis2_run");
    if (worker) {
      worker.terminate();
      clearWorker("hmis_dhis2_run", worker);
    }
    await finalizeInterruptedDatasetHmisRunVersion(mainDb, runId);
    // No scope-table drop here: the flip above already released the claim, so
    // a successor run may have created its own scope table by now — dropping
    // the fixed-name table here could destroy the successor's snapshot. Every
    // run drops-and-recreates it at start, so a leftover is harmless.
    return { success: true };
  });
}

// A run that ends without its natural finalize (cancel, worker crash,
// restart sweep) leaves its version row holding the mint-time placeholder
// (0 rows, empty stats) while real dataset_hmis rows reference it. Reconcile
// from what is actually on disk: the exact row count from dataset_hmis, the
// per-pair stats from the ledger (per-pair failure detail also lives there —
// failedFetches stays empty here). A version with zero succeeded pairs is
// deleted outright — succeeded_pairs increments inside each pair's
// transaction, so zero means no dataset_hmis row and no ledger row
// references the version — keeping the "no empty versions" ruling true on
// every exit path. Idempotent: recomputing a finalized version writes the
// same values.
export async function finalizeInterruptedDatasetHmisRunVersion(
  mainDb: Sql,
  runId: number,
): Promise<void> {
  // Bounded retry: a cancel can race the first successful pair's in-flight
  // COMMIT — we read succeeded_pairs = 0, take the delete branch, and the
  // DELETE FK-aborts against the just-committed child rows. Re-reading then
  // sees the committed increment and takes the recompute branch instead.
  for (let attempt = 0; attempt < 3; attempt++) {
    const run = (
      await mainDb<
        {
          version_id: number | null;
          succeeded_pairs: number;
          total_pairs: number;
          started_at: string;
        }[]
      >`
        SELECT version_id, succeeded_pairs, total_pairs, started_at
        FROM dataset_hmis_import_runs WHERE id = ${runId}
      `
    ).at(0);
    if (!run || run.version_id === null) {
      return;
    }
    const versionId = run.version_id;
    if (run.succeeded_pairs === 0) {
      try {
        await mainDb.begin(async (sql) => {
          await sql`
            UPDATE dataset_hmis_import_runs SET version_id = NULL
            WHERE id = ${runId}
          `;
          await sql`DELETE FROM dataset_hmis_versions WHERE id = ${versionId}`;
        });
        return;
      } catch (e) {
        console.error(
          `Zero-success version delete failed for run ${runId} (attempt ${attempt + 1}) — re-reading:`,
          e,
        );
        if (attempt < 2) {
          continue;
        }
        // Still referenced with a zero counter — a state normal paths cannot
        // produce (references and the counter commit in the same
        // transaction). Keep the version and reconcile it rather than
        // failing the caller (cancel/crash/sweep must always converge).
        await reconcileRunVersionRow(mainDb, runId, run, versionId);
        return;
      }
    }
    await reconcileRunVersionRow(mainDb, runId, run, versionId);
    return;
  }
}

async function reconcileRunVersionRow(
  mainDb: Sql,
  runId: number,
  run: { succeeded_pairs: number; total_pairs: number; started_at: string },
  versionId: number,
): Promise<void> {
  const rowCount = Number(
    (
      await mainDb<{ count: string | number }[]>`
        SELECT COUNT(*) as count FROM dataset_hmis
        WHERE version_id = ${versionId}
      `
    )[0].count,
  );
  const ledgerRows = await mainDb<
    {
      indicator_raw_id: string;
      period_id: number;
      n_records: number;
      sum_count: string | number;
    }[]
  >`
    SELECT indicator_raw_id, period_id, n_records, sum_count
    FROM dataset_hmis_import_ledger
    WHERE version_id = ${versionId}
  `;
  const stagingResult: DatasetDhis2StagingResult = {
    sourceType: "dhis2",
    dateImported: new Date(run.started_at).toISOString(),
    totalIndicatorPeriodCombos: run.total_pairs,
    successfulFetches: run.succeeded_pairs,
    failedFetches: [],
    periodIndicatorStats: ledgerRows.map((r) => ({
      periodId: r.period_id,
      indicatorRawId: r.indicator_raw_id,
      nRecords: r.n_records,
      totalCount: Number(r.sum_count),
    })),
    finalStagingRowCount: rowCount,
    runId,
  };
  await mainDb`
    UPDATE dataset_hmis_versions
    SET
      n_rows_total_imported = ${rowCount},
      n_rows_inserted = ${rowCount},
      n_rows_updated = 0,
      staging_result = ${JSON.stringify(stagingResult)}
    WHERE id = ${versionId}
  `;
}

// Startup sweep: a restart mid-run leaves a 'running' row with no live worker,
// and the concurrency guards would then block all future imports.
export async function markStaleRunningDatasetHmisImportRuns(
  mainDb: Sql,
): Promise<number> {
  const swept = await mainDb<{ id: number }[]>`
    UPDATE dataset_hmis_import_runs
    SET status = 'error', ended_at = now(), progress = NULL,
      error = 'Import run interrupted by a server restart. Pairs completed before the restart are preserved in the ledger.'
    WHERE status = 'running'
    RETURNING id
  `;
  for (const row of swept) {
    await finalizeInterruptedDatasetHmisRunVersion(mainDb, row.id);
  }
  return swept.length;
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
  // Both bounds must be real period ids BEFORE the loop runs: the loop
  // visits every integer in the range, so an unbounded endPeriod (the Zod
  // schema only checks int) would spin the event loop for the whole server —
  // the deleted DHIS2 wizard step carried this exact guard.
  if (
    !isValidPeriodId(selection.startPeriod) ||
    !isValidPeriodId(selection.endPeriod) ||
    selection.startPeriod > selection.endPeriod
  ) {
    throw new Error(
      `Invalid period window ${selection.startPeriod}–${selection.endPeriod}: both bounds must be valid YYYYMM period ids with start ≤ end.`,
    );
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
