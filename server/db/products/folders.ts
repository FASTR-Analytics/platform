import { Sql } from "postgres";
import { type APIResponseWithData, type Folder } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { type DBFolder } from "../instance/_main_database_types.ts";

// Folders nest via `parent_id` (adjacency list — D9). The acyclic invariant is
// enforced HERE, inside the move transaction (D10); delete reparents one level
// and never cascades (D11).

/** Typed refusal for an illegal move (D10) — returned through the envelope,
 *  never thrown, mirroring NO_READY_PINNED_PACKAGE in products.ts. */
export const FOLDER_CYCLE =
  "A folder cannot be moved into itself or into one of its own subfolders";

function rowToFolder(row: DBFolder): Folder {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    parentId: row.parent_id,
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
  parentId: string | null,
): Promise<APIResponseWithData<{ folderId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const folderId = crypto.randomUUID();
    const lastUpdated = new Date().toISOString();
    await mainDb`
      INSERT INTO folders (id, label, color, parent_id, last_updated)
      VALUES (${folderId}, ${label.trim()}, ${color}, ${parentId}, ${lastUpdated})
    `;
    return { success: true, data: { folderId, lastUpdated } };
  });
}

// Also THE move: label, colour and parent are one metadata write. The cycle
// guard walks UP from the target parent inside the same transaction as the
// UPDATE; a rename or a move to the root cannot create a cycle, so the guard
// is skipped when the parent is unchanged or null.
export async function updateFolder(
  mainDb: Sql,
  folderId: string,
  label: string,
  color: string | null,
  parentId: string | null,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const illegal = await mainDb.begin(async (sql) => {
      if (parentId !== null) {
        const [current] = await sql<{ parent_id: string | null }[]>`
          SELECT parent_id FROM folders WHERE id = ${folderId}
        `;
        if (current === undefined || current.parent_id !== parentId) {
          if (parentId === folderId) return true;
          const hits = await sql`
            WITH RECURSIVE ancestors AS (
              SELECT id, parent_id FROM folders WHERE id = ${parentId}
              UNION ALL
              SELECT f.id, f.parent_id
              FROM folders f JOIN ancestors a ON f.id = a.parent_id
            )
            SELECT 1 FROM ancestors WHERE id = ${folderId}
          `;
          if (hits.length > 0) return true;
        }
      }
      await sql`
        UPDATE folders
        SET label = ${label.trim()}, color = ${color},
            parent_id = ${parentId}, last_updated = ${lastUpdated}
        WHERE id = ${folderId}
      `;
      return false;
    });
    if (illegal) {
      return { success: false, err: FOLDER_CYCLE };
    }
    return { success: true, data: { lastUpdated } };
  });
}

// Delete reparents one level, never cascades (D11): child folders and products
// move up to the deleted folder's parent (the root if it had none). The FK's
// ON DELETE SET NULL is a backstop only — the explicit reparent runs first, so
// it never fires. The freed product ids come back so the caller can emit
// products_upserted for them (their rows changed, so they need a version bump).
export async function deleteFolder(
  mainDb: Sql,
  folderId: string,
): Promise<
  APIResponseWithData<{ freedProductIds: string[]; lastUpdated: string }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const freedProductIds = await mainDb.begin(async (sql) => {
      const [row] = await sql<{ parent_id: string | null }[]>`
        SELECT parent_id FROM folders WHERE id = ${folderId}
      `;
      const newParent = row?.parent_id ?? null;
      await sql`
        UPDATE folders SET parent_id = ${newParent}
        WHERE parent_id = ${folderId}
      `;
      const freed = await sql<{ id: string }[]>`
        UPDATE products
        SET folder_id = ${newParent}, last_updated = ${lastUpdated}
        WHERE folder_id = ${folderId}
        RETURNING id
      `;
      await sql`DELETE FROM folders WHERE id = ${folderId}`;
      return freed.map((r) => r.id);
    });
    return { success: true, data: { freedProductIds, lastUpdated } };
  });
}
