import type { DatasetCsvStagingResult, DatasetHmisCsvRunConfig } from "lib";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export type ImportHmisDataCsvWorkerPayload = {
  runId: number;
  config: DatasetHmisCsvRunConfig;
  // Resolved by the host at spawn time; empty for a resumeFromStaging run
  // (the integrate leg reads the surviving staging table, not the file).
  csvFilePath: string;
  // Present only for resumeFromStaging runs — the diagnostics recorded at the
  // needs_review hold, which the integrate leg verifies the table against.
  stagingResult?: DatasetCsvStagingResult;
};

export function instantiateImportHmisDataCsvWorker(
  payload: ImportHmisDataCsvWorkerPayload,
): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, payload);
}
