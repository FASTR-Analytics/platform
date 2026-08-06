import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  type IcehImportRunProgress,
  type IcehImportRunSummary,
  type IcehRunConfig,
  type IcehStagingResult,
  type IcehStep1Result,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { instantiateImportIcehDataWorker } from "../../worker_routines/import_iceh_data/instantiate_worker.ts";
import { parseIcehZipPreview } from "../../worker_routines/import_iceh_data/ingest.ts";
import {
  deleteImportTempUpload,
  resolveImportTempUpload,
} from "../../import_temp_uploads.ts";
import {
  clearWorker,
  getWorker,
  setWorker,
} from "../../worker_routines/worker_store.ts";
import { _INSTANCE_COUNTRY_ISO3 } from "../../exposed_env_vars.ts";
import type { DBIcehImportRun } from "./_main_database_types.ts";

// ICEH import runs (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase C): one row per
// import, claimed by the partial unique index on status='running'. ICEH is a
// deliberately smaller machine than HMIS — no queue and no scheduler, so a
// second launch while one runs is refused explicitly. These run rows are
// ICEH's first-ever durable import history.

function toRunSummary(row: DBIcehImportRun): IcehImportRunSummary {
  const config = parseJsonOrUndefined<IcehRunConfig>(row.zip_config);
  return {
    id: row.id,
    triggeredBy: row.triggered_by ?? undefined,
    zipFileName: config?.zipFileName ?? "",
    status: row.status,
    error: row.error ?? undefined,
    progress: row.progress
      ? parseJsonOrUndefined<IcehImportRunProgress>(row.progress)
      : undefined,
    diagnostics: row.diagnostics
      ? parseJsonOrUndefined<IcehStagingResult>(row.diagnostics)
      : undefined,
    nRowsIntegrated: row.n_rows_integrated ?? undefined,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
  };
}

export async function getDatasetIcehImportRunSummaries(
  mainDb: Sql,
): Promise<APIResponseWithData<IcehImportRunSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBIcehImportRun[]>`
      SELECT id, triggered_by, zip_config, status, error, progress,
        diagnostics, n_rows_integrated, started_at, ended_at
      FROM iceh_import_runs
      ORDER BY id DESC
      LIMIT 50
    `;
    return { success: true, data: rows.map(toRunSummary) };
  });
}

