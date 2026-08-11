import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { sortAlphabeticalByFunc } from "@timroberton/panther";
import type { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  AssetFilePin,
  AssetInfo,
} from "lib";

type AssetMetadataRow = {
  file_name: string;
  uploader_email: string;
};

// Read-side twin of upload.ts's sanitizeUploadFilename: stored asset names are
// always bare basenames, so a separator or ".." in a client-supplied name is a
// path-traversal attempt, not a real asset. Every join of a client-supplied
// name onto _ASSETS_DIR_PATH must go through here.
export function resolveAssetFilePath(assetFileName: string): string {
  const normalized = assetFileName.replaceAll("\\", "/");
  if (
    normalized === "" ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/")
  ) {
    throw new Error(`Invalid asset file name: ${assetFileName}`);
  }
  return join(_ASSETS_DIR_PATH, assetFileName);
}

// The one resolution path for import-wizard file reads. Stateless wizard
// reads pass expectedPin null (they always want current bytes); launch
// validations pass null and store the returned pin on the run config;
// deferred reads (spawn sites) pass the stored pin, so an
// overwrite-after-launch fails loudly instead of silently swapping the bytes.
// The two canonical error messages live here and nowhere else.
export async function resolveAssetFileOrThrow(
  fileName: string,
  expectedPin: AssetFilePin | null,
): Promise<{ filePath: string; pin: AssetFilePin }> {
  let filePath: string;
  let stat: Deno.FileInfo;
  try {
    filePath = resolveAssetFilePath(fileName);
    stat = await Deno.stat(filePath);
    if (!stat.isFile) {
      throw new Error("Not a file");
    }
  } catch {
    throw new Error(
      "The file is no longer in assets. Upload or select it again and relaunch.",
    );
  }
  const pin: AssetFilePin = {
    size: stat.size,
    mtimeMs: stat.mtime?.getTime() ?? 0,
  };
  if (
    expectedPin &&
    (expectedPin.size !== pin.size || expectedPin.mtimeMs !== pin.mtimeMs)
  ) {
    throw new Error(
      "The file has changed since this run was launched. Start the import again.",
    );
  }
  return { filePath, pin };
}

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
    let assetFilePath: string;
    try {
      assetFilePath = resolveAssetFilePath(assetFileName);
    } catch {
      continue;
    }
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
