import { ProjectPk, StartingTaskData } from "../server_only_types/mod.ts";
import { instantiateRunModuleWorker } from "../worker_routines/run_module/mod.ts";
import { areUpstreamDependenciesOfModuleAllReady } from "./get_dependents.ts";
import { notifyProjectModuleDirtyState } from "./notify_project_v2.ts";
import { handleModuleTaskEnded } from "./set_module_clean.ts";
import {
  attachRunningModuleWorker,
  claimRunningModule,
  hasRunningModule,
  releaseClaimedModule,
} from "./running_tasks_map.ts";

export async function triggerRunnableModules(ppk: ProjectPk) {
  const rawModules = await ppk.projectDb<{ id: string }[]>`
SELECT id FROM modules WHERE dirty = 'queued'
`;
  const startedModuleIds: string[] = [];
  for (const rawModule of rawModules) {
    const moduleId = rawModule.id;
    if (hasRunningModule(ppk.projectId, moduleId)) {
      continue;
    }
    // Claim the slot in the same synchronous segment as the check above, so a
    // concurrent trigger invocation cannot also start this module.
    const runToken = crypto.randomUUID();
    claimRunningModule(ppk.projectId, moduleId, runToken);
    let dependenciesAllReady: boolean;
    try {
      dependenciesAllReady = await areUpstreamDependenciesOfModuleAllReady(
        ppk.projectDb,
        moduleId,
      );
    } catch (error) {
      releaseClaimedModule(ppk.projectId, moduleId, runToken);
      throw error;
    }
    if (!dependenciesAllReady) {
      releaseClaimedModule(ppk.projectId, moduleId, runToken);
      continue;
    }
    const std: StartingTaskData = {
      projectId: ppk.projectId,
      moduleId,
      runToken,
    };
    const worker = instantiateRunModuleWorker(std);
    worker.addEventListener("error", (e) => {
      e.preventDefault(); // Prevent the error from propagating and crashing the server
      handleModuleTaskEnded({
        projectId: ppk.projectId,
        moduleId,
        runToken,
        successOrError: "error",
      }).catch((error) => {
        console.error("Error handling module worker error:", error);
      });
    });
    if (attachRunningModuleWorker(ppk.projectId, moduleId, runToken, worker)) {
      startedModuleIds.push(moduleId);
    }
  }
  if (startedModuleIds.length > 0) {
    notifyProjectModuleDirtyState(ppk.projectId, startedModuleIds, "running");
  }
}