export async function hasRunningDatasetIcehImportRun(
  mainDb: Sql,
): Promise<boolean> {
  const running = await mainDb<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM iceh_import_runs WHERE status = 'running'
    ) as exists
  `;
  return running[0].exists;
}

const IMPORT_RUNNING_MESSAGE =
  "An ICEH import is already running. Wait for it to finish.";

async function assertIcehImportSlotFree(mainDb: Sql): Promise<void> {
  if (await hasRunningDatasetIcehImportRun(mainDb)) {
    throw new Error(IMPORT_RUNNING_MESSAGE);
  }
  if (getWorker("iceh")) {
    throw new Error(IMPORT_RUNNING_MESSAGE);
  }
}

// The launch-time validations, all stateless — relocated from the deleted
// step functions (step-1 zip parse, step-2 country-ISO pre-check). Returns
// the config that gets stored on the run row plus the preview facts.
export async function validateIcehRunLaunch(
  mainDb: Sql,
  zipUploadToken: string,
): Promise<{ config: IcehRunConfig; preview: IcehStep1Result }> {
  const zipUpload = await resolveImportTempUpload(zipUploadToken);
  if (!zipUpload) {
    throw new Error(
      "The uploaded file is no longer available. Upload it again and relaunch.",
    );
  }
  const preview = await parseIcehZipPreview(
    zipUpload.filePath,
    zipUpload.fileName,
  );

  if (_INSTANCE_COUNTRY_ISO3 !== preview.countryIso) {
    throw new Error(
      `Country mismatch: zip contains ${preview.countryIso} but instance is configured for ${_INSTANCE_COUNTRY_ISO3}`,
    );
  }

  return {
    config: { zipUploadToken, zipFileName: zipUpload.fileName },
    preview,
  };
}

// Spawns the run worker for a row already claimed as 'running'. Reads config
// from the row itself, so launch and integrate-anyway share one spawn path
// (staging is in-memory, so both spawn the full ingest from the zip). A spawn
// failure releases the claim: a 'running' row with no worker would block
// every ICEH import until someone noticed.
async function spawnIcehRunWorker(
  mainDb: Sql,
  args: { runId: number; onComplete?: () => void },
): Promise<void> {
  const { runId, onComplete } = args;
  const row = (
    await mainDb<{ zip_config: string }[]>`
      SELECT zip_config FROM iceh_import_runs WHERE id = ${runId}
    `
  ).at(0);
  if (!row) {
    throw new Error(`ICEH import run ${runId} not found.`);
  }
  const config = parseJsonOrThrow<IcehRunConfig>(row.zip_config);

  const failClaim = async (message: string) => {
    await mainDb`
      UPDATE iceh_import_runs
      SET status = 'error', ended_at = now(), progress = NULL, error = ${message}
      WHERE id = ${runId} AND status = 'running'
    `;
  };

  const zipUpload = await resolveImportTempUpload(config.zipUploadToken);
  if (!zipUpload) {
    await failClaim(
      "The uploaded file is no longer available. Upload it again and relaunch.",
    );
    throw new Error("The uploaded file is no longer available.");
  }

  let worker: Worker;
  try {
    worker = instantiateImportIcehDataWorker({
      runId,
      config,
      zipFilePath: zipUpload.filePath,
    });
    setWorker("iceh", worker);
  } catch (spawnError) {
    await failClaim(
      `Failed to start the import worker: ${spawnError instanceof Error ? spawnError.message : String(spawnError)}`,
    );
    throw spawnError;
  }

  worker.addEventListener("error", async (e) => {
    console.error("ICEH import run worker crashed:", e);
    e.preventDefault();
    clearWorker("iceh", worker);
    worker.terminate();
    try {
      // The flip gates the zip delete: a crash after the needs_review flip
      // matches nothing here, and a held run's zip must survive — it is
      // what "Integrate anyway" re-ingests from.
      const flipped = await mainDb`
        UPDATE iceh_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = ${`Worker crashed: ${e.message || "Unknown error"}`}
        WHERE id = ${runId} AND status = 'running'
      `;
      if (flipped.count > 0) {
        await deleteImportTempUpload(config.zipUploadToken);
      }
    } catch (dbError) {
      console.error("Failed to mark ICEH run errored after crash:", dbError);
    }
    try {
      await onComplete?.();
    } catch (err) {
      console.error("ICEH import run onComplete callback failed:", err);
    }
  });

  worker.addEventListener("message", async (e) => {
    if (e.data === "COMPLETED") {
      clearWorker("iceh", worker);
      worker.terminate();
      try {
        await onComplete?.();
      } catch (err) {
        console.error("ICEH import run onComplete callback failed:", err);
      }
    }
  });
}

export async function launchDatasetIcehImportRun(
  mainDb: Sql,
  args: {
    zipUploadToken: string;
    triggeredBy: string;
    onComplete?: () => void;
  },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const { config } = await validateIcehRunLaunch(mainDb, args.zipUploadToken);

    // Read-guard for a friendly error; the atomic claim is the INSERT below
    // (partial unique index: at most one status='running' row).
    await assertIcehImportSlotFree(mainDb);

    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO iceh_import_runs
        (triggered_by, zip_config, status, progress)
      VALUES
        (${args.triggeredBy}, ${JSON.stringify(config)}, 'running',
         ${JSON.stringify({ phase: "staging", percent: 0 })})
      RETURNING id
    `;
    const runId = inserted[0].id;

    await spawnIcehRunWorker(mainDb, { runId, onComplete: args.onComplete });

    return { success: true, data: { runId } };
  });
}

