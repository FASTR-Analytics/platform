import { DirtyOrRunStatus, ProjectSseUpdateMessage } from "lib";

const broadcastDirtyStates = new BroadcastChannel("dirty_states");

const RUNNING_MODULES_ALL_PROJECTS = new Map<string, Map<string, Worker>>();

export function addRunningModule(
  projectId: string,
  moduleId: string,
  worker: Worker
) {
  const rt = getRunningModulesForProject(projectId);
  if (rt.size === 0) {
    const bm: ProjectSseUpdateMessage = {
      projectId,
      type: "any_running",
      anyRunning: true,
    };
    broadcastDirtyStates.postMessage(bm);
  }
  rt.set(moduleId, worker);
}

export function getRunningModuleOrUndefined(
  projectId: string,
  moduleId: string
) {
  return RUNNING_MODULES_ALL_PROJECTS.get(projectId)?.get(moduleId);
}

export function hasRunningModule(projectId: string, moduleId: string) {
  return RUNNING_MODULES_ALL_PROJECTS.get(projectId)?.has(moduleId);
}

export function getAnyRunningModules(projectId: string): boolean {
  return (RUNNING_MODULES_ALL_PROJECTS.get(projectId)?.size ?? 0) > 0;
}

export function removeRunningModule(projectId: string, moduleId: string) {
  const rt = getRunningModulesForProject(projectId);
  const prevSize = rt.size;
  const worker = rt.get(moduleId);
  if (worker) {
    worker.terminate();
  }
  rt.delete(moduleId);
  const currentSize = rt.size;
  if (prevSize > 0 && currentSize === 0) {
    setTimeout(() => {
      if (rt.size > 0) {
        return;
      }
      const bm: ProjectSseUpdateMessage = {
        projectId,
        type: "any_running",
        anyRunning: false,
      };
      broadcastDirtyStates.postMessage(bm);
    }, 200);
  }
}

function getRunningModulesForProject(projectId: string) {
  const rt = RUNNING_MODULES_ALL_PROJECTS.get(projectId);
  if (rt) {
    return rt;
  }
  const newRt = new Map<string, Worker>();
  RUNNING_MODULES_ALL_PROJECTS.set(projectId, newRt);
  return newRt;
}

export function getModuleDirtyOrRunning(
  projectId: string,
  moduleId: string,
  dirtyStatus: string
): DirtyOrRunStatus {
  if (dirtyStatus === "queued") {
    if (RUNNING_MODULES_ALL_PROJECTS.get(projectId)?.has(moduleId)) {
      return "running";
    }
    return "queued";
  }
  if (dirtyStatus === "ready") {
    return "ready";
  }
  if (dirtyStatus === "error") {
    return "error";
  }
  throw new Error("Bad dirty status for id: " + moduleId);
}
