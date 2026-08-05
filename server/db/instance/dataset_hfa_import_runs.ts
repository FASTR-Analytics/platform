import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  type DatasetHfaCsvStagingResult,
  type HfaCsvMappingParams,
  type HfaCsvRunConfig,
  type HfaCsvRunLaunchInput,
  type HfaImportRunProgress,
  type HfaImportRunSummary,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { instantiateImportHfaDataCsvWorker } from "../../worker_routines/import_hfa_data_csv/instantiate_worker.ts";
import { dropHfaStagingTables } from "../../worker_routines/import_hfa_data_csv/stage_csv.ts";
import {
  deleteImportTempUpload,
  resolveImportTempUpload,
} from "../../import_temp_uploads.ts";
import { getXlsxSheetNamesRaw } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";
import {
  clearWorker,
  getWorker,
  setWorker,
} from "../../worker_routines/worker_store.ts";
import type { DBHfaImportRun } from "./_main_database_types.ts";

// HFA import runs (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase B): one row per
// import, claimed by the partial unique index on status='running'. HFA is a
// deliberately smaller machine than HMIS — no queue and no scheduler, so a
// second launch while one runs is refused explicitly.

function toRunSummary(row: DBHfaImportRun): HfaImportRunSummary {
  const config = parseJsonOrUndefined<HfaCsvRunConfig>(row.csv_config);
  return {
    id: row.id,
    triggeredBy: row.triggered_by ?? undefined,
    timePoint: row.time_point,
    csvFileName: config?.csvFileName ?? "",
    status: row.status,
    error: row.error ?? undefined,
    progress: row.progress
      ? parseJsonOrUndefined<HfaImportRunProgress>(row.progress)
      : undefined,
    diagnostics: row.diagnostics
      ? parseJsonOrUndefined<DatasetHfaCsvStagingResult>(row.diagnostics)
      : undefined,
    nRowsIntegrated: row.n_rows_integrated ?? undefined,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
  };
}

export async function getDatasetHfaImportRunSummaries(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaImportRunSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaImportRun[]>`
      SELECT id, triggered_by, csv_config, time_point, status, error, progress,
        diagnostics, n_rows_integrated, started_at, ended_at
      FROM hfa_import_runs
      ORDER BY id DESC
      LIMIT 50
    `;
    return { success: true, data: rows.map(toRunSummary) };
  });
}

export async function hasRunningDatasetHfaImportRun(
  mainDb: Sql,
): Promise<boolean> {
  const running = await mainDb<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM hfa_import_runs WHERE status = 'running'
    ) as exists
  `;
  return running[0].exists;
}

const IMPORT_RUNNING_MESSAGE =
  "An HFA import is already running. Wait for it to finish.";

async function assertHfaImportSlotFree(mainDb: Sql): Promise<void> {
  if (await hasRunningDatasetHfaImportRun(mainDb)) {
    throw new Error(IMPORT_RUNNING_MESSAGE);
  }
  if (getWorker("hfa")) {
    throw new Error(IMPORT_RUNNING_MESSAGE);
  }
}

// The launch-time validations, all stateless — relocated from the deleted
// step functions (create-attempt facility guard, step-1 XLSForm sheet check,
// step-2 mapping cleaning + time-point existence). Returns the cleaned config
// that gets stored on the run row.
export async function validateHfaCsvRunConfig(
  mainDb: Sql,
  input: HfaCsvRunLaunchInput,
): Promise<HfaCsvRunConfig> {
  const mappings = input.mappings;
  if (!mappings.facilityIdColumn) {
    throw new Error("Select the column containing facility ids.");
  }
  const timePoint = mappings.timePoint.trim();
  if (!timePoint) {
    throw new Error("A time point is required.");
  }
  const rowFilters = mappings.rowFilters.map((f) => ({
    column: f.column,
    op: f.op,
    value: f.value.trim(),
  }));
  for (const f of rowFilters) {
    if (!f.column) {
      throw new Error("Each row filter needs a column.");
    }
    if (!f.value) {
      throw new Error(
        "Each row filter needs a value (blank-matching is not supported).",
      );
    }
  }
  const overrideFacilities = new Set<string>();
  for (const o of mappings.dedupOverrides) {
    if (overrideFacilities.has(o.facilityId)) {
      throw new Error(`Duplicate override for facility "${o.facilityId}".`);
    }
    overrideFacilities.add(o.facilityId);
  }

  const [{ count }] = await mainDb<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM facilities_hfa
  `;
  if (count === 0) {
    throw new Error(
      "No HFA facilities found. Import HFA facilities before importing data.",
    );
  }

  const timePointExists = await mainDb`
    SELECT 1 FROM hfa_time_points WHERE label = ${timePoint}
  `;
  if (timePointExists.length === 0) {
    throw new Error(
      `Time point "${timePoint}" does not exist. Create it on the HFA time points page before importing data.`,
    );
  }

  const csvUpload = await resolveImportTempUpload(input.csvUploadToken);
  const xlsFormUpload = await resolveImportTempUpload(input.xlsFormUploadToken);
  if (!csvUpload || !xlsFormUpload) {
    throw new Error(
      "The uploaded files are no longer available. Upload them again and relaunch.",
    );
  }
  const sheetNames = getXlsxSheetNamesRaw(xlsFormUpload.filePath);
  if (!sheetNames.includes("survey") || !sheetNames.includes("choices")) {
    throw new Error(
      "The XLSForm file must contain both 'survey' and 'choices' sheets.",
    );
  }

  const cleanedMappings: HfaCsvMappingParams = {
    facilityIdColumn: mappings.facilityIdColumn,
    // Stored trimmed so it matches the trimmed value the staging leg writes
    // into the staged rows.
    timePoint,
    rowFilters,
    dedupStrategy: mappings.dedupStrategy,
    dedupOverrides: mappings.dedupOverrides,
  };
  return {
    csvUploadToken: input.csvUploadToken,
    csvFileName: csvUpload.fileName,
    xlsFormUploadToken: input.xlsFormUploadToken,
    xlsFormFileName: xlsFormUpload.fileName,
    mappings: cleanedMappings,
  };
}

