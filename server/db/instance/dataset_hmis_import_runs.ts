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
  type DatasetCsvStagingResult,
  type DatasetDhis2StagingResult,
  type DatasetHmisCsvRunConfig,
  type DatasetHmisCsvRunLaunchInput,
  type DatasetHmisImportRunDetail,
  type DatasetHmisImportRunProgress,
  type DatasetHmisImportRunStats,
  type DatasetHmisImportRunSummary,
  type Dhis2RunCredentialsSource,
  type Dhis2RunPair,
  type Dhis2RunSelection,
  type Dhis2RunSelectionSummary,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { instantiateImportHmisDataDhis2Worker } from "../../worker_routines/import_hmis_data_dhis2/instantiate_worker.ts";
import { instantiateImportHmisDataCsvWorker } from "../../worker_routines/import_hmis_data_csv/instantiate_worker.ts";
import { dropHmisCsvStagingTables } from "../../worker_routines/import_hmis_data_csv/stage_csv.ts";
import { resolveAssetFileOrThrow } from "./assets.ts";
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

function parseCsvConfig(
  csvConfig: string | null,
): DatasetHmisCsvRunConfig | undefined {
  return csvConfig
    ? parseJsonOrUndefined<DatasetHmisCsvRunConfig>(csvConfig)
    : undefined;
}