// needs_review resolution. "Integrate anyway" re-claims the slot (refused if
// another import is running — ICEH has no queue) and re-runs the full ingest
// from the retained zip with the gate skipped; "Discard" cancels and deletes
// the temp zip.
export async function resolveDatasetIcehReview(
  mainDb: Sql,
  args: {
    runId: number;
    action: "integrate_anyway" | "discard";
    onComplete?: () => void;
  },
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ status: string; zip_config: string }[]>`
        SELECT status, zip_config FROM iceh_import_runs WHERE id = ${args.runId}
      `
    ).at(0);
    if (!row) {
      throw new Error("This run does not exist.");
    }
    if (row.status !== "needs_review") {
      throw new Error("This run is not waiting for review.");
    }
    const config = parseJsonOrThrow<IcehRunConfig>(row.zip_config);

    if (args.action === "discard") {
      const updated = await mainDb`
        UPDATE iceh_import_runs
        SET status = 'cancelled', ended_at = now(),
          error = 'Discarded at review: skipped rows were not integrated.'
        WHERE id = ${args.runId} AND status = 'needs_review'
      `;
      if (updated.count === 0) {
        throw new Error("This run is not waiting for review.");
      }
      await deleteImportTempUpload(config.zipUploadToken);
      return { success: true };
    }

    await assertIcehImportSlotFree(mainDb);

    const resumeConfig: IcehRunConfig = { ...config, skipReviewGate: true };
    const claimed = await mainDb`
      UPDATE iceh_import_runs
      SET status = 'running', started_at = now(),
        zip_config = ${JSON.stringify(resumeConfig)},
        progress = ${JSON.stringify({ phase: "staging", percent: 0 })}
      WHERE id = ${args.runId} AND status = 'needs_review'
    `;
    if (claimed.count === 0) {
      throw new Error("This run is not waiting for review.");
    }

    await spawnIcehRunWorker(mainDb, {
      runId: args.runId,
      onComplete: args.onComplete,
    });
    return { success: true };
  });
}

export async function cancelDatasetIcehImportRun(
  mainDb: Sql,
  runId: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ zip_config: string }[]>`
        SELECT zip_config FROM iceh_import_runs WHERE id = ${runId}
      `
    ).at(0);
    if (!row) {
      throw new Error("This run does not exist.");
    }
    // The status flip comes FIRST and is conditional on the given runId: a
    // cancel aimed at an already-finished run (stale tab) must not touch the
    // worker — it belongs to whatever run is actually running.
    const updated = await mainDb`
      UPDATE iceh_import_runs
      SET status = 'cancelled', ended_at = now(), progress = NULL,
        error = 'Cancelled by user. Nothing was integrated.'
      WHERE id = ${runId} AND status = 'running'
    `;
    if (updated.count === 0) {
      throw new Error("This run is not running.");
    }
    // Terminating the worker aborts its in-flight transaction; the integrate
    // leg is a single transaction, so it rolls back whole.
    const worker = getWorker("iceh");
    if (worker) {
      worker.terminate();
      clearWorker("iceh", worker);
    }
    const config = parseJsonOrThrow<IcehRunConfig>(row.zip_config);
    await deleteImportTempUpload(config.zipUploadToken);
    return { success: true };
  });
}

// Startup sweep: a restart mid-run leaves a 'running' row with no live
// worker, and the claim would then block every future ICEH import. This
// replaces the ICEH arm of the deleted resetWedgedUploadAttempts — and fixes
// the old intra-process wedge for good (an abandoned un-awaited ingest
// promise nothing could cancel).
export async function markStaleRunningDatasetIcehImportRuns(
  mainDb: Sql,
): Promise<number> {
  const swept = await mainDb<{ id: number; zip_config: string }[]>`
    UPDATE iceh_import_runs
    SET status = 'error', ended_at = now(), progress = NULL,
      error = 'Import run interrupted by a server restart. Nothing was integrated — start the import again.'
    WHERE status = 'running'
    RETURNING id, zip_config
  `;
  for (const row of swept) {
    const config = parseJsonOrUndefined<IcehRunConfig>(row.zip_config);
    if (config) {
      await deleteImportTempUpload(config.zipUploadToken);
    }
  }
  return swept.length;
}
