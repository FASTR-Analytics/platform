import type { DBDatasetHmisUploadAttempt } from "../../db/mod.ts";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export function instantiateStageHmisDataDhis2Worker(
  rawDUA: DBDatasetHmisUploadAttempt,
  failFastMode?: "fail-fast" | "continue-on-error"
): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, {
    rawDUA,
    failFastMode,
  });
}
