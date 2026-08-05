import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { Sql } from "postgres";
import { _ASSETS_DIR_PATH } from "./exposed_env_vars.ts";

// Wizard-temp uploads (PLAN_DHIS2_IMPORTER_CONSOLIDATION A3): the only
// pre-launch server artifact of an import wizard. Files land at
// .import-uploads/{uploadToken}__{sanitizedFileName} via the TUS front door's
// wizard-temp mode (server/routes/instance/upload.ts) with NO asset-metadata
// row. The token in the filename is the durable key — a restart loses
// nothing. Workers delete the file on complete/discard via finalize; the boot
// sweep below catches abandoned wizards.

export const IMPORT_TEMP_UPLOADS_DIR = join(_ASSETS_DIR_PATH, ".import-uploads");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUploadToken(token: string): boolean {
  return UUID_RE.test(token);
}

export async function storeImportTempUpload(
  tmpFilePath: string,
  uploadToken: string,
  sanitizedFileName: string,
): Promise<void> {
  if (!isValidUploadToken(uploadToken)) {
    throw new Error(`Invalid upload token: ${uploadToken}`);
  }
  await ensureDir(IMPORT_TEMP_UPLOADS_DIR);
  await Deno.rename(
    tmpFilePath,
    join(IMPORT_TEMP_UPLOADS_DIR, `${uploadToken}__${sanitizedFileName}`),
  );
}

// The file path for a token, or null when no upload exists for it.
export async function resolveImportTempUpload(
  uploadToken: string,
): Promise<{ filePath: string; fileName: string } | null> {
  if (!isValidUploadToken(uploadToken)) {
    return null;
  }
  try {
    for await (const entry of Deno.readDir(IMPORT_TEMP_UPLOADS_DIR)) {
      if (entry.isFile && entry.name.startsWith(`${uploadToken}__`)) {
        return {
          filePath: join(IMPORT_TEMP_UPLOADS_DIR, entry.name),
          fileName: entry.name.slice(uploadToken.length + 2),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function deleteImportTempUpload(
  uploadToken: string,
): Promise<void> {
  const found = await resolveImportTempUpload(uploadToken);
  if (found) {
    try {
      await Deno.remove(found.filePath);
    } catch {
      // Already gone.
    }
  }
}

const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Boot sweep: delete temp uploads older than 24 h whose token appears in no
// active run row (running/queued/needs_review) — abandoned wizards leave
// nothing else behind, so this is the whole cleanup story. Extended per
// family as Phases B/C land their runs tables.
export async function sweepOrphanImportTempUploads(
  mainDb: Sql,
): Promise<void> {
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const entry of Deno.readDir(IMPORT_TEMP_UPLOADS_DIR)) {
      if (entry.isFile) {
        entries.push(entry);
      }
    }
  } catch {
    return;
  }
  if (entries.length === 0) {
    return;
  }

  const activeTokens = new Set<string>();
  const rows = await mainDb<{ csv_config: string | null }[]>`
    SELECT csv_config FROM dataset_hmis_import_runs
    WHERE status IN ('running', 'queued', 'needs_review')
      AND csv_config IS NOT NULL
  `;
  for (const row of rows) {
    if (!row.csv_config) {
      continue;
    }
    try {
      const config = JSON.parse(row.csv_config) as { uploadToken?: string };
      if (config.uploadToken) {
        activeTokens.add(config.uploadToken);
      }
    } catch {
      // Unparseable config cannot reference a token.
    }
  }

  const now = Date.now();
  let swept = 0;
  for (const entry of entries) {
    const token = entry.name.split("__")[0];
    if (activeTokens.has(token)) {
      continue;
    }
    const filePath = join(IMPORT_TEMP_UPLOADS_DIR, entry.name);
    try {
      const stat = await Deno.stat(filePath);
      const mtimeMs = stat.mtime?.getTime() ?? 0;
      if (now - mtimeMs > ORPHAN_MAX_AGE_MS) {
        await Deno.remove(filePath);
        swept++;
      }
    } catch {
      // Already gone.
    }
  }
  if (swept > 0) {
    console.log(`[startup] Swept ${swept} orphaned import temp upload(s)`);
  }
}