function toRunSummary(row: DBDatasetHmisImportRun): DatasetHmisImportRunSummary {
  return {
    id: row.id,
    trigger: row.trigger,
    triggeredBy: row.triggered_by ?? undefined,
    source: row.source,
    dhis2Url: row.dhis2_url ?? undefined,
    selection: row.selection
      ? toSelectionSummary(parseJsonOrThrow<Dhis2RunSelection>(row.selection))
      : undefined,
    csvFileName: parseCsvConfig(row.csv_config)?.fileName,
    status: row.status,
    error: row.error ?? undefined,
    totalPairs: row.total_pairs,
    succeededPairs: row.succeeded_pairs,
    failedPairs: row.failed_pairs,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
    versionId: row.version_id ?? undefined,
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
      SELECT id, trigger, triggered_by, source, dhis2_url, selection,
        csv_config, status, error,
        total_pairs, succeeded_pairs, failed_pairs, started_at, ended_at,
        version_id, progress
      FROM dataset_hmis_import_runs
      ORDER BY id DESC
      LIMIT 50
    `;
    return { success: true, data: rows.map(toRunSummary) };
  });
}

export async function getDatasetHmisImportRunDetail(
  mainDb: Sql,
  runId: number,
): Promise<APIResponseWithData<DatasetHmisImportRunDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBDatasetHmisImportRun[]>`
      SELECT id, trigger, triggered_by, source, dhis2_url, selection,
        csv_config, status, error,
        total_pairs, succeeded_pairs, failed_pairs, started_at, ended_at,
        version_id, progress, run_stats
      FROM dataset_hmis_import_runs
      WHERE id = ${runId}
    `;
    const row = rows.at(0);
    if (!row) {
      throw new Error(`Import run ${runId} not found.`);
    }
    // run_stats is by-source: DHIS2 runs store DatasetHmisImportRunStats, CSV
    // runs store { csvStagingResult } (written at needs_review and at
    // complete, so the diagnostics survive the run's whole life).
    if (row.source === "csv") {
      const parsed = row.run_stats
        ? parseJsonOrUndefined<{ csvStagingResult: DatasetCsvStagingResult }>(
            row.run_stats,
          )
        : undefined;
      return {
        success: true,
        data: {
          ...toRunSummary(row),
          csvStagingResult: parsed?.csvStagingResult,
        },
      };
    }
    return {
      success: true,
      data: {
        ...toRunSummary(row),
        runStats: row.run_stats
          ? parseJsonOrUndefined<DatasetHmisImportRunStats>(row.run_stats)
          : undefined,
      },
    };
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
    // The URL recorded on the run row. For inline credentials this is
    // credentials.url; for stored, the stored url.
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
    // (partial unique index: at most one status='running' row). CSV imports
    // share the same claim, so no cross-table guard exists — the race it
    // defended is structurally impossible.
    await assertNoRunningDatasetHmisImportRun(mainDb);
    if (getWorker("hmis") || getWorker("hmis_dhis2_run")) {
      throw new Error(
        "An HMIS import operation is already in progress. Please wait for it to complete.",
      );
    }

    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO dataset_hmis_import_runs
        (trigger, triggered_by, source, dhis2_url, selection, status, total_pairs, progress)
      VALUES
        (${trigger}, ${triggeredBy}, 'dhis2', ${dhis2Url}, ${JSON.stringify(selection)},
         'running', ${pairs.length},
         ${JSON.stringify({ phase: "classifying", activePairs: [] })})
      RETURNING id
    `;
    const runId = inserted[0].id;

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
        (trigger, triggered_by, source, dhis2_url, selection, status, total_pairs)
      VALUES
        ('manual', ${args.triggeredBy}, 'dhis2', ${args.dhis2Url},
         ${JSON.stringify(args.selection)}, 'queued', ${pairs.length})
      RETURNING id
    `;
    return { success: true, data: { runId: inserted[0].id } };
  });
}

export type QueuedDatasetHmisImportRun =
  | {
      source: "dhis2";
      id: number;
      dhis2Url: string;
      selection: Dhis2RunSelection;
    }
  | { source: "csv"; id: number; config: DatasetHmisCsvRunConfig };

export async function getOldestQueuedDatasetHmisImportRun(
  mainDb: Sql,
): Promise<QueuedDatasetHmisImportRun | null> {
  const rows = await mainDb<
    {
      id: number;
      source: "dhis2" | "csv";
      dhis2_url: string | null;
      selection: string | null;
      csv_config: string | null;
    }[]
  >`
    SELECT id, source, dhis2_url, selection, csv_config
    FROM dataset_hmis_import_runs
    WHERE status = 'queued'
    ORDER BY id
    LIMIT 1
  `;
  const row = rows.at(0);
  if (!row) {
    return null;
  }
  if (row.source === "csv") {
    return {
      source: "csv",
      id: row.id,
      config: parseJsonOrThrow<DatasetHmisCsvRunConfig>(row.csv_config ?? ""),
    };
  }
  return {
    source: "dhis2",
    id: row.id,
    dhis2Url: row.dhis2_url ?? "",
    selection: parseJsonOrThrow<Dhis2RunSelection>(row.selection ?? ""),
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
// stored credentials gone, connection re-pointed).
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

  await spawnRunWorker(mainDb, {
    runId: args.runId,
    credentialsSource: { kind: "stored" },
    selection: args.selection,
    onComplete: args.onComplete,
  });
  return true;
}

// ============================================================================
// CSV IMPORT RUNS (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase A)
// ============================================================================

// Validates the launch input and stamps the byte pin — the returned config is
// what gets stored on the run row.
async function validateCsvRunConfig(
  mainDb: Sql,
  input: DatasetHmisCsvRunLaunchInput,
): Promise<DatasetHmisCsvRunConfig> {
  const mappings = input.mappings;
  for (const key of [
    "facility_id",
    "raw_indicator_id",
    "period_id",
    "count",
  ] as const) {
    if (!mappings[key]) {
      throw new Error(`Missing column mapping for ${key}.`);
    }
  }
  const { pin } = await resolveAssetFileOrThrow(input.fileName, null);
  const [{ count }] = await mainDb<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM facilities_hmis
  `;
  if (count === 0) {
    throw new Error(
      "No HMIS facilities found. Import HMIS facilities before importing data.",
    );
  }
  return { fileName: input.fileName, filePin: pin, mappings: input.mappings };
}

// Spawns the CSV run worker for a row already claimed as 'running'. Reads
// config + recorded diagnostics from the row itself, so launch, queued-fire,
// and integrate-anyway all share one spawn path. A spawn failure releases the
// claim (same rule as the DHIS2 spawner).
async function spawnCsvRunWorker(
  mainDb: Sql,
  args: { runId: number; onComplete?: () => void },
): Promise<void> {
  const { runId, onComplete } = args;
  const row = (
    await mainDb<
      { csv_config: string | null; run_stats: string | null }[]
    >`
      SELECT csv_config, run_stats FROM dataset_hmis_import_runs
      WHERE id = ${runId}
    `
  ).at(0);
  if (!row || !row.csv_config) {
    throw new Error(`CSV run ${runId} has no config.`);
  }
  const config = parseJsonOrThrow<DatasetHmisCsvRunConfig>(row.csv_config);

  const failClaim = async (message: string) => {
    await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'error', ended_at = now(), progress = NULL,
        error = ${message}
      WHERE id = ${runId} AND status = 'running'
    `;
  };

  let csvFilePath = "";
  if (!config.resumeFromStaging) {
    // A missing pin (a pre-pin row) fails like a changed file: any such run
    // that still needs its file names bytes nobody validated.
    if (!config.filePin) {
      const message =
        "The file has changed since this run was launched. Start the import again.";
      await failClaim(message);
      throw new Error(message);
    }
    try {
      const { filePath } = await resolveAssetFileOrThrow(
        config.fileName,
        config.filePin,
      );
      csvFilePath = filePath;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await failClaim(message);
      throw e;
    }
  }

  let stagingResult: DatasetCsvStagingResult | undefined;
  if (config.resumeFromStaging) {
    const parsed = row.run_stats
      ? parseJsonOrUndefined<{ csvStagingResult: DatasetCsvStagingResult }>(
          row.run_stats,
        )
      : undefined;
    stagingResult = parsed?.csvStagingResult;
    if (!stagingResult) {
      await failClaim(
        "This run has no recorded staging result to integrate. Discard it and start the import again.",
      );
      throw new Error("Missing recorded staging result.");
    }
  }

  let worker: Worker;
  try {
    worker = instantiateImportHmisDataCsvWorker({
      runId,
      config,
      csvFilePath,
      stagingResult,
    });
    setWorker("hmis", worker);
  } catch (spawnError) {
    await failClaim(
      `Failed to start the import worker: ${spawnError instanceof Error ? spawnError.message : String(spawnError)}`,
    );
    throw spawnError;
  }

  worker.addEventListener("error", async (e) => {
    console.error("HMIS CSV import run worker crashed:", e);
    e.preventDefault();
    clearWorker("hmis", worker);
    worker.terminate();
    try {
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = ${`Worker crashed: ${e.message || "Unknown error"}`}
        WHERE id = ${runId} AND status = 'running'
      `;
      await dropHmisCsvStagingTables(mainDb, runId, { keepFinal: false });
      // No version reconciliation here: a CSV run's version_id and its
      // 'complete' flip commit in ONE statement, so a crashed CSV run either
      // has no version or is already complete. (finalizeInterrupted… is
      // DHIS2 placeholder-version reconciliation; on a completed CSV version
      // it would overwrite the CSV staging_result with a dhis2-shaped one.)
    } catch (dbError) {
      console.error("Failed to mark CSV run errored after crash:", dbError);
    }
    try {
      await onComplete?.();
    } catch (err) {
      console.error("CSV import run onComplete callback failed:", err);
    }
  });

  worker.addEventListener("message", async (e) => {
    if (e.data === "COMPLETED") {
      clearWorker("hmis", worker);
      worker.terminate();
      try {
        await onComplete?.();
      } catch (err) {
        console.error("CSV import run onComplete callback failed:", err);
      }
    }
  });
}

