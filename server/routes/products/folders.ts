import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  createFolder,
  deleteFolder,
  listFolders,
  updateFolder,
} from "../../db/mod.ts";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import {
  notifyInstanceFoldersUpdated,
  notifyProductsUpserted,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesFolders = new Hono();

// Folders are the one flat organising level over products (D1), guarded by
// requireApprovedUser() like the products themselves (D2).

// Folders are few and change rarely, so the whole list rides every change —
// the per-row treatment products need buys nothing here.
async function notifyFolders(mainDb: Sql): Promise<void> {
  const res = await listFolders(mainDb);
  if (res.success) {
    notifyInstanceFoldersUpdated(res.data);
  }
}

defineRoute(
  routesFolders,
  "createFolder",
  requireApprovedUser(),
  async (c, { body }) => {
    const res = await createFolder(c.var.mainDb, body.label, body.color);
    if (!res.success) {
      return c.json(res);
    }

    await notifyFolders(c.var.mainDb);

    return c.json(res);
  },
);

defineRoute(
  routesFolders,
  "updateFolder",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await updateFolder(
      c.var.mainDb,
      params.folder_id,
      body.label,
      body.color,
    );
    if (!res.success) {
      return c.json(res);
    }

    await notifyFolders(c.var.mainDb);

    return c.json(res);
  },
);

defineRoute(
  routesFolders,
  "deleteFolder",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await deleteFolder(c.var.mainDb, params.folder_id);
    if (!res.success) {
      return c.json(res);
    }

    // The folder's products are un-foldered, not deleted — their rows changed,
    // so they need their own products_upserted alongside the folder list.
    await notifyFolders(c.var.mainDb);
    await notifyProductsUpserted(c.var.mainDb, res.data.freedProductIds);

    return c.json({
      success: true as const,
      data: { freedProductIds: res.data.freedProductIds },
    });
  },
);
