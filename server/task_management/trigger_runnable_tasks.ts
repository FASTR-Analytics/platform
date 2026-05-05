import { ProjectPk, StartingTaskData } from "../server_only_types/mod.ts";
import { instantiateRunModuleWorker } from "../worker_routines/run_module/mod.ts";
import { areUpstreamDependenciesOfModuleAllReady } from "./get_dependents.ts";
import { notifyProjectModuleDirtyState } from "./notify_project_v2.ts";
import { addRunningModule, hasRunningModule } from "./running_tasks_map.ts";

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
  notifyProjectModuleDirtyState(ppk.projectId, modulesToRun, "running");
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
      continue;
    }
    runnableModules.push(rawModule.id);
  }
  return runnableModules;
}