export async function launchDatasetHmisCsvImportRun(
  mainDb: Sql,
  args: {
    config: DatasetHmisCsvRunLaunchInput;
    triggeredBy: string;
    onComplete?: () => void;
  },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const config = await validateCsvRunConfig(mainDb, args.config);

    // Read-guards for friendly errors; the atomic claim is the INSERT below
    // (partial unique index: at most one status='running' row, shared with
    // DHIS2 runs).
    await assertNoRunningDatasetHmisImportRun(mainDb);
    if (getWorker("hmis") || getWorker("hmis_dhis2_run")) {
      throw new Error(
        "An HMIS import operation is already in progress. Please wait for it to complete.",
      );
    }

    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO dataset_hmis_import_runs
        (trigger, triggered_by, source, csv_config, status, progress)
      VALUES
        ('manual', ${args.triggeredBy}, 'csv', ${JSON.stringify(config)},
         'running', ${JSON.stringify({ phase: "staging", percent: 0 })})
      RETURNING id
    `;
    const runId = inserted[0].id;

    await spawnCsvRunWorker(mainDb, { runId, onComplete: args.onComplete });

    return { success: true, data: { runId } };
  });
}

// Explicit queueing while a run is active — inert row, drained FIFO by the
// scheduler tick alongside queued DHIS2 runs. CSV fires need no credential
// checks (the pinned asset is the whole input).
export async function enqueueDatasetHmisCsvImportRun(
  mainDb: Sql,
  args: { config: DatasetHmisCsvRunLaunchInput; triggeredBy: string },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const config = await validateCsvRunConfig(mainDb, args.config);
    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO dataset_hmis_import_runs
        (trigger, triggered_by, source, csv_config, status)
      VALUES
        ('manual', ${args.triggeredBy}, 'csv', ${JSON.stringify(config)},
         'queued')
      RETURNING id
    `;
    return { success: true, data: { runId: inserted[0].id } };
  });
}

