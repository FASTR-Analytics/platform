import { instantiateWorker } from "../instantiate_worker_generic.ts";
import type { GenerateRunStartData } from "./types.ts";

export function instantiateGenerateRunWorker(std: GenerateRunStartData): Worker {
  return instantiateWorker("./worker.ts", import.meta.url, std);
}
