import type { Dhis2Credentials, Dhis2RunSelection } from "lib";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export function instantiateImportHmisDataDhis2Worker(data: {
  runId: number;
  // Credentials travel only in this message — never persisted (C3 adds
  // encrypted stored credentials in Phase 4).
  credentials: Dhis2Credentials;
  selection: Dhis2RunSelection;
}): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, data);
}
