// ============================================================================
// HMIS CSV IMPORT RUN WORKER (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase A)
//
// Two legs, one worker: STAGE (stream the CSV into per-run staging tables,
// evaluate the clean condition) and INTEGRATE (the single-transaction CSV
// merge). Clean staging auto-integrates unattended; dropped rows hold the run
// in needs_review WITH the claim released (per-run staging tables are what
// make that safe); zero staged rows fail loudly. A resumeFromStaging payload
// (needs_review resolved with "Integrate anyway") skips straight to the
// integrate leg against the surviving staging table.
// ============================================================================

import {
  createBulkImportConnection,
  createWorkerReadConnection,
} from "../../db/mod.ts";
import type {
  DatasetCsvStagingResult,
  DatasetHmisImportRunProgress,
} from "lib";
import { deleteImportTempUpload } from "../../import_temp_uploads.ts";
import {
  PROGRESS_WRITE_INTERVAL_MS,
  createThrottledProgressWriter,
  truncateWorkerError,
} from "../worker_contract.ts";
import type { ImportHmisDataCsvWorkerPayload } from "./instantiate_worker.ts";
import { dropHmisCsvStagingTables, stageHmisCsvIntoTables } from "./stage_csv.ts";
import { integrateStagedHmisCsvData } from "./integrate_staged.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

// The HMIS CSV clean condition (the exact §9 rule): every validation drop
// counter is zero AND at least one row staged. A missing validation block is
// treated as error, never as clean.
function isCleanStaging(result: DatasetCsvStagingResult): boolean {
  const v = result.validation;
  if (!v) {
    return false;
  }
  return (
    v.invalidPeriods.rowsDropped === 0 &&
    v.invalidCounts.rowsDropped === 0 &&
    v.missingRequiredFields.rowsDropped === 0 &&
    v.invalidFacilities.rowsDropped === 0 &&
    v.unmappedIndicators.rowsDropped === 0 &&
    result.finalStagingRowCount > 0
  );
}

async function run(payload: ImportHmisDataCsvWorkerPayload) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { runId, config, csvFilePath } = payload;

  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  const writeProgress = createThrottledProgressWriter<DatasetHmisImportRunProgress>(
    PROGRESS_WRITE_INTERVAL_MS,
    async (progress) => {
      // Status guard: never resurrect progress on a cancelled/errored run.
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET progress = ${JSON.stringify(progress)}
        WHERE id = ${runId} AND status = 'running'
      `;
    },
  );

  try {
    let stagingResult: DatasetCsvStagingResult;

    if (config.resumeFromStaging) {
      if (!payload.stagingResult) {
        throw new Error(
          "Integrate-anyway run has no recorded staging result — discard and start the import again.",
        );
      }
      stagingResult = payload.stagingResult;
    } else {
      // ── Stage leg ─────────────────────────────────────────────────────
      stagingResult = await stageHmisCsvIntoTables({
        importDb,
        csvFilePath,
        csvFileName: config.fileName,
        mappings: config.mappings,
        runId,
        onProgress: async (percent) => {
          await writeProgress({ phase: "staging", percent }, false);
        },
      });

      if (stagingResult.finalStagingRowCount === 0) {
        // Zero staged rows → loud error (the catch below drops the tables).
        const v = stagingResult.validation;
        throw new Error(
          `All rows were dropped during staging: ` +
            `${v?.invalidFacilities.rowsDropped ?? 0} with unknown facilities, ` +
            `${v?.unmappedIndicators.rowsDropped ?? 0} with unknown indicators. ` +
            `Check the column mappings and try again.`,
        );
      }

      if (!isCleanStaging(stagingResult)) {
        // Dirty staging → hold for review and RELEASE the single-running
        // slot. The per-run staging table survives the hold; the temp upload
        // is retained until the run resolves.
        await dropHmisCsvStagingTables(importDb, runId, { keepFinal: true });
        await mainDb`
          UPDATE dataset_hmis_import_runs
          SET status = 'needs_review', progress = NULL,
            run_stats = ${JSON.stringify({ csvStagingResult: stagingResult })}
          WHERE id = ${runId} AND status = 'running'
        `;
        await importDb.end();
        await mainDb.end();
        self.postMessage("COMPLETED");
        return;
      }
    }

    // ── Integrate leg ───────────────────────────────────────────────────
    await integrateStagedHmisCsvData({
      importDb,
      mainDb,
      runId,
      stagingResult,
      onProgress: async (percent) => {
        await writeProgress({ phase: "integrating", percent }, false);
      },
    });

    await mainDb`
      UPDATE dataset_hmis_import_runs
      SET status = 'complete', ended_at = now(), progress = NULL,
        run_stats = ${JSON.stringify({ csvStagingResult: stagingResult })}
      WHERE id = ${runId} AND status = 'running'
    `;

    await deleteImportTempUpload(config.uploadToken);

    await importDb.end();
    await mainDb.end();
    self.postMessage("COMPLETED");
  } catch (e) {
    console.error("HMIS CSV import run failed:", e);
    const errorMessage = truncateWorkerError(e);
    try {
      await dropHmisCsvStagingTables(importDb, runId, { keepFinal: false });
    } catch {
      // Ignore cleanup errors
    }
    try {
      await deleteImportTempUpload(config.uploadToken);
    } catch {
      // Ignore cleanup errors
    }
    try {
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = ${errorMessage}
        WHERE id = ${runId} AND status = 'running'
      `;
    } catch {
      // Ignore status update errors
    }
    try {
      await importDb.end();
      await mainDb.end();
    } catch {
      // Ignore connection close errors
    }
    throw e;
  }
}
