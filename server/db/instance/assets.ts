import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { sortAlphabeticalByFunc } from "@timroberton/panther";
import type { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  AssetInfo,
} from "lib";

type AssetMetadataRow = {
  file_name: string;
  uploader_email: string;
};

export async function getAssetsForInstance(
  mainDb: Sql,
): Promise<APIResponseWithData<AssetInfo[]>> {
  const assetDir = join(_ASSETS_DIR_PATH);
  await ensureDir(assetDir);

  const metadataRows = await mainDb<AssetMetadataRow[]>`
    SELECT file_name, uploader_email FROM asset_metadata
  `;
  const metaMap = new Map<string, string>();
  for (const row of metadataRows) {
    metaMap.set(row.file_name, row.uploader_email);
  }

  const assets: AssetInfo[] = [];
  for await (const dirEntry of Deno.readDir(assetDir)) {
    if (dirEntry.isDirectory || dirEntry.name.startsWith(".")) {
      continue;
    }
    const filePath = join(assetDir, dirEntry.name);
    const stat = await Deno.stat(filePath);
    const lowerName = dirEntry.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isXlsx =
      lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");
    const isImage =
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".gif") ||
      lowerName.endsWith(".webp");
    const isZip = lowerName.endsWith(".zip");
    assets.push({
      fileName: dirEntry.name,
      size: stat.size,
      lastModified: stat.mtime?.getTime() ?? 0,
      isDirectory: stat.isDirectory,
      isCsv,
      isXlsx,
      isImage,
      isZip,
      uploaderEmail: metaMap.get(dirEntry.name) ?? null,
    });
  }
  sortAlphabeticalByFunc(assets, (a) => a.fileName);
  return { success: true, data: assets };
}

export async function deleteAssets(
  mainDb: Sql,
  assetFileNames: string[],
  userEmail: string,
  isAdmin: boolean,
): Promise<APIResponseNoData> {
  if (assetFileNames.length === 0) {
    return { success: true };
  }

  if (!isAdmin) {
    const metadataRows = await mainDb<AssetMetadataRow[]>`
      SELECT file_name, uploader_email FROM asset_metadata
      WHERE file_name = ANY(${assetFileNames})
    `;
    const metaMap = new Map<string, string>();
    for (const row of metadataRows) {
      metaMap.set(row.file_name, row.uploader_email);
    }
    for (const fileName of assetFileNames) {
      const uploaderEmail = metaMap.get(fileName);
      if (uploaderEmail === undefined || uploaderEmail !== userEmail) {
        return {
          success: false,
          err: `You do not have permission to delete "${fileName}"`,
        };
      }
    }
  }

  for (const assetFileName of assetFileNames) {
    const assetFilePath = join(_ASSETS_DIR_PATH, assetFileName);
    try {
      await Deno.remove(assetFilePath);
    } catch {
      // File might not exist
    }
  }

  await mainDb`
    DELETE FROM asset_metadata WHERE file_name = ANY(${assetFileNames})
  `;

  return { success: true };
}

export async function createAssetMetadata(
  mainDb: Sql,
  fileName: string,
  uploaderEmail: string,
): Promise<void> {
  await mainDb`
    INSERT INTO asset_metadata (file_name, uploader_email)
    VALUES (${fileName}, ${uploaderEmail})
    ON CONFLICT (file_name) DO UPDATE
      SET uploader_email = EXCLUDED.uploader_email
  `;
}
