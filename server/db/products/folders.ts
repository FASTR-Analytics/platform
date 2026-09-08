import { Sql } from "postgres";
import { type APIResponseWithData, type Folder } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { type DBFolder } from "../instance/_main_database_types.ts";

// Folders nest through parent_id (D1). The acyclic invariant is enforced
// here, inside the move transaction; delete reparents one level and never
// cascades.

/** Typed refusal for an illegal move, returned through the envelope like
 *  NO_READY_PINNED_PACKAGE. */
export const FOLDER_CYCLE =
  "A folder cannot be moved into itself or into one of its own subfolders";

function rowToFolder(row: DBFolder): Folder {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    parentId: row.parent_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
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
  args: {
    label: string;
    color: string | null;
    parentId: string | null;
    createdBy: string;
  },
): Promise<APIResponseWithData<{ folderId: string; lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const folderId = crypto.randomUUID();
    const lastUpdated = new Date().toISOString();
    await mainDb`
      INSERT INTO folders
        (id, label, color, parent_id, created_by, created_at, last_updated)
      VALUES (
        ${folderId}, ${args.label.trim()}, ${args.color}, ${args.parentId},
        ${args.createdBy}, ${lastUpdated}, ${lastUpdated}
      )
    `;
    return { success: true, data: { folderId, lastUpdated } };
  });
}

// Also THE move: label, colour and parent are one metadata write. The cycle
// guard is a recursive CTE walking UP from the target parent inside the same
// transaction as the UPDATE; a rename or a move to the root cannot create a
// cycle, so the walk is skipped when the parent is null.
export async function updateFolder(
  mainDb: Sql,
  folderId: string,
  args: { label: string; color: string | null; parentId: string | null },
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const lastUpdated = new Date().toISOString();
    const illegal = await mainDb.begin(async (sql) => {
      if (args.parentId !== null) {
        const hits = await sql`
          WITH RECURSIVE ancestors AS (
            SELECT id, parent_id FROM folders WHERE id = ${args.parentId}
            UNION ALL
            SELECT f.id, f.parent_id
            FROM folders f JOIN ancestors a ON f.id = a.parent_id
          )
          SELECT 1 FROM ancestors WHERE id = ${folderId}
        `;
        if (hits.length > 0) return true;
      }
      await sql`
        UPDATE folders
        SET label = ${args.label.trim()}, color = ${args.color},
            parent_id = ${args.parentId}, last_updated = ${lastUpdated}
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

// Child folders and products move up to the deleted folder's parent (the
// root if it had none) before the row goes, so the FK's ON DELETE SET NULL
// never fires. The freed product ids come back so the caller can emit
// products_upserted for them: their rows changed.
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
        UPDATE folders SET parent_id = ${newParent}, last_updated = ${lastUpdated}
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
