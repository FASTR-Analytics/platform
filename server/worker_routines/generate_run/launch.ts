import type { Sql } from "postgres";
import {
  RUN_MANIFEST_SCHEMA_VERSION,
  type APIResponseWithData,
  type RunProgress,
  type RunSummary,
} from "lib";
import { _IS_PRODUCTION } from "../../exposed_env_vars.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import {
  createGeneratingRun,
  deleteRunGenerationAttempt,
  getGeneratingRunIdForProject,
  getRunGenerationAttempt,
  markRunGenerationFailed,
} from "../../db/instance/run_generation.ts";
import { runTmpDirPath } from "../../runs/mod.ts";
import { notifyProjectRunProgress } from "../../task_management/notify_project_v2.ts";
import { getGenerateRunContainerName } from "./container_name.ts";
import { instantiateGenerateRunWorker } from "./instantiate_worker.ts";
import {
  RUN_GENERATION_ENDED_CHANNEL,
  type GenerateRunEndedData,
} from "./types.ts";

// Host side of the run pipeline (PLAN_RESULTS_RUNS item 2): launch consumes
// the configuring attempt, mints the 'generating' catalog row, and spawns
// the worker; the run owns its whole lifecycle from here. Concurrency
// ruling: cross-project generations run concurrently, ONE generating run per
// project — claimed in the same synchronous segment as the check
// (run_module's claim pattern), with the catalog as the cross-restart
// backstop. The host owns teardown: workers never self-close, and a crashed
// worker's containers are removed by deterministic name.

type GeneratingEntry = {
  runId: string;
  moduleIds: string[];
  worker: Worker | null;
};

const GENERATING_BY_PROJECT = new Map<string, GeneratingEntry>();

const broadcastEnded = new BroadcastChannel(RUN_GENERATION_ENDED_CHANNEL);
broadcastEnded.addEventListener("message", (evt) => {
  const data = (evt as MessageEvent).data as GenerateRunEndedData;
  const entry = GENERATING_BY_PROJECT.get(data.projectId);
  if (entry === undefined || entry.runId !== data.runId) {
    // Stale completion from a superseded generation.
    return;
  }
  entry.worker?.terminate();
  GENERATING_BY_PROJECT.delete(data.projectId);
});

export async function launchRunGenerationForProject(
  mainDb: Sql,
  projectId: string,
  label: string,
  createdBy: string,
): Promise<APIResponseWithData<{ runId: string }>> {
  const alreadyGenerating = {
    success: false as const,
    err: "A results package is already being generated for this project",
  };
  // Checked before the attempt read: launch deletes the attempt, so a
  // duplicate launch would otherwise surface as the misleading "no
  // configuration in progress".
  if (GENERATING_BY_PROJECT.has(projectId)) {
    return alreadyGenerating;
  }
  const resAttempt = await getRunGenerationAttempt(mainDb, projectId);
  if (resAttempt.success === false) {
    return resAttempt;
  }
  const attempt = resAttempt.data;
  if (attempt.step1Result === null || attempt.step2Result === null) {
    return {
      success: false,
      err: "The results-package configuration is not complete",
    };
  }

  if (GENERATING_BY_PROJECT.has(projectId)) {
    return alreadyGenerating;
  }
  // Claim the slot in the same synchronous segment as the check above, so
  // concurrent launch requests cannot both start a generation.
  const runId = crypto.randomUUID();
  const moduleIds = attempt.step2Result.modules.map((m) => m.moduleId);
  GENERATING_BY_PROJECT.set(projectId, { runId, moduleIds, worker: null });
  try {
    const dbGeneratingRunId = await getGeneratingRunIdForProject(
      mainDb,
      projectId,
    );
    if (dbGeneratingRunId !== undefined) {
      GENERATING_BY_PROJECT.delete(projectId);
      return alreadyGenerating;
    }

    const progress: RunProgress = {
      moduleOrder: moduleIds,
      moduleStatus: Object.fromEntries(
        moduleIds.map((id) => [id, "pending" as const]),
      ),
      currentModuleId: null,
      errorDetail: null,
    };
    const summary: RunSummary = {
      manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
      provenance: "wizard",
      sourceProjectId: projectId,
      moduleIds,
      metricCount: 0,
      totalRowCount: 0,
    };
    await createGeneratingRun(mainDb, {
      runId,
      label,
      createdBy,
      summary,
      progress,
    });
    const resDelete = await deleteRunGenerationAttempt(mainDb, projectId);
    if (resDelete.success === false) {
      throw new Error(resDelete.err);
    }

    const worker = instantiateGenerateRunWorker({
      projectId,
      runId,
      label,
      step1Result: attempt.step1Result,
      step2Result: attempt.step2Result,
    });
    worker.addEventListener("error", (e) => {
      e.preventDefault(); // Never let a worker error crash the server
      handleGenerateRunWorkerCrash(projectId, runId, moduleIds).catch(
        (error) => {
          console.error("Error handling generate-run worker crash:", error);
        },
      );
    });
    const entry = GENERATING_BY_PROJECT.get(projectId);
    if (entry === undefined || entry.runId !== runId) {
      // Superseded between claim and spawn — cannot happen while the claim
      // above holds, but mirror the run_module attach guard anyway.
      worker.terminate();
      return alreadyGenerating;
    }
    entry.worker = worker;
    notifyProjectRunProgress(projectId, runId, progress);
    return { success: true, data: { runId } };
  } catch (e) {
    GENERATING_BY_PROJECT.delete(projectId);
    await markRunGenerationFailed(
      mainDb,
      runId,
      e instanceof Error ? e.message : String(e),
    ).catch(() => null);
    return {
      success: false,
      err: "Problem launching results-package generation: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// A crashed worker cannot clean up after itself: mark the run failed, sweep
// its tmp dir, and remove any containers it may have started — terminating
// the worker only kills the `docker run` CLI client, never the container.
async function handleGenerateRunWorkerCrash(
  projectId: string,
  runId: string,
  moduleIds: string[],
): Promise<void> {
  const entry = GENERATING_BY_PROJECT.get(projectId);
  if (entry === undefined || entry.runId !== runId) {
    return;
  }
  entry.worker?.terminate();
  GENERATING_BY_PROJECT.delete(projectId);
  if (_IS_PRODUCTION) {
    for (const moduleId of moduleIds) {
      new Deno.Command("docker", {
        args: ["rm", "-f", getGenerateRunContainerName(runId, moduleId)],
        stdout: "null",
        stderr: "null",
      })
        .output()
        .catch((error) => {
          console.error("Failed to remove generate-run container:", error);
        });
    }
  }
  await Deno.remove(runTmpDirPath(runId), { recursive: true }).catch(() => {});
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const progress = await markRunGenerationFailed(
    mainDb,
    runId,
    "The generation worker crashed",
  );
  if (progress !== null) {
    notifyProjectRunProgress(projectId, runId, progress);
  }
}
