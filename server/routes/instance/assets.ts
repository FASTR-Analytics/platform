import { Hono } from "hono";
import { deleteAssets, getAssetsForInstance } from "../../db/mod.ts";
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
    const { email, isGlobalAdmin } = c.var.globalUser;
    const res = await getAssetsForInstance(c.var.mainDb, email, isGlobalAdmin);
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
      // Broadcast only public assets so private files are never exposed to other users.
      // Each client refetches their own filtered list via getAssets to see private changes.
      const assetsRes = await getAssetsForInstance(c.var.mainDb, email, true);
      if (assetsRes.success) {
        notifyInstanceAssetsUpdated(assetsRes.data.filter((a) => a.isPublic));
      }
    }
    return c.json(res);
  },
);
