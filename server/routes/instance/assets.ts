import { Hono } from "hono";
import { deleteAssets, getAssetsForInstance } from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesAssets = new Hono();

defineRoute(
  routesAssets,
  "getAssets",
  requireGlobalPermission(),
  log("getAssets"),
  async (c) => {
    const res = await getAssetsForInstance();
    return c.json(res);
  },
);

defineRoute(
  routesAssets,
  "deleteAssets",
  requireGlobalPermission("can_configure_assets"),
  log("deleteAssets"),
  async (c, { body }) => {
    if (!Array.isArray(body.assetFileNames)) {
      return c.json({
        success: false,
        err: "assetFileNames must be an array",
      });
    }

    const res = await deleteAssets(body.assetFileNames);
    return c.json(res);
  },
);
