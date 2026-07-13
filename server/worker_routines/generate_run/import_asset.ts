import { join } from "@std/path";
import type { AssetToImport } from "lib";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { ensureRepoAssetCached } from "../../module_loader/repo_assets.ts";

// A declared asset the script is about to read MUST be present — a silent
// skip means the script falls back to nothing or stale data (PLAN_RESULTS_RUNS
// §6.1). Missing/unreadable assets fail the module run. Pinned repo assets
// come from the content-addressed cache (warmed at definition resolution;
// fetched here on a cache miss).
export async function importAsset(
  asset: AssetToImport,
  dirPath: string,
  moduleId: string,
): Promise<void> {
  if (typeof asset !== "string") {
    const cachePath = await ensureRepoAssetCached(moduleId, asset);
    await Deno.copyFile(cachePath, join(dirPath, asset.name));
    return;
  }
  const assetFilePathSource = join(_ASSETS_DIR_PATH, asset);
  const assetFilePathTarget = join(dirPath, asset);
  try {
    await Deno.copyFile(assetFilePathSource, assetFilePathTarget);
  } catch (e) {
    throw new Error(
      `Could not import asset "${asset}" — upload it on the instance Assets page. (${
        e instanceof Error ? e.message : e
      })`,
    );
  }
}