// Spawns the run worker for a row already claimed as 'running'. Reads config +
// recorded diagnostics from the row itself, so launch and integrate-anyway
// share one spawn path. A spawn failure releases the claim: a 'running' row
// with no worker would block every HFA import until someone noticed.
async function spawnHfaRunWorker(
  mainDb: Sql,
  args: { runId: number; onComplete?: () => void },
): Promise<void> {
  const { runId, onComplete } = args;
  const row = (
    await mainDb<{ csv_config: string; diagnostics: string | null }[]>`
      SELECT csv_config, diagnostics FROM hfa_import_runs WHERE id = ${runId}
    `
  ).at(0);
  if (!row) {
    throw new Error(`HFA import run ${runId} not found.`);
  }
  const config = parseJsonOrThrow<HfaCsvRunConfig>(row.csv_config);

  const failClaim = async (message: string) => {
    await mainDb`
      UPDATE hfa_import_runs
      SET status = 'error', ended_at = now(), progress = NULL, error = ${message}
      WHERE id = ${runId} AND status = 'running'
    `;
  };

  let csvFilePath = "";
  let xlsFormFilePath = "";
  if (!config.resumeFromStaging) {
    const csvUpload = await resolveImportTempUpload(config.csvUploadToken);
    const xlsFormUpload = await resolveImportTempUpload(
      config.xlsFormUploadToken,
    );
    if (!csvUpload || !xlsFormUpload) {
      await failClaim(
        "The uploaded files are no longer available. Upload them again and relaunch.",
      );
      throw new Error("The uploaded files are no longer available.");
    }
    csvFilePath = csvUpload.filePath;
    xlsFormFilePath = xlsFormUpload.filePath;
  }

  let stagingResult: DatasetHfaCsvStagingResult | undefined;
  if (config.resumeFromStaging) {
    stagingResult = row.diagnostics
      ? parseJsonOrUndefined<DatasetHfaCsvStagingResult>(row.diagnostics)
      : undefined;
    if (!stagingResult) {
      await failClaim(
        "This run has no recorded staging result to integrate. Discard it and start the import again.",
      );
      throw new Error("Missing recorded staging result.");
    }
  }

  let worker: Worker;
  try {
    worker = instantiateImportHfaDataCsvWorker({
      runId,
      config,
      csvFilePath,
      xlsFormFilePath,
      stagingResult,
    });
    setWorker("hfa", worker);
  } catch (spawnError) {
    await failClaim(
      `Failed to start the import worker: ${spawnError instanceof Error ? spawnError.message : String(spawnError)}`,
    );
    throw spawnError;
  }

  worker.addEventListener("error", async (e) => {
    console.error("HFA import run worker crashed:", e);
    e.preventDefault();
    clearWorker("hfa", worker);
    worker.terminate();
    try {
      await mainDb`
        UPDATE hfa_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = ${`Worker crashed: ${e.message || "Unknown error"}`}
        WHERE id = ${runId} AND status = 'running'
      `;
      await dropHfaStagingTables(mainDb, runId, { keepFinal: false });
      await deleteImportTempUpload(config.csvUploadToken);
      await deleteImportTempUpload(config.xlsFormUploadToken);
    } catch (dbError) {
      console.error("Failed to mark HFA run errored after crash:", dbError);
    }
    try {
      await onComplete?.();
    } catch (err) {
      console.error("HFA import run onComplete callback failed:", err);
    }
  });

  worker.addEventListener("message", async (e) => {
    if (e.data === "COMPLETED") {
      clearWorker("hfa", worker);
      worker.terminate();
      try {
        await onComplete?.();
      } catch (err) {
        console.error("HFA import run onComplete callback failed:", err);
      }
    }
  });
}

