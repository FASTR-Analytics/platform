import { Hono } from "hono";
import { join } from "@std/path";
import {
  getGeoJsonMapSummaries,
  getGeoJsonForLevel,
  getAdminAreaNamesForLevel,
  saveGeoJsonMap,
  deleteGeoJsonMap,
} from "../../db/mod.ts";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceGeoJsonMapsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import {
  analyzeGeoJson,
  processGeoJson,
} from "../../geojson/process_geojson.ts";

export const routesGeoJsonMaps = new Hono();

async function readAssetFile(assetFileName: string): Promise<string> {
  const filePath = join(_ASSETS_DIR_PATH, assetFileName);
  return await Deno.readTextFile(filePath);
}

defineRoute(
  routesGeoJsonMaps,
  "getGeoJsonMaps",
  requireGlobalPermission(),
  log("getGeoJsonMaps"),
  async (c) => {
    const summaries = await getGeoJsonMapSummaries(c.var.mainDb);
    return c.json({ success: true, data: summaries });
  },
);

defineRoute(
  routesGeoJsonMaps,
  "analyzeGeoJsonUpload",
  requireGlobalPermission("can_configure_data"),
  log("analyzeGeoJsonUpload"),
  async (c, { body }) => {
    if (!body.assetFileName) {
      return c.json({ success: false, err: "No file selected" });
    }
    try {
      const rawGeoJson = await readAssetFile(body.assetFileName);
      if (!rawGeoJson) {
        return c.json({ success: false, err: "File is empty" });
      }
      const result = analyzeGeoJson(rawGeoJson);
      return c.json({ success: true, data: result });
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to analyze GeoJSON",
      });
    }
  },
);

defineRoute(
  routesGeoJsonMaps,
  "saveGeoJsonMap",
  requireGlobalPermission("can_configure_data"),
  log("saveGeoJsonMap"),
  async (c, { body }) => {
    const { adminAreaLevel, assetFileName, areaMatchProp, areaMapping } = body;
    if (![2, 3, 4].includes(adminAreaLevel)) {
      return c.json({
        success: false,
        err: "Admin area level must be 2, 3, or 4",
      });
    }
    try {
      const rawGeoJson = await readAssetFile(assetFileName);
      const processedGeoJson = processGeoJson(
        rawGeoJson,
        areaMatchProp,
        areaMapping,
      );
      const res = await saveGeoJsonMap(
        c.var.mainDb,
        adminAreaLevel,
        processedGeoJson,
      );
      if (res.success) {
        notifyInstanceGeoJsonMapsUpdated(await getGeoJsonMapSummaries(c.var.mainDb));
      }
      return c.json(res);
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to process GeoJSON",
      });
    }
  },
);

defineRoute(
  routesGeoJsonMaps,
  "deleteGeoJsonMap",
  requireGlobalPermission("can_configure_data"),
  log("deleteGeoJsonMap"),
  async (c, { body }) => {
    const res = await deleteGeoJsonMap(c.var.mainDb, body.adminAreaLevel);
    if (res.success) {
      notifyInstanceGeoJsonMapsUpdated(await getGeoJsonMapSummaries(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesGeoJsonMaps,
  "getAdminAreaNamesForLevel",
  requireGlobalPermission(),
  log("getAdminAreaNamesForLevel"),
  async (c, { params }) => {
    const level = parseInt(params.level);
    if (isNaN(level) || ![2, 3, 4].includes(level)) {
      return c.json({
        success: false,
        err: "Level must be 2, 3, or 4",
      });
    }
    const res = await getAdminAreaNamesForLevel(c.var.mainDb, level);
    return c.json(res);
  },
);

defineRoute(
  routesGeoJsonMaps,
  "getGeoJsonForLevel",
  requireGlobalPermission(),
  log("getGeoJsonForLevel"),
  async (c, { params }) => {
    const level = parseInt(params.level);
    if (isNaN(level) || ![2, 3, 4].includes(level)) {
      return c.json({
        success: false,
        err: "Level must be 2, 3, or 4",
      });
    }
    const res = await getGeoJsonForLevel(c.var.mainDb, level);
    return c.json(res);
  },
);
