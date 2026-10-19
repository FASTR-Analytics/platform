import { Hono } from "hono";
import {
  deleteAssets,
  getAssetsForInstance,
  getAssetsForUser,
  updateAssetVisibility,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceAssetsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesAssets = new Hono();

defineRoute(
  routesAssets,
  "getAssets",
  requireGlobalPermission(),
  log("getAssets"),
  async (c) => {
    const res = await getAssetsForUser(c.var.mainDb, c.var.globalUser);
    return c.json(res);
  },
);

defineRoute(
  routesAssets,
  "deleteAssets",
  requireGlobalPermission(),
  log("deleteAssets"),
  async (c, { body }) => {
    if (!Array.isArray(body.assetFileNames)) {
      return c.json({
        success: false,
        err: "assetFileNames must be an array",
      });
    }

    const { email, isGlobalAdmin } = c.var.globalUser;
    const res = await deleteAssets(
      c.var.mainDb,
      body.assetFileNames,
      email,
      isGlobalAdmin,
    );
    if (res.success) {
      const assetsRes = await getAssetsForInstance(c.var.mainDb);
      if (assetsRes.success) {
        notifyInstanceAssetsUpdated(assetsRes.data);
      }
    }
    return c.json(res);
  },
);

// Owner-only (see updateAssetVisibility). The broadcast carries every asset
// with its privacy; each SSE connection filters it to what its user may see.
defineRoute(
  routesAssets,
  "updateAssetVisibility",
  requireGlobalPermission(),
  log("updateAssetVisibility"),
  async (c, { body }) => {
    const res = await updateAssetVisibility(
      c.var.mainDb,
      body.fileName,
      body.isPrivate,
      body.viewerEmails,
      c.var.globalUser,
    );
    if (res.success) {
      const assetsRes = await getAssetsForInstance(c.var.mainDb);
      if (assetsRes.success) {
        notifyInstanceAssetsUpdated(assetsRes.data);
      }
    }
    return c.json(res);
  },
);