export async function launchDatasetHfaCsvImportRun(
  mainDb: Sql,
  args: {
    input: HfaCsvRunLaunchInput;
    triggeredBy: string;
    onComplete?: () => void;
  },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const config = await validateHfaCsvRunConfig(mainDb, args.input);

    // Read-guard for a friendly error; the atomic claim is the INSERT below
    // (partial unique index: at most one status='running' row).
    await assertHfaImportSlotFree(mainDb);

    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO hfa_import_runs
        (triggered_by, csv_config, time_point, status, progress)
      VALUES
        (${args.triggeredBy}, ${JSON.stringify(config)},
         ${config.mappings.timePoint}, 'running',
         ${JSON.stringify({ phase: "staging", percent: 0 })})
      RETURNING id
    `;
    const runId = inserted[0].id;

    await spawnHfaRunWorker(mainDb, { runId, onComplete: args.onComplete });

    return { success: true, data: { runId } };
  });
}

// needs_review resolution. "Integrate anyway" re-claims the slot (refused if
// another import is running — HFA has no queue); "Discard" cancels, drops the
// surviving staging tables, and deletes the temp uploads.
export async function resolveDatasetHfaReview(
  mainDb: Sql,
  args: {
    runId: number;
    action: "integrate_anyway" | "discard";
    onComplete?: () => void;
  },
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ status: string; csv_config: string }[]>`
        SELECT status, csv_config FROM hfa_import_runs WHERE id = ${args.runId}
      `
    ).at(0);
    if (!row) {
      throw new Error("This run does not exist.");
    }
    if (row.status !== "needs_review") {
      throw new Error("This run is not waiting for review.");
    }
    const config = parseJsonOrThrow<HfaCsvRunConfig>(row.csv_config);

    if (args.action === "discard") {
      const updated = await mainDb`
        UPDATE hfa_import_runs
        SET status = 'cancelled', ended_at = now(),
          error = 'Discarded at review: staged rows were not integrated.'
        WHERE id = ${args.runId} AND status = 'needs_review'
      `;
      if (updated.count === 0) {
        throw new Error("This run is not waiting for review.");
      }
      await dropHfaStagingTables(mainDb, args.runId, { keepFinal: false });
      await deleteImportTempUpload(config.csvUploadToken);
      await deleteImportTempUpload(config.xlsFormUploadToken);
      return { success: true };
    }

    await assertHfaImportSlotFree(mainDb);

    const resumeConfig: HfaCsvRunConfig = { ...config, resumeFromStaging: true };
    const claimed = await mainDb`
      UPDATE hfa_import_runs
      SET status = 'running', started_at = now(),
        csv_config = ${JSON.stringify(resumeConfig)},
        progress = ${JSON.stringify({ phase: "integrating", percent: 0 })}
      WHERE id = ${args.runId} AND status = 'needs_review'
    `;
    if (claimed.count === 0) {
      throw new Error("This run is not waiting for review.");
    }

    await spawnHfaRunWorker(mainDb, {
      runId: args.runId,
      onComplete: args.onComplete,
    });
    return { success: true };
  });
}

export async function cancelDatasetHfaImportRun(
  mainDb: Sql,
  runId: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ csv_config: string }[]>`
        SELECT csv_config FROM hfa_import_runs WHERE id = ${runId}
      `
    ).at(0);
    if (!row) {
      throw new Error("This run does not exist.");
    }
    // The status flip comes FIRST and is conditional on the given runId: a
    // cancel aimed at an already-finished run (stale tab) must not touch the
    // worker — it belongs to whatever run is actually running.
    const updated = await mainDb`
      UPDATE hfa_import_runs
      SET status = 'cancelled', ended_at = now(), progress = NULL,
        error = 'Cancelled by user. Nothing was integrated.'
      WHERE id = ${runId} AND status = 'running'
    `;
    if (updated.count === 0) {
      throw new Error("This run is not running.");
    }
    // Terminating the worker aborts its in-flight transaction; the integrate
    // leg is a single transaction, so it rolls back whole.
    const worker = getWorker("hfa");
    if (worker) {
      worker.terminate();
      clearWorker("hfa", worker);
    }
    await dropHfaStagingTables(mainDb, runId, { keepFinal: false });
    const config = parseJsonOrThrow<HfaCsvRunConfig>(row.csv_config);
    await deleteImportTempUpload(config.csvUploadToken);
    await deleteImportTempUpload(config.xlsFormUploadToken);
    return { success: true };
  });
}

// Startup sweep: a restart mid-run leaves a 'running' row with no live worker,
// and the claim would then block every future HFA import.
export async function markStaleRunningDatasetHfaImportRuns(
  mainDb: Sql,
): Promise<number> {
  const swept = await mainDb<{ id: number; csv_config: string }[]>`
    UPDATE hfa_import_runs
    SET status = 'error', ended_at = now(), progress = NULL,
      error = 'Import run interrupted by a server restart. Nothing was integrated — start the import again.'
    WHERE status = 'running'
    RETURNING id, csv_config
  `;
  for (const row of swept) {
    await dropHfaStagingTables(mainDb, row.id, { keepFinal: false });
    const config = parseJsonOrUndefined<HfaCsvRunConfig>(row.csv_config);
    if (config) {
      await deleteImportTempUpload(config.csvUploadToken);
      await deleteImportTempUpload(config.xlsFormUploadToken);
    }
  }
  return swept.length;
}
