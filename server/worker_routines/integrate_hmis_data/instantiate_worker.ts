import type { DBDatasetHmisUploadAttempt } from "../../db/mod.ts";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export function instantiateIntegrateUploadedDataWorker(
  rawDUA: DBDatasetHmisUploadAttempt
): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, {
    rawDUA,
  });
}
