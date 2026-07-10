import { join } from "@std/path";
import { _RUNS_DIR_PATH } from "../exposed_env_vars.ts";

// Run directory layout (PLAN_RESULTS_RUNS §2.1). Writers build inside the
// .tmp dir and atomically rename to the final dir — a crashed generation
// leaves no readable run. Helpers below take the run dir (not the id) so the
// same code writes into either.

export function runDirPath(runId: string): string {
  return join(_RUNS_DIR_PATH, runId);
}

export function runTmpDirPath(runId: string): string {
  return join(_RUNS_DIR_PATH, `.tmp-${runId}`);
}

export function runManifestPath(runDir: string): string {
  return join(runDir, "manifest.json");
}

export function runQueryParquetPath(runDir: string, resultsObjectId: string): string {
  return join(runDir, "query", `${resultsObjectId}.parquet`);
}

export function runInputFilePath(runDir: string, fileName: string): string {
  return join(runDir, "inputs", fileName);
}

export async function sweepAbandonedTmpRunDirs(): Promise<void> {
  for await (const entry of Deno.readDir(_RUNS_DIR_PATH)) {
    if (entry.isDirectory && entry.name.startsWith(".tmp-")) {
      console.log(`[runs] sweeping abandoned run dir: ${entry.name}`);
      await Deno.remove(join(_RUNS_DIR_PATH, entry.name), { recursive: true });
    }
  }
}
