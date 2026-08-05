import type { DatasetHfaCsvStagingResult, HfaCsvRunConfig } from "lib";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export type ImportHfaDataCsvWorkerPayload = {
  runId: number;
  config: HfaCsvRunConfig;
  // Resolved by the host at spawn time; empty for a resumeFromStaging run
  // (the integrate leg reads the surviving staging tables, not the files).
  csvFilePath: string;
  xlsFormFilePath: string;
  // Present only for resumeFromStaging runs — the diagnostics recorded at the
  // needs_review hold, which the integrate leg runs against.
  stagingResult?: DatasetHfaCsvStagingResult;
};

export function instantiateImportHfaDataCsvWorker(
  payload: ImportHfaDataCsvWorkerPayload,
): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, payload);
}
