import type { Sql } from "postgres";
import {
  MODULE_REGISTRY,
  RUN_MANIFEST_SCHEMA_VERSION,
  type APIResponseWithData,
  type RunGenerationStep1Result,
  type RunGenerationStep2Result,
  type RunProgress,
  type RunSummary,
} from "lib";
import { _IS_PRODUCTION } from "../../exposed_env_vars.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import {
  createGeneratingRun,
  markRunGenerationFailed,
} from "../../db/instance/run_generation.ts";
import { publishFailedRunDirOrSweep } from "../../runs/mod.ts";
import {
  notifyInstanceRunProgress,
  notifyInstanceRunsCatalogUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { checkSpaceForDataset } from "../../utils/disk_space.ts";
import { getGenerateRunContainerName } from "./container_name.ts";
import { instantiateGenerateRunWorker } from "./instantiate_worker.ts";
import {
  RUN_GENERATION_ENDED_CHANNEL,
  type GenerateRunEndedData,
} from "./types.ts";

// Host side of the run pipeline (PLAN_RESULTS_RUNS item 2): launch takes the
// wizard's configuration in the request body (the wizard is an ephemeral
// modal — nothing is persisted before this call), validates it, mints the
// 'generating' catalog row, and spawns the worker; the run owns its whole
// lifecycle from here.
// Concurrency: generations run concurrently, full stop. The launch guard
// that refused overlapping ATTACH TARGETS died with them (D5 — a generation
// repoints nothing, so two generations cannot collide over a product). The
// registry below survives for teardown alone: the host owns it, workers never
// self-close, and a crashed worker's containers are removed by deterministic
// name.

type GeneratingEntry = {
  moduleIds: string[];
  worker: Worker | null;
};

const GENERATING_BY_RUN = new Map<string, GeneratingEntry>();

const broadcastEnded = new BroadcastChannel(RUN_GENERATION_ENDED_CHANNEL);
broadcastEnded.addEventListener("message", (evt) => {
  const data = (evt as MessageEvent).data as GenerateRunEndedData;
  const entry = GENERATING_BY_RUN.get(data.runId);
  if (entry === undefined) {
    // Stale completion from a superseded generation.
    return;
  }
  entry.worker?.terminate();
  GENERATING_BY_RUN.delete(data.runId);
});

export type RunGenerationLaunchInput = {
  label: string;
  step1Result: RunGenerationStep1Result;
  step2Result: RunGenerationStep2Result;
};

function getLaunchInputInvalidMsg(
  input: RunGenerationLaunchInput,
): string | undefined {
  const { step1Result, step2Result } = input;
  if (!step1Result.hmis && !step1Result.hfa && !step1Result.iceh) {
    return "Select at least one data family for the results package";
  }
  if (step2Result.modules.length === 0) {
    return "Select at least one module for the results package";
  }
  const moduleIds = new Set(step2Result.modules.map((m) => m.moduleId));
  if (moduleIds.size !== step2Result.modules.length) {
    return "Duplicate module in selection";
  }
  for (const moduleId of moduleIds) {
    const entry = MODULE_REGISTRY.find((m) => m.id === moduleId);
    if (entry === undefined) {
      return `Unknown module: ${moduleId}`;
    }
    for (const prerequisite of entry.prerequisites) {
      if (!moduleIds.has(prerequisite)) {
        return `Module ${moduleId} requires ${prerequisite}, which is not in the selection`;
      }
    }
  }
  return undefined;
}

export async function launchRunGeneration(
  mainDb: Sql,
  input: RunGenerationLaunchInput,
  createdBy: string,
): Promise<APIResponseWithData<{ runId: string }>> {
  const { label, step1Result, step2Result } = input;
  const invalidMsg = getLaunchInputInvalidMsg(input);
  if (invalidMsg !== undefined) {
    return { success: false, err: invalidMsg };
  }

  // Disk guard for the dataset extracts the prepare stage is about to export.
  const selectedFamilies: string[] = [
    ...(step1Result.hmis ? ["hmis"] : []),
    ...(step1Result.hfa ? ["hfa"] : []),
    ...(step1Result.iceh ? ["iceh"] : []),
  ];
  for (const family of selectedFamilies) {
    const spaceCheck = await checkSpaceForDataset(mainDb, family);
    if (!spaceCheck.ok) {
      return {
        success: false,
        err: spaceCheck.resizeTriggered
          ? `Not enough disk space to generate this results package (requires ~${spaceCheck.requiredGB} GB, ${spaceCheck.availableGB} GB available). A volume resize has been triggered — please try again in a few minutes.`
          : `Not enough disk space to generate this results package (requires ~${spaceCheck.requiredGB} GB, ${spaceCheck.availableGB} GB available). Please contact your administrator.`,
      };
    }
  }

  // Registered before the worker is spawned so the crash handler can always
  // find its module list (the container names it must remove).
  const runId = crypto.randomUUID();
  const moduleIds = step2Result.modules.map((m) => m.moduleId);
  GENERATING_BY_RUN.set(runId, { moduleIds, worker: null });
  try {
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
      moduleIds,
      metricCount: 0,
      totalRowCount: 0,
      diskSizeBytes: null,
    };
    await createGeneratingRun(mainDb, {
      runId,
      label,
      createdBy,
      summary,
      progress,
    });
    const worker = instantiateGenerateRunWorker({
      runId,
      label,
      step1Result,
      step2Result,
    });
    worker.addEventListener("error", (e) => {
      e.preventDefault(); // Never let a worker error crash the server
      handleGenerateRunWorkerCrash(runId).catch((error) => {
        console.error("Error handling generate-run worker crash:", error);
      });
    });
    const entry = GENERATING_BY_RUN.get(runId);
    if (entry === undefined) {
      // The run ENDED before its worker handle was stored (an instant
      // failure broadcast on RUN_GENERATION_ENDED_CHANNEL): the entry is
      // already gone, so terminate here or the worker leaks.
      worker.terminate();
      return { success: false, err: "The generation ended before it started" };
    }
    entry.worker = worker;
    notifyInstanceRunProgress(runId, progress);
    return { success: true, data: { runId } };
  } catch (e) {
    GENERATING_BY_RUN.delete(runId);
    await markRunGenerationFailed(
      mainDb,
      runId,
      e instanceof Error ? e.message : String(e),
    ).catch(() => null);
    // The row may already exist (created then marked failed above), and the
    // route's notify is success-gated — signal here so the failed row is not
    // invisible until reconnect. Harmless when the throw predates the row.
    notifyInstanceRunsCatalogUpdated();
    return {
      success: false,
      err: "Problem launching results-package generation: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// A crashed worker cannot clean up after itself: mark the run failed,
// publish its partial workspace for inspection, and remove any containers it
// may have started — terminating the worker only kills the `docker run` CLI
// client, never the container.
async function handleGenerateRunWorkerCrash(runId: string): Promise<void> {
  const entry = GENERATING_BY_RUN.get(runId);
  if (entry === undefined) {
    return;
  }
  entry.worker?.terminate();
  GENERATING_BY_RUN.delete(runId);
  if (_IS_PRODUCTION) {
    for (const moduleId of entry.moduleIds) {
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
  await publishFailedRunDirOrSweep(runId);
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const progress = await markRunGenerationFailed(
    mainDb,
    runId,
    "The generation worker crashed",
  );
  // A crash bypasses the worker's own finalize-or-fail notify site — the row
  // just flipped generating→failed, so the T1 listing must move here too.
  notifyInstanceRunsCatalogUpdated();
  if (progress !== null) {
    notifyInstanceRunProgress(runId, progress);
  }
}
