import { DBDatasetHfaUploadAttempt } from "../../db/instance/_main_database_types.ts";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export function instantiateIntegrateHfaDataWorker(
  rawDUA: DBDatasetHfaUploadAttempt
): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, { rawDUA });
}
