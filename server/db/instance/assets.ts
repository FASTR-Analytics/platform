import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { sortAlphabeticalByFunc } from "@timroberton/panther";
import {
  APIResponseNoData,
  APIResponseWithData,
  AssetInfo,
} from "lib";

export async function getAssetsForInstance(): Promise<
  APIResponseWithData<AssetInfo[]>
> {
  const assetDir = join(_ASSETS_DIR_PATH);
  await ensureDir(assetDir);
  const assets: AssetInfo[] = [];
  for await (const dirEntry of Deno.readDir(assetDir)) {
    if (dirEntry.isDirectory) {
      continue;
    }
    const filePath = join(assetDir, dirEntry.name);
    const stat = await Deno.stat(filePath);
    const lowerName = dirEntry.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isImage =
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".gif") ||
      lowerName.endsWith(".webp");
    assets.push({
      fileName: dirEntry.name,
      size: stat.size,
      lastModified: stat.mtime?.getTime() ?? 0,
      isDirectory: stat.isDirectory,
      isCsv,
      isImage,
    });
  }
  sortAlphabeticalByFunc(assets, (a) => a.fileName);
  return { success: true, data: assets };
}

export async function deleteAssets(
  assetFileNames: string[]
): Promise<APIResponseNoData> {
  if (assetFileNames.length === 0) {
    return { success: true };
  }

  for (const assetFileName of assetFileNames) {
    const assetFilePath = join(_ASSETS_DIR_PATH, assetFileName);
    try {
      await Deno.remove(assetFilePath);
    } catch {
      // Ignore errors (file might not exist)
    }
  }
  return { success: true };
}
