import type { IcehRunConfig } from "lib";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export type ImportIcehDataWorkerPayload = {
  runId: number;
  config: IcehRunConfig;
  // Resolved by the host at spawn time. Staging is in-memory, so even a
  // skipReviewGate run re-ingests from the retained zip.
  zipFilePath: string;
};

export function instantiateImportIcehDataWorker(
  payload: ImportIcehDataWorkerPayload,
): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, payload);
}
