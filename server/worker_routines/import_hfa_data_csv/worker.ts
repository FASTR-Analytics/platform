// ============================================================================
// HFA CSV IMPORT RUN WORKER (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase B)
//
// Two legs, one worker: STAGE (XLSForm parse + wide→long CSV stream into
// per-run staging tables, evaluate the clean condition) and INTEGRATE (the
// single-transaction per-time-point replace). Clean staging auto-integrates
// unattended; dropped facility rows hold the run in needs_review WITH the
// claim released (per-run staging tables are what make that safe); zero
// staged rows fail loudly. A resumeFromStaging payload (needs_review resolved
// with "Integrate anyway") skips straight to the integrate leg.
// ============================================================================

import {
  createBulkImportConnection,
  createWorkerReadConnection,
} from "../../db/mod.ts";
import type { DatasetHfaCsvStagingResult, HfaImportRunProgress } from "lib";
import {
  PROGRESS_WRITE_INTERVAL_MS,
  createThrottledProgressWriter,
  truncateWorkerError,
} from "../worker_contract.ts";
import type { ImportHfaDataCsvWorkerPayload } from "./instantiate_worker.ts";
import { dropHfaStagingTables, stageHfaCsvIntoTables } from "./stage_csv.ts";
import { integrateStagedHfaData } from "./integrate_staged.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

// The HFA clean condition (B4): no facility row was dropped, and something
// staged. Duplicates do NOT gate — they are RESOLVED at wizard time by the
// dedup strategy/overrides, so a nonzero count is normal. Filtered-out rows do
// not gate either: row filters are user-authored intent.
function isCleanStaging(result: DatasetHfaCsvStagingResult): boolean {
  return (
    result.nRowsInvalidMissingFacilityId === 0 &&
    result.nRowsInvalidFacilityNotFound === 0 &&
    result.nRowsTotal > 0
  );
}

async function run(payload: ImportHfaDataCsvWorkerPayload) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { runId, config, csvFilePath, xlsFormFilePath } = payload;

  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  const writeProgress = createThrottledProgressWriter<HfaImportRunProgress>(
    PROGRESS_WRITE_INTERVAL_MS,
    async (progress) => {
      // Status guard: never resurrect progress on a cancelled/errored run.
      await mainDb`
        UPDATE hfa_import_runs
        SET progress = ${JSON.stringify(progress)}
        WHERE id = ${runId} AND status = 'running'
      `;
    },
  );

  try {
    let stagingResult: DatasetHfaCsvStagingResult;

    if (config.resumeFromStaging) {
      if (!payload.stagingResult) {
        throw new Error(
          "Integrate-anyway run has no recorded staging result — discard and start the import again.",
        );
      }
      stagingResult = payload.stagingResult;
    } else {
      // ── Stage leg ─────────────────────────────────────────────────────
      stagingResult = await stageHfaCsvIntoTables({
        importDb,
        csvFilePath,
        csvFileName: config.csvFileName,
        xlsFormFilePath,
        mappings: config.mappings,
        runId,
        onProgress: async (percent) => {
          await writeProgress({ phase: "staging", percent }, false);
        },
      });

      if (stagingResult.nRowsTotal === 0) {
        // Nothing staged → loud error (the catch below drops the tables).
        throw new Error(
          `No rows could be staged from the file (${stagingResult.nRowsInFile} rows read): ` +
            `${stagingResult.nRowsInvalidMissingFacilityId} with a missing facility id, ` +
            `${stagingResult.nRowsInvalidFacilityNotFound} facilities not found, ` +
            `${stagingResult.nRowsFilteredOut} removed by the row filters. ` +
            `Check the facility id column and filters and try again.`,
        );
      }

      if (!isCleanStaging(stagingResult)) {
        // Dropped facility rows → hold for review and RELEASE the
        // single-running slot. The per-run staging tables survive the hold.
        const held = await mainDb`
          UPDATE hfa_import_runs
          SET status = 'needs_review', progress = NULL,
            diagnostics = ${JSON.stringify(stagingResult)}
          WHERE id = ${runId} AND status = 'running'
        `;
        if (held.count === 0) {
          // The run was cancelled under us (a cancel can land before this
          // worker is registered, so nothing terminated it) — a cancelled
          // run may keep nothing.
          await dropHfaStagingTables(importDb, runId, { keepFinal: false });
        }
        await importDb.end();
        await mainDb.end();
        self.postMessage("COMPLETED");
        return;
      }
    }

    // ── Integrate leg ───────────────────────────────────────────────────
    // The completion flip happens INSIDE the merge transaction (see
    // integrate_staged.ts) — a cancel racing the commit either rolls the
    // merge back whole or arrives after the run is already 'complete'.
    await integrateStagedHfaData({
      importDb,
      mainDb,
      runId,
      stagingResult,
      onProgress: async (percent) => {
        await writeProgress({ phase: "integrating", percent }, false);
      },
    });

    await importDb.end();
    await mainDb.end();
    self.postMessage("COMPLETED");
  } catch (e) {
    console.error("HFA import run failed:", e);
    const errorMessage = truncateWorkerError(e);
    try {
      await dropHfaStagingTables(importDb, runId, { keepFinal: false });
    } catch {
      // Ignore cleanup errors
    }
    try {
      await mainDb`
        UPDATE hfa_import_runs
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
