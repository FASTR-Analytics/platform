import { StartingTaskData } from "../../server_only_types/mod.ts";
import { instantiateWorker } from "../instantiate_worker_generic.ts";

export function instantiateRunModuleWorker(std: StartingTaskData): Worker {
  return instantiateWorker(
    "./worker.ts",
    import.meta.url,
    {
      projectId: std.projectId,
      moduleId: std.moduleId,
    }
  );
}