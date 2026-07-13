import type { Sql } from "postgres";
import { createWorkerReadConnection } from "../../db/mod.ts";
import { markRunGenerationFailed } from "../../db/instance/run_generation.ts";
import { runTmpDirPath } from "../../runs/mod.ts";
import { notifyProjectRunProgress } from "../../task_management/notify_project_v2.ts";
import { runGenerationPipeline } from "./pipeline.ts";
import {
  RUN_GENERATION_ENDED_CHANNEL,
  type GenerateRunEndedData,
  type GenerateRunStartData,
} from "./types.ts";

const broadcastEnded = new BroadcastChannel(RUN_GENERATION_ENDED_CHANNEL);

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Generate-run worker error:", error);
    // Surfaces to the host's error listener (launch.ts), which marks the run
    // failed, kills any containers, and terminates this worker. Never
    // self.close() here — closing discards pending report-backs.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

async function run(std: GenerateRunStartData) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const mainDb = createWorkerReadConnection("main");
  const projectDb = createWorkerReadConnection(std.projectId);
  try {
    let successOrError: GenerateRunEndedData["successOrError"] = "success";
    try {
      await runGenerationPipeline(mainDb, projectDb, std);
    } catch (e) {
      successOrError = "error";
      console.error(
        `[generate_run] generation ${std.runId} failed: ${
          e instanceof Error ? e.message : e
        }`,
      );
      await failGeneration(mainDb, std, e);
    }
    const ended: GenerateRunEndedData = {
      projectId: std.projectId,
      runId: std.runId,
      successOrError,
    };
    broadcastEnded.postMessage(ended);
  } finally {
    await projectDb.end();
    await mainDb.end();
  }
}

// A failed generation never replaces the serving run: remove the tmp dir,
// mark the catalog row failed (errorDetail into progress), push the final
// progress over SSE. The attached run — if any — keeps serving untouched.
async function failGeneration(
  mainDb: Sql,
  std: GenerateRunStartData,
  e: unknown,
) {
  await Deno.remove(runTmpDirPath(std.runId), { recursive: true })
    .catch(() => {});
  const progress = await markRunGenerationFailed(
    mainDb,
    std.runId,
    e instanceof Error ? e.message : String(e),
  );
  if (progress !== null) {
    notifyProjectRunProgress(std.projectId, std.runId, progress);
  }
}
