import { Sql } from "postgres";
import { type APIResponseWithData, type Folder } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { type DBFolder } from "../instance/_main_database_types.ts";

// Folders are the one flat organising level over `products` (D1) — no
// nesting, no per-type namespace, no manual ordering.

function rowToFolder(row: DBFolder): Folder {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    lastUpdated: row.last_updated,
  };
}

export async function listFolders(
  mainDb: Sql,
): Promise<APIResponseWithData<Folder[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBFolder[]>`
      SELECT * FROM folders ORDER BY LOWER(label)
    `;
    return { success: true, data: rows.map(rowToFolder) };
  });
}

export async function createFolder(
  mainDb: Sql,
  label: string,
  color: string | null,
): Promise<APIResponseWithData<{ folderId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const folderId = crypto.randomUUID();
    const lastUpdated = new Date().toISOString();
    await mainDb`
      INSERT INTO folders (id, label, color, last_updated)
      VALUES (${folderId}, ${label.trim()}, ${color}, ${lastUpdated})
    `;
    return { success: true, data: { folderId, lastUpdated } };
  });
}

export async function updateFolder(
  mainDb: Sql,
  folderId: string,
  label: string,
  color: string | null,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    await mainDb`
      UPDATE folders
      SET label = ${label.trim()}, color = ${color}, last_updated = ${lastUpdated}
      WHERE id = ${folderId}
    `;
    return { success: true, data: { lastUpdated } };
  });
}

// Deleting a folder frees its products rather than deleting them (the FK is
// ON DELETE SET NULL, but the freed rows still need their own version bump).
// The freed ids come back so the caller can emit products_upserted for them.
export async function deleteFolder(
  mainDb: Sql,
  folderId: string,
): Promise<
  APIResponseWithData<{ freedProductIds: string[]; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const freedProductIds = await mainDb.begin(async (sql) => {
      const freed = await sql<{ id: string }[]>`
        UPDATE products
        SET folder_id = NULL, last_updated = ${lastUpdated}
        WHERE folder_id = ${folderId}
        RETURNING id
      `;
      await sql`DELETE FROM folders WHERE id = ${folderId}`;
      return freed.map((r) => r.id);
    });
    return { success: true, data: { freedProductIds, lastUpdated } };
  });
}
