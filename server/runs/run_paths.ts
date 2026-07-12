import { join } from "@std/path";
import { _RUNS_DIR_PATH } from "../exposed_env_vars.ts";

// Immutable run-directory layout (PLAN_RESULTS_RUNS §2.1): manifest.json +
// inputs/ + outputs/{moduleId}/ with each results object's normalized query
// parquet beside its raw CSV. Writers build inside runs/.tmp-{runId} and
// atomically rename to runs/{runId} — a crashed generation leaves no readable
// run, and immutability is enforced by construction.

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

export async function sweepAbandonedTmpRunDirs(): Promise<void> {
  for await (const entry of Deno.readDir(_RUNS_DIR_PATH)) {
    if (entry.isDirectory && entry.name.startsWith(".tmp-")) {
      console.log(`[runs] sweeping abandoned run dir: ${entry.name}`);
      await Deno.remove(join(_RUNS_DIR_PATH, entry.name), { recursive: true });
    }
  }
}
