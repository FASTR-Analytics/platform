import { DirtyOrRunStatus } from "lib";
import { _IS_PRODUCTION } from "../exposed_env_vars.ts";
import { getModuleRunContainerName } from "../worker_routines/run_module/container_name.ts";
import { notifyProjectAnyRunning } from "./notify_project_v2.ts";

export type RunningModuleEntry = {
  // null while the slot is claimed but the worker not yet spawned
  worker: Worker | null;
  runToken: string;
};

const RUNNING_MODULES_ALL_PROJECTS = new Map<
  string,
  Map<string, RunningModuleEntry>
>();

// Tracks projects we have notified anyRunning=true for, so claim/release
// cycles that never attach a worker produce no SSE noise.
const NOTIFIED_RUNNING = new Set<string>();

// Claim the slot for a run. Must be called in the same synchronous segment as
// the hasRunningModule check (no await between them), so concurrent trigger
// invocations cannot both start the same module.
export function claimRunningModule(
  projectId: string,
  moduleId: string,
  runToken: string,
) {
  getRunningModulesForProject(projectId).set(moduleId, {
    worker: null,
    runToken,
  });
}

export function releaseClaimedModule(
  projectId: string,
  moduleId: string,
  runToken: string,
) {
  const rt = getRunningModulesForProject(projectId);
  const entry = rt.get(moduleId);
  if (entry && entry.runToken === runToken && entry.worker === null) {
    rt.delete(moduleId);
  }
  maybeNotifyStopped(projectId, rt);
}

// Returns false if the claim was superseded between claim and spawn (the
// spawned worker is terminated in that case).
export function attachRunningModuleWorker(
  projectId: string,
  moduleId: string,
  runToken: string,
  worker: Worker,
): boolean {
  const rt = getRunningModulesForProject(projectId);
  const entry = rt.get(moduleId);
  if (entry === undefined || entry.runToken !== runToken) {
    worker.terminate();
    killModuleRunContainer(moduleId, runToken);
    return false;
  }
  entry.worker = worker;
  if (!NOTIFIED_RUNNING.has(projectId)) {
    NOTIFIED_RUNNING.add(projectId);
    notifyProjectAnyRunning(projectId, true);
  }
  return true;
}

export function getRunningModuleEntry(
  projectId: string,
  moduleId: string,
): RunningModuleEntry | undefined {
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
  const entry = rt.get(moduleId);
  if (entry?.worker) {
    entry.worker.terminate();
    // Terminating the worker only kills the `docker run` CLI client — the
    // container itself is owned by the daemon and keeps executing (and keeps
    // writing into the module's sandbox dir, corrupting a respawned run).
    killModuleRunContainer(moduleId, entry.runToken);
  }
  rt.delete(moduleId);
  maybeNotifyStopped(projectId, rt);
}

function killModuleRunContainer(moduleId: string, runToken: string) {
  if (!_IS_PRODUCTION) {
    return;
  }
  const name = getModuleRunContainerName(moduleId, runToken);
  new Deno.Command("docker", {
    args: ["rm", "-f", name],
    stdout: "null",
    stderr: "null",
  })
    .output()
    .catch((error) => {
      console.error("Failed to remove module run container:", error);
    });
}

function maybeNotifyStopped(
  projectId: string,
  rt: Map<string, RunningModuleEntry>,
) {
  if (rt.size > 0 || !NOTIFIED_RUNNING.has(projectId)) {
    return;
  }
  setTimeout(() => {
    if (rt.size > 0 || !NOTIFIED_RUNNING.has(projectId)) {
      return;
    }
    NOTIFIED_RUNNING.delete(projectId);
    notifyProjectAnyRunning(projectId, false);
  }, 200);
}

function getRunningModulesForProject(projectId: string) {
  const rt = RUNNING_MODULES_ALL_PROJECTS.get(projectId);
  if (rt) {
    return rt;
  }
  const newRt = new Map<string, RunningModuleEntry>();
  RUNNING_MODULES_ALL_PROJECTS.set(projectId, newRt);
  return newRt;
}

export function getModuleDirtyOrRunning(
  projectId: string,
  moduleId: string,
  dirtyStatus: string,
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
