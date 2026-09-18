import type { Dhis2RunSelection } from "lib";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export function instantiateImportHmisDataDhis2Worker(data: {
  runId: number;
  selection: Dhis2RunSelection;
}): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, data);
}
