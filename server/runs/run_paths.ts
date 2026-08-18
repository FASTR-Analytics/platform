import { join } from "@std/path";
import { _RUNS_DIR_PATH } from "../exposed_env_vars.ts";

// Immutable run-directory layout (PLAN_RESULTS_RUNS §2.1): manifest.json +
// inputs/ + outputs/{moduleId}/ with each results object's normalized query
// parquet beside its raw CSV. Writers build inside runs/.tmp-{runId} and
// atomically rename to runs/{runId} — a crashed generation leaves no readable
// run, and immutability is enforced by construction.

// The path-safety guard for a CALLER-supplied run id (URL params — the
// package_internals reads and the run-lens read context). A run id is a
// UUID; anything else must never reach a path under the runs volume.
const RUN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRunIdShape(runId: string): boolean {
  return RUN_ID_RE.test(runId);
}

export function runDirPath(runId: string): string {
  return join(_RUNS_DIR_PATH, runId);
}

export function runTmpDirPath(runId: string): string {
  return join(_RUNS_DIR_PATH, `.tmp-${runId}`);
}

export function runManifestPath(runDir: string): string {
  return join(runDir, "manifest.json");
}

export function runInputFilePath(runDir: string, fileName: string): string {
  return join(runDir, "inputs", fileName);
}

export function runResultsObjectParquetPath(
  runDir: string,
  moduleId: string,
  resultsObjectId: string,
): string {
  return join(runDir, "outputs", moduleId, `${resultsObjectId}.parquet`);
}

// A handled generation failure PUBLISHES the partial workspace — the same
// atomic rename finalize uses — so the module scripts and logs stay
// inspectable through the existing viewers (Tim's ruling 2026-08-03). No
// manifest is ever written into a failed dir, so it can never be read as a
// package; the catalog row (status + errorDetail) is the error record, and
// the ready-only gates (attach, reuse) never see it. Reclaimed by the same
// guarded hard delete as any package — there is no GC yet. The fallback
// removal keeps the no-debris behavior when the rename cannot happen (tmp
// already gone, or finalize had already renamed before the failure).
export async function publishFailedRunDirOrSweep(runId: string): Promise<void> {
  try {
    await Deno.rename(runTmpDirPath(runId), runDirPath(runId));
  } catch {
    await Deno.remove(runTmpDirPath(runId), { recursive: true })
      .catch(() => {});
  }
}

export async function sweepAbandonedTmpRunDirs(): Promise<void> {
  for await (const entry of Deno.readDir(_RUNS_DIR_PATH)) {
    if (entry.isDirectory && entry.name.startsWith(".tmp-")) {
      console.log(`[runs] sweeping abandoned run dir: ${entry.name}`);
      await Deno.remove(join(_RUNS_DIR_PATH, entry.name), { recursive: true });
    }
  }
}
