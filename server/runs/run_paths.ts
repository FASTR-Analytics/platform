import { join } from "@std/path";
import { _SANDBOX_DIR_PATH } from "../exposed_env_vars.ts";

// Deploy-1 package layout (PLAN_RESULTS_RUNS Status "Deploy 1"): the results
// package IS the project sandbox — manifest.json + inputs/ beside the module
// workspaces, and each results object's normalized query parquet beside its
// raw CSV ({moduleId}/{roId}.parquet, the ingest shadow-write location).
// Deploy 2 re-points these helpers to immutable runs/{runId} directories.

export function packageDirPath(projectId: string): string {
  return join(_SANDBOX_DIR_PATH, projectId);
}

export function packageManifestPath(packageDir: string): string {
  return join(packageDir, "manifest.json");
}

export function packageInputFilePath(
  packageDir: string,
  fileName: string,
): string {
  return join(packageDir, "inputs", fileName);
}

export function packageResultsObjectCsvPath(
  packageDir: string,
  moduleId: string,
  resultsObjectId: string,
): string {
  return join(packageDir, moduleId, resultsObjectId);
}

export function packageResultsObjectParquetPath(
  packageDir: string,
  moduleId: string,
  resultsObjectId: string,
): string {
  return join(packageDir, moduleId, `${resultsObjectId}.parquet`);
}
