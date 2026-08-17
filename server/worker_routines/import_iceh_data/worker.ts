// ============================================================================
// ICEH IMPORT RUN WORKER (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase C)
//
// Two legs, one worker: STAGE (in-memory zip parse + per-row validation —
// ICEH is small, no staging tables) and INTEGRATE (the single-transaction
// cumulative per-indicator replace). Clean staging auto-integrates
// unattended; unexplained skipped rows (unknown strat / invalid year /
// unknown indicator) hold the run in needs_review WITH the claim released —
// the retained zip is what makes that safe: "Integrate anyway"
// (skipReviewGate) re-runs the full ingest from it with the gate skipped.
// Zero valid rows fail loudly.
// ============================================================================

import { createBulkImportConnection, createWorkerReadConnection } from "../../db/mod.ts";
import type { IcehImportRunProgress, IcehStagingResult } from "lib";
import {
  PROGRESS_WRITE_INTERVAL_MS,
  createThrottledProgressWriter,
  truncateWorkerError,
} from "../worker_contract.ts";
import type { ImportIcehDataWorkerPayload } from "./instantiate_worker.ts";
import { integrateIcehData, stageIcehZip } from "./ingest.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

// The ICEH clean condition (C4): no row was skipped for a reason the user
// didn't author, and something staged. Missing estimates never gate — "NA"
// estimates are a normal feature of Retriever exports, reported but never
// blocking.
function isCleanStaging(result: IcehStagingResult): boolean {
  return (
    result.nRowsSkippedUnknownStrat === 0 &&
    result.nRowsSkippedInvalidYear === 0 &&
    result.nRowsSkippedUnknownIndicator === 0 &&
    result.nRowsValid > 0
  );
}

async function run(payload: ImportIcehDataWorkerPayload) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { runId, config, zipFilePath } = payload;

  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  const writeProgress = createThrottledProgressWriter<IcehImportRunProgress>(
    PROGRESS_WRITE_INTERVAL_MS,
    async (progress) => {
      // Status guard: never resurrect progress on a cancelled/errored run.
      await mainDb`
        UPDATE iceh_import_runs
        SET progress = ${JSON.stringify(progress)}
        WHERE id = ${runId} AND status = 'running'
      `;
    },
  );

  try {
    // ── Stage leg (in-memory; runs even for skipReviewGate resumes) ───────
    const staged = await stageIcehZip(zipFilePath, (percent) => {
      writeProgress({ phase: "staging", percent }, false);
    });

    if (staged.stagingResult.nRowsValid === 0) {
      // Nothing valid → loud error.
      throw new Error(
        `No rows could be staged from the file (${staged.stagingResult.nRowsTotal} rows read): ` +
          `${staged.stagingResult.nRowsSkippedUnknownStrat} with an unknown disaggregator, ` +
          `${staged.stagingResult.nRowsSkippedInvalidYear} with an invalid year, ` +
          `${staged.stagingResult.nRowsSkippedUnknownIndicator} with an indicator not in indicators.xlsx, ` +
          `${staged.stagingResult.nRowsSkippedMissingEstimate} without an estimate. ` +
          `Check that the zip is an unmodified ICEH Retriever export and try again.`,
      );
    }

    if (!config.skipReviewGate && !isCleanStaging(staged.stagingResult)) {
      // Unexplained skips → hold for review and RELEASE the single-running
      // slot. The zip asset is what "Integrate anyway" re-ingests from.
      await mainDb`
        UPDATE iceh_import_runs
        SET status = 'needs_review', progress = NULL,
          diagnostics = ${JSON.stringify(staged.stagingResult)}
        WHERE id = ${runId} AND status = 'running'
      `;
      await importDb.end();
      await mainDb.end();
      self.postMessage("COMPLETED");
      return;
    }

    // ── Integrate leg ───────────────────────────────────────────────────
    // The completion flip happens INSIDE the merge transaction (see
    // ingest.ts) — a cancel racing the commit either rolls the merge back
    // whole or arrives after the run is already 'complete'.
    await integrateIcehData({
      db: importDb,
      runId,
      staged,
      onProgress: (percent) => {
        writeProgress({ phase: "integrating", percent }, false);
      },
    });

    await importDb.end();
    await mainDb.end();
    self.postMessage("COMPLETED");
  } catch (e) {
    console.error("ICEH import run failed:", e);
    const errorMessage = truncateWorkerError(e);
    try {
      await mainDb`
        UPDATE iceh_import_runs
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