// Claims a queued CSV row by conditional UPDATE — the partial unique index
// still arbitrates. Returns false when the claim was not taken.
export async function launchQueuedDatasetHmisCsvImportRun(
  mainDb: Sql,
  args: { runId: number; onComplete?: () => void },
): Promise<boolean> {
  if (getWorker("hmis") || getWorker("hmis_dhis2_run")) {
    return false;
  }
  let claimed: number;
  try {
    const updated = await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'running', started_at = now(),
        progress = ${JSON.stringify({ phase: "staging", percent: 0 })}
      WHERE id = ${args.runId} AND status = 'queued'
    `;
    claimed = updated.count;
  } catch (e) {
    console.log(
      `Queued CSV run ${args.runId} lost the launch race — staying queued:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
  if (claimed === 0) {
    return false;
  }
  try {
    await spawnCsvRunWorker(mainDb, {
      runId: args.runId,
      onComplete: args.onComplete,
    });
  } catch (e) {
    // The claim WAS taken and spawnCsvRunWorker already failed it (pin
    // mismatch, missing file) — report true so the caller's notify fires and
    // clients drop the stale "queued" badge.
    console.error(
      `Queued CSV run ${args.runId} failed at spawn:`,
      e instanceof Error ? e.message : e,
    );
  }
  return true;
}

// needs_review resolution. "Integrate anyway" re-claims the slot (or queues
// explicitly behind a running import — the §2 ruled change: a hold never
// blocks the lane); "Discard" cancels and drops the surviving staging table.
export async function resolveDatasetHmisCsvReview(
  mainDb: Sql,
  args: {
    runId: number;
    action: "integrate_anyway" | "discard";
    onComplete?: () => void;
  },
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<
        { status: string; source: string; csv_config: string | null }[]
      >`
        SELECT status, source, csv_config FROM dataset_hmis_import_runs
        WHERE id = ${args.runId}
      `
    ).at(0);
    if (!row || row.source !== "csv") {
      throw new Error("This run is not a CSV import.");
    }
    if (row.status !== "needs_review") {
      throw new Error("This run is not waiting for review.");
    }
    const config = parseJsonOrThrow<DatasetHmisCsvRunConfig>(
      row.csv_config ?? "",
    );

    if (args.action === "discard") {
      const updated = await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'cancelled', ended_at = now(),
          error = 'Discarded at review: staged rows were not integrated.'
        WHERE id = ${args.runId} AND status = 'needs_review'
      `;
      if (updated.count === 0) {
        throw new Error("This run is not waiting for review.");
      }
      await dropHmisCsvStagingTables(mainDb, args.runId, { keepFinal: false });
      return { success: true };
    }

    const resumeConfig: DatasetHmisCsvRunConfig = {
      ...config,
      resumeFromStaging: true,
    };

    // Try to re-claim the slot directly; a unique violation (another import
    // running) queues the run instead — the tick fires it when free.
    let claimedCount = 0;
    try {
      const claimed = await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'running', started_at = now(),
          csv_config = ${JSON.stringify(resumeConfig)},
          progress = ${JSON.stringify({ phase: "integrating", percent: 0 })}
        WHERE id = ${args.runId} AND status = 'needs_review'
      `;
      claimedCount = claimed.count;
    } catch {
      claimedCount = 0;
    }
    if (claimedCount === 0 || getWorker("hmis") || getWorker("hmis_dhis2_run")) {
      if (claimedCount > 0) {
        // Claimed the row but a worker is mid-teardown — queue instead of
        // racing it.
        await mainDb`
          UPDATE dataset_hmis_import_runs
          SET status = 'queued', progress = NULL
          WHERE id = ${args.runId} AND status = 'running'
        `;
        return { success: true };
      }
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'queued', progress = NULL,
          csv_config = ${JSON.stringify(resumeConfig)}
        WHERE id = ${args.runId} AND status = 'needs_review'
      `;
      return { success: true };
    }

    await spawnCsvRunWorker(mainDb, {
      runId: args.runId,
      onComplete: args.onComplete,
    });
    return { success: true };
  });
}

export async function cancelDatasetHmisImportRun(
  mainDb: Sql,
  runId: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const runRow = (
      await mainDb<{ source: "dhis2" | "csv" }[]>`
        SELECT source FROM dataset_hmis_import_runs
        WHERE id = ${runId}
      `
    ).at(0);
    if (!runRow) {
      throw new Error("This run does not exist.");
    }
    // A queued row has no worker and no version — removing it is just a flip.
    const removedFromQueue = await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'cancelled', ended_at = now(),
        error = 'Removed from the queue before starting.'
      WHERE id = ${runId} AND status = 'queued'
    `;
    if (removedFromQueue.count > 0) {
      if (runRow.source === "csv") {
        await dropHmisCsvStagingTables(mainDb, runId, { keepFinal: false });
      }
      return { success: true };
    }
    // The status flip comes FIRST and is conditional on the given runId: a
    // cancel aimed at an already-finished run (stale tab, old list) must not
    // touch the worker — it belongs to whatever run is actually running.
    const updated = await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'cancelled', ended_at = now(), progress = NULL,
        error = ${runRow.source === "csv" ? "Cancelled by user. Nothing was integrated." : "Cancelled by user. Pairs completed before cancellation are preserved in the ledger."}
      WHERE id = ${runId} AND status = 'running'
    `;
    if (updated.count === 0) {
      throw new Error("This run is not running.");
    }
    // Terminating the worker aborts its in-flight transaction; DHIS2 pairs
    // already committed keep their ledger rows (the point of per-pair units),
    // and a CSV run's single transaction rolls back whole. Between the flip
    // and the terminate the worker may still commit (counter increments are
    // deliberately unguarded — finalize recomputes from them) but can never
    // resurrect the run: progress and completion writes are status-guarded.
    const workerKey = runRow.source === "csv" ? "hmis" : "hmis_dhis2_run";
    const worker = getWorker(workerKey);
    if (worker) {
      worker.terminate();
      clearWorker(workerKey, worker);
    }
    if (runRow.source === "csv") {
      await dropHmisCsvStagingTables(mainDb, runId, { keepFinal: false });
    } else {
      // DHIS2 only: a CSV run's version_id commits together with its
      // 'complete' flip, so a cancelled CSV run never has a version to
      // reconcile.
      await finalizeInterruptedDatasetHmisRunVersion(mainDb, runId);
    }
    // No scope-table drop here (DHIS2): the flip above already released the
    // claim, so a successor run may have created its own scope table by now —
    // dropping the fixed-name table here could destroy the successor's
    // snapshot. Every run drops-and-recreates it at start, so a leftover is
    // harmless.
    return { success: true };
  });
}

// DHIS2 runs only (a CSV run's version_id commits with its 'complete' flip).
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
        // Run row written FIRST, but the transaction awaits nothing but its
        // own two statements, so a concurrent progress write only waits for
        // COMMIT (PROTOCOL_APP_WORKER_ROUTINES.md "Gotchas").
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
  const swept = await mainDb<
    { id: number; source: "dhis2" | "csv" }[]
  >`
    UPDATE dataset_hmis_import_runs
    SET status = 'error', ended_at = now(), progress = NULL,
      error = CASE WHEN source = 'csv'
        THEN 'Import run interrupted by a server restart. Nothing was integrated — start the import again.'
        ELSE 'Import run interrupted by a server restart. Pairs completed before the restart are preserved in the ledger.'
      END
    WHERE status = 'running'
    RETURNING id, source
  `;
  for (const row of swept) {
    if (row.source === "csv") {
      await dropHmisCsvStagingTables(mainDb, row.id, { keepFinal: false });
    } else {
      await finalizeInterruptedDatasetHmisRunVersion(mainDb, row.id);
    }
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

export function isValidPeriodId(periodId: number): boolean {
  const year = Math.floor(periodId / 100);
  const month = periodId % 100;
  return (
    year >= _GLOBAL_MIN_YEAR_FOR_PERIODS &&
    year <= _GLOBAL_MAX_YEAR_FOR_PERIODS &&
    month >= 1 &&
    month <= 12
  );
}
