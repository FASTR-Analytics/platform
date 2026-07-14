import type { Dhis2RunCredentialsSource, Dhis2RunSelection } from "lib";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export function instantiateImportHmisDataDhis2Worker(data: {
  runId: number;
  // "inline" credentials travel only in this message — never persisted.
  // "stored" is resolved (read + decrypted) inside the worker at fetch time
  // (PLAN_DHIS2_IMPORTER Phase 4, C3).
  credentialsSource: Dhis2RunCredentialsSource;
  selection: Dhis2RunSelection;
}): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, data);
}
