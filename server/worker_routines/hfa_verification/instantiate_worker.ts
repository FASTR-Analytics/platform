import { instantiateWorker } from "../instantiate_worker_generic.ts";

export type HfaVerificationWorkerPayload = { runId: string };

export function instantiateHfaVerificationWorker(
  payload: HfaVerificationWorkerPayload,
): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, payload);
}
