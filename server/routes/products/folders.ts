import { Hono } from "hono";
import type { Sql } from "postgres";
import { closeConnectionsWhoseLevelChanged } from "../../collab/presence_registry.ts";
import {
  createFolder,
  deleteFolder,
  getProductSummaries,
  listFolders,
  moveFolder,
  raiseFolderProductsAccess,
  updateFolder,
} from "../../db/products/mod.ts";
import { log } from "../../middleware/logging.ts";
import {
  notifyInstanceFoldersUpdated,
  notifyInstanceProductsUpserted,
} from "../../task_management/notify_instance_updated.ts";
import { COLLAB_CLOSE_ACCESS_CHANGED } from "../instance/collab.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesFolders = new Hono();

// The guard is the registry entry's `access` (defineRoute installs it), and
// productAccessPolicy refuses a restricted user every route here (PLAN_SCOPES
// R23); the DB layer refuses a cycle with the typed FOLDER_CYCLE failure,
// which returns through the envelope before any notify fires.

async function notifyFolders(mainDb: Sql): Promise<void> {
  const res = await listFolders(mainDb);
  if (res.success) {
    notifyInstanceFoldersUpdated(res.data);
  }
}

defineRoute(
  routesFolders,
  "createFolder",
  log("createFolder"),
  async (c, { body }) => {
    const res = await createFolder(c.var.mainDb, {
      ...body,
      createdBy: c.var.globalUser.email,
    });
    if (!res.success) {
      return respond(c, res);
    }
    await notifyFolders(c.var.mainDb);
    return respond(c, res);
  },
);

defineRoute(
  routesFolders,
  "updateFolder",
  log("updateFolder"),
  async (c, { params, body }) => {
    const res = await updateFolder(c.var.mainDb, params.folder_id, body);
    if (!res.success) {
      return respond(c, res);
    }
    await notifyFolders(c.var.mainDb);
    return respond(c, res);
  },
);

defineRoute(
  routesFolders,
  "moveFolder",
  log("moveFolder"),
  async (c, { params, body }) => {
    const res = await moveFolder(c.var.mainDb, params.folder_id, body.parentId);
    if (!res.success) {
      return respond(c, res);
    }
    await notifyFolders(c.var.mainDb);
    return respond(c, res);
  },
);

defineRoute(
  routesFolders,
  "deleteFolder",
  log("deleteFolder"),
  async (c, { params }) => {
    const res = await deleteFolder(c.var.mainDb, params.folder_id);
    if (!res.success) {
      return respond(c, res);
    }
    // The folder's products moved up one level: their rows changed, so they
    // need their own products_upserted beside the folder list.
    await notifyFolders(c.var.mainDb);
    await notifyInstanceProductsUpserted(
      c.var.mainDb,
      res.data.freedProductIds,
    );
    return respond(c, {
      success: true as const,
      data: { freedProductIds: res.data.freedProductIds },
    });
  },
);

// The bulk action (PLAN_PRODUCT_OWNERSHIP R19). Like the per-product access
// writes it bumps no last_updated, re-broadcasts the summaries it changed and
// closes the collab sockets whose standing on one of them changed.
defineRoute(
  routesFolders,
  "setFolderProductsAccess",
  log("setFolderProductsAccess"),
  async (c, { params, body }) => {
    const res = await raiseFolderProductsAccess(
      c.var.mainDb,
      params.folder_id,
      body,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, res.data.productIds);
    const changed = await getProductSummaries(
      c.var.mainDb,
      res.data.productIds,
    );
    if (!changed.success) {
      console.error(`setFolderProductsAccess re-read: ${changed.err}`);
    } else {
      for (const product of changed.data) {
        closeConnectionsWhoseLevelChanged(
          product.id,
          product,
          COLLAB_CLOSE_ACCESS_CHANGED,
          "Product access changed",
        );
      }
    }
    return respond(c, res);
  },
);
