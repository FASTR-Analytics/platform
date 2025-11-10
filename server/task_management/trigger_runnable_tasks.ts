import { ProjectSseUpdateMessage } from "lib";
import { ProjectPk, StartingTaskData } from "../server_only_types/mod.ts";
import { instantiateRunModuleWorker } from "../worker_routines/run_module/mod.ts";
import { areUpstreamDependenciesOfModuleAllReady } from "./get_dependents.ts";
import { addRunningModule, hasRunningModule } from "./running_tasks_map.ts";

const broadcastDirtyStates = new BroadcastChannel("dirty_states");

export async function triggerRunnableModules(ppk: ProjectPk) {
  const modulesToRun = await getNextRunnableModules(ppk);
  if (modulesToRun.length === 0) {
    return;
  }
  for (const moduleId of modulesToRun) {
    const std: StartingTaskData = {
      projectId: ppk.projectId,
      moduleId,
    };
    const worker = instantiateRunModuleWorker(std);
    addRunningModule(ppk.projectId, moduleId, worker);
  }
  const bm1: ProjectSseUpdateMessage = {
    projectId: ppk.projectId,
    type: "module_dirty_state_and_last_run",
    ids: modulesToRun,
    dirtyOrRunStatus: "running",
    lastRun: undefined,
  };
  broadcastDirtyStates.postMessage(bm1);
}

async function getNextRunnableModules(ppk: ProjectPk): Promise<string[]> {
  const runnableModules: string[] = [];
  const rawModules = await ppk.projectDb<{ id: string }[]>`
SELECT id FROM modules WHERE dirty = 'queued'
`;
  for (const rawModule of rawModules) {
    if (hasRunningModule(ppk.projectId, rawModule.id)) {
      continue;
    }
    const dependenciesAllReady = await areUpstreamDependenciesOfModuleAllReady(
      ppk.projectDb,
      rawModule.id
    );
    if (!dependenciesAllReady) {
      console.log("Dependencies NOT READY for", rawModule.id);
      continue;
    }
    runnableModules.push(rawModule.id);
  }
  return runnableModules;
}
