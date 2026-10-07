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
  AssetPrivacy,
  canUserManagePrivateAsset,
  canUserSeeAsset,
  type GlobalUser,
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

// Unfiltered: every asset with its privacy. Anything returned to a user goes
// through getAssetsForUser (or filterAssetsForUser) instead.
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
  const privacyMap = await getAllAssetPrivacy(mainDb);

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
      privacy: privacyMap.get(dirEntry.name) ?? null,
    });
  }
  sortAlphabeticalByFunc(assets, (a) => a.fileName);
  return { success: true, data: assets };
}

export function filterAssetsForUser(
  assets: AssetInfo[],
  email: string,
  isGlobalAdmin: boolean,
): AssetInfo[] {
  return assets.filter((a) => canUserSeeAsset(a.privacy, email, isGlobalAdmin));
}

export async function getAssetsForUser(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<APIResponseWithData<AssetInfo[]>> {
  const res = await getAssetsForInstance(mainDb);
  if (!res.success) return res;
  return {
    success: true,
    data: filterAssetsForUser(
      res.data,
      globalUser.email,
      globalUser.isGlobalAdmin,
    ),
  };
}

//////////////////////////
//                      //
//    Private assets    //
//                      //
//////////////////////////

type PrivateAssetRow = {
  file_name: string;
  owner_email: string;
  owner_is_user: boolean;
  viewer_emails: string[];
};

// owner_email deliberately has no FK to users: deleting the owner must not
// cascade the row away and silently make the file public.
async function queryAssetPrivacy(
  mainDb: Sql,
  fileNames: string[] | null,
): Promise<Map<string, AssetPrivacy>> {
  const rows = await mainDb<PrivateAssetRow[]>`
    SELECT
      pa.file_name,
      pa.owner_email,
      EXISTS (SELECT 1 FROM users u WHERE u.email = pa.owner_email) AS owner_is_user,
      COALESCE(
        (SELECT array_agg(v.email ORDER BY v.email)
         FROM private_asset_viewers v WHERE v.file_name = pa.file_name),
        '{}'
      ) AS viewer_emails
    FROM private_assets pa
    ${fileNames === null ? mainDb`` : mainDb`WHERE pa.file_name = ANY(${fileNames})`}
  `;
  const map = new Map<string, AssetPrivacy>();
  for (const row of rows) {
    map.set(row.file_name, {
      ownerEmail: row.owner_email,
      viewerEmails: row.viewer_emails,
      ownerIsUser: row.owner_is_user,
    });
  }
  return map;
}

export async function getAllAssetPrivacy(
  mainDb: Sql,
): Promise<Map<string, AssetPrivacy>> {
  return await queryAssetPrivacy(mainDb, null);
}

export async function getAssetPrivacy(
  mainDb: Sql,
  fileName: string,
): Promise<AssetPrivacy | null> {
  return (await queryAssetPrivacy(mainDb, [fileName])).get(fileName) ?? null;
}

// The static-serve gate's lookup: the privacy of whichever of these
// spellings is a private asset (they all name the same file).
export async function getAssetPrivacyForAnyName(
  mainDb: Sql,
  candidateNames: string[],
): Promise<AssetPrivacy | null> {
  const map = await queryAssetPrivacy(mainDb, candidateNames);
  for (const name of candidateNames) {
    const privacy = map.get(name);
    if (privacy) return privacy;
  }
  return null;
}

// The by-name read gate: every route that reads an asset named by the client
// calls this before touching the file, so a private asset cannot be used by
// someone who cannot see it even if they know its name. Throws the same
// "no longer in assets" message resolveAssetFileOrThrow uses, so it reveals
// nothing about whether a hidden file exists.
export async function assertAssetsVisibleToUser(
  mainDb: Sql,
  fileNames: (string | null | undefined)[],
  globalUser: GlobalUser,
): Promise<void> {
  const names = fileNames.filter((n): n is string => !!n);
  if (names.length === 0) return;
  const privacyMap = await queryAssetPrivacy(mainDb, names);
  for (const name of names) {
    const privacy = privacyMap.get(name) ?? null;
    if (!canUserSeeAsset(privacy, globalUser.email, globalUser.isGlobalAdmin)) {
      throw new Error(
        "The file is no longer in assets. Upload or select it again and relaunch.",
      );
    }
  }
}

// Same gate in envelope form for routes that return APIResponse.
export async function checkAssetsVisibleToUser(
  mainDb: Sql,
  fileNames: (string | null | undefined)[],
  globalUser: GlobalUser,
): Promise<APIResponseNoData> {
  try {
    await assertAssetsVisibleToUser(mainDb, fileNames, globalUser);
    return { success: true };
  } catch (e) {
    return { success: false, err: e instanceof Error ? e.message : String(e) };
  }
}

// Viewers must be users on this instance (FK); unknown emails and the owner
// are dropped rather than failing the whole save.
async function writeAssetPrivacy(
  sql: Sql,
  fileName: string,
  ownerEmail: string,
  viewerEmails: string[],
): Promise<void> {
  await sql`
    INSERT INTO private_assets (file_name, owner_email)
    VALUES (${fileName}, ${ownerEmail})
    ON CONFLICT (file_name) DO UPDATE SET owner_email = EXCLUDED.owner_email
  `;
  await sql`DELETE FROM private_asset_viewers WHERE file_name = ${fileName}`;
  const wanted = [...new Set(viewerEmails.map((e) => e.trim()))].filter(
    (e) => e !== "" && e !== ownerEmail,
  );
  if (wanted.length > 0) {
    await sql`
      INSERT INTO private_asset_viewers (file_name, email)
      SELECT ${fileName}, u.email FROM users u WHERE u.email = ANY(${wanted})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function clearAssetPrivacy(sql: Sql, fileName: string): Promise<void> {
  await sql`DELETE FROM private_assets WHERE file_name = ${fileName}`;
}

export type UploadVisibility =
  | { kind: "unchanged" }
  | { kind: "public" }
  | { kind: "private"; viewerEmails: string[] };

// Whether an upload of fileName by this user may land. Only a file that is
// actually on disk blocks: a privacy row left behind by a file removed some
// other way is stale and is replaced on completion.
export async function canUserUploadOverAsset(
  mainDb: Sql,
  fileName: string,
  globalUser: GlobalUser,
): Promise<boolean> {
  const privacy = await getAssetPrivacy(mainDb, fileName);
  if (privacy === null) return true;
  if (
    canUserManagePrivateAsset(privacy, globalUser.email, globalUser.isGlobalAdmin)
  ) {
    return true;
  }
  try {
    await Deno.stat(resolveAssetFilePath(fileName));
    return false;
  } catch {
    return true;
  }
}

// Called on upload completion, after the file is in place. "unchanged" keeps
// whatever the file already had (an import wizard re-uploading a private file
// keeps it private) except that a stale row owned by someone else is dropped.
export async function applyUploadVisibility(
  mainDb: Sql,
  fileName: string,
  uploaderEmail: string,
  isGlobalAdmin: boolean,
  visibility: UploadVisibility,
): Promise<void> {
  await mainDb.begin(async (sql) => {
    const existing = (await queryAssetPrivacy(sql, [fileName])).get(fileName) ??
      null;
    if (visibility.kind === "private") {
      await writeAssetPrivacy(sql, fileName, uploaderEmail, visibility.viewerEmails);
      return;
    }
    if (existing === null) return;
    const manages = canUserManagePrivateAsset(
      existing,
      uploaderEmail,
      isGlobalAdmin,
    );
    if (visibility.kind === "public" || !manages) {
      await clearAssetPrivacy(sql, fileName);
    }
  });
}

export async function updateAssetVisibility(
  mainDb: Sql,
  fileName: string,
  isPrivate: boolean,
  viewerEmails: string[],
  globalUser: GlobalUser,
): Promise<APIResponseNoData> {
  let filePath: string;
  try {
    filePath = resolveAssetFilePath(fileName);
    await Deno.stat(filePath);
  } catch {
    return { success: false, err: `"${fileName}" is no longer in assets` };
  }
  const { email, isGlobalAdmin } = globalUser;
  return await mainDb.begin(async (sql) => {
    const existing = (await queryAssetPrivacy(sql, [fileName])).get(fileName) ??
      null;
    if (existing !== null) {
      if (!canUserSeeAsset(existing, email, isGlobalAdmin)) {
        return { success: false, err: `"${fileName}" is no longer in assets` };
      }
      if (!canUserManagePrivateAsset(existing, email, isGlobalAdmin)) {
        return {
          success: false,
          err: "Only the person who uploaded this file can change who can see it",
        };
      }
    } else {
      // A public file: its uploader may make it private; a file with no
      // uploader ("system") only an admin may.
      const uploader = (
        await sql<{ uploader_email: string }[]>`
          SELECT uploader_email FROM asset_metadata WHERE file_name = ${fileName}
        `
      ).at(0)?.uploader_email;
      if (uploader !== email && !(uploader === undefined && isGlobalAdmin)) {
        return {
          success: false,
          err: "Only the person who uploaded this file can change who can see it",
        };
      }
    }
    if (!isPrivate) {
      await clearAssetPrivacy(sql, fileName);
      return { success: true as const };
    }
    // An orphaned file rescued by an admin becomes that admin's.
    const owner = existing === null || !existing.ownerIsUser
      ? email
      : existing.ownerEmail;
    await writeAssetPrivacy(sql, fileName, owner, viewerEmails);
    return { success: true as const };
  });
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

  // A private asset is deletable by its manager only; admins get no bypass.
  // One the caller cannot see answers like a missing file.
  const privacyMap = await queryAssetPrivacy(mainDb, assetFileNames);
  for (const fileName of assetFileNames) {
    const privacy = privacyMap.get(fileName);
    if (privacy === undefined) continue;
    if (!canUserSeeAsset(privacy, userEmail, isAdmin)) {
      return { success: false, err: `"${fileName}" is no longer in assets` };
    }
    if (!canUserManagePrivateAsset(privacy, userEmail, isAdmin)) {
      return {
        success: false,
        err: `You do not have permission to delete "${fileName}"`,
      };
    }
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
      if (privacyMap.has(fileName)) continue;
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
  await mainDb`
    DELETE FROM private_assets WHERE file_name = ANY(${assetFileNames})
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
