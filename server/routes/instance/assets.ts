import { Hono } from "hono";
import { deleteAssets, getAssetsForInstance } from "../../db/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { getGlobalAdmin, getGlobalNonAdmin } from "../../project_auth.ts";

export const routesAssets = new Hono();

defineRoute(routesAssets, "getAssets", getGlobalNonAdmin, async (c) => {
  const res = await getAssetsForInstance();
  return c.json(res);
});

defineRoute(
  routesAssets,
  "deleteAssets",
  getGlobalAdmin,
  async (c, { body }) => {
    if (!Array.isArray(body.assetFileNames)) {
      return c.json({
        success: false,
        err: "assetFileNames must be an array",
      });
    }

    const res = await deleteAssets(body.assetFileNames);
    return c.json(res);
  }
);
