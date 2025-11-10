import { ProjectSseUpdateMessage, type DatasetType } from "lib";
import { ProjectPk } from "../server_only_types/mod.ts";
import {
  addModulesThatDependOnDataset,
  addOtherModulesThatDependOnModule,
} from "./get_dependents.ts";
import {
  getRunningModuleOrUndefined,
  removeRunningModule,
} from "./running_tasks_map.ts";
import { triggerRunnableModules } from "./trigger_runnable_tasks.ts";

const broadcastDirtyStates = new BroadcastChannel("dirty_states");

export async function setModulesDirtyForDataset(
  ppk: ProjectPk,
  datasetType: DatasetType
) {
  const moduleIds: string[] = [];
  await addModulesThatDependOnDataset(ppk.projectDb, datasetType, moduleIds);
  await setDirtyInner(ppk, moduleIds);
}

export async function setModuleDirty(ppk: ProjectPk, moduleId: string) {
  const moduleIds: string[] = [moduleId];
  await addOtherModulesThatDependOnModule(ppk.projectDb, moduleId, moduleIds);
  await setDirtyInner(ppk, moduleIds);
}

export async function setAllModulesDirty(ppk: ProjectPk) {
  const moduleIds = (
    await ppk.projectDb<{ id: string }[]>`SELECT id FROM modules`
  ).map((rawModule) => rawModule.id);
  await setDirtyInner(ppk, moduleIds);
}

async function setDirtyInner(ppk: ProjectPk, moduleIds: string[]) {
  for (const moduleId of moduleIds) {
    const runningWorker = getRunningModuleOrUndefined(ppk.projectId, moduleId);
    if (runningWorker) {
      runningWorker.terminate();
      removeRunningModule(ppk.projectId, moduleId);
    }
    await ppk.projectDb`
UPDATE modules SET dirty = 'queued' WHERE id = ${moduleId}
`;
  }
  const bm1: ProjectSseUpdateMessage = {
    projectId: ppk.projectId,
    type: "module_dirty_state_and_last_run",
    ids: moduleIds,
    dirtyOrRunStatus: "queued",
    lastRun: undefined,
  };
  broadcastDirtyStates.postMessage(bm1);

  triggerRunnableModules(ppk);
}
