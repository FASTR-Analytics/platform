import { Hono } from "hono";
import { join } from "@std/path";
import {
  getGeoJsonMapSummaries,
  getGeoJsonForLevel,
  getAdminAreaNamesForLevel,
  getAdminAreaOptionsForLevel,
  saveGeoJsonMap,
  deleteGeoJsonMap,
  getMaxAdminAreaConfig,
} from "../../db/mod.ts";
import { throwIfErrWithData } from "lib";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceGeoJsonMapsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import {
  analyzeGeoJson,
  processGeoJson,
  processGeoJsonFromDhis2,
} from "../../geojson/process_geojson.ts";
import { validateDhis2Connection } from "../../dhis2/common/base_fetcher.ts";
import { getOrgUnitMetadata } from "../../dhis2/goal1_org_units_v2/get_metadata.ts";
import {
  fetchOrgUnitsGeoJsonForLevel,
  buildDhis2Context,
  getCacheKey,
  getFromCache,
  setInCache,
  type GeoJsonFeatureCollection,
} from "../../dhis2/goal4_geojson/mod.ts";

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
  "getAdminAreaOptionsForLevel",
  requireGlobalPermission(),
  log("getAdminAreaOptionsForLevel"),
  async (c, { params }) => {
    const level = parseInt(params.level);
    if (isNaN(level) || ![2, 3, 4].includes(level)) {
      return c.json({
        success: false,
        err: "Level must be 2, 3, or 4",
      });
    }
    const res = await getAdminAreaOptionsForLevel(c.var.mainDb, level);
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

defineRoute(
  routesGeoJsonMaps,
  "remapGeoJson",
  requireGlobalPermission("can_configure_data"),
  log("remapGeoJson"),
  async (c, { body }) => {
    const { adminAreaLevel, remapping } = body;
    if (![2, 3, 4].includes(adminAreaLevel)) {
      return c.json({ success: false, err: "Admin area level must be 2, 3, or 4" });
    }
    if (!remapping || Object.keys(remapping).length === 0) {
      return c.json({ success: false, err: "No remapping provided" });
    }

    try {
      const geoRes = await getGeoJsonForLevel(c.var.mainDb, adminAreaLevel);
      if (!geoRes.success) {
        return c.json({ success: false, err: "GeoJSON not found for this level" });
      }

      const parsed = JSON.parse(geoRes.data.geojson) as {
        type: "FeatureCollection";
        features: Array<{
          type: "Feature";
          geometry: unknown;
          properties: Record<string, unknown>;
        }>;
      };

      for (const feature of parsed.features) {
        const currentAreaId = feature.properties?.area_id;
        if (typeof currentAreaId === "string" && remapping[currentAreaId]) {
          feature.properties.area_id = remapping[currentAreaId];
        }
      }

      const updatedGeoJson = JSON.stringify(parsed);
      const saveRes = await saveGeoJsonMap(c.var.mainDb, adminAreaLevel, updatedGeoJson);

      if (saveRes.success) {
        notifyInstanceGeoJsonMapsUpdated(await getGeoJsonMapSummaries(c.var.mainDb));
      }

      return c.json(saveRes);
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to remap GeoJSON",
      });
    }
  },
);

defineRoute(
  routesGeoJsonMaps,
  "dhis2GetOrgUnitLevels",
  requireGlobalPermission("can_configure_data"),
  log("dhis2GetOrgUnitLevels"),
  async (c, { body }) => {
    const { url, username, password } = body;
    if (!url || !username || !password) {
      return c.json({ success: false, err: "DHIS2 credentials are required" });
    }

    const validation = await validateDhis2Connection({ url, username, password });
    if (!validation.valid) {
      return c.json({ success: false, err: validation.message.en });
    }

    try {
      const metadata = await getOrgUnitMetadata({ dhis2Credentials: body });
      const levels = metadata.levels.map((l) => ({
        level: l.level,
        name: l.displayName || l.name,
        orgUnitCount: l.count,
      }));
      return c.json({ success: true, data: { levels } });
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to fetch org unit levels",
      });
    }
  },
);

defineRoute(
  routesGeoJsonMaps,
  "dhis2AnalyzeGeoJson",
  requireGlobalPermission("can_configure_data"),
  log("dhis2AnalyzeGeoJson"),
  async (c, { body }) => {
    const { url, username, password, dhis2Level } = body;
    if (!url || !username || !password) {
      return c.json({ success: false, err: "DHIS2 credentials are required" });
    }
    if (typeof dhis2Level !== "number" || dhis2Level < 1) {
      return c.json({ success: false, err: "Invalid DHIS2 level" });
    }

    const validation = await validateDhis2Connection({ url, username, password });
    if (!validation.valid) {
      return c.json({ success: false, err: validation.message.en });
    }

    try {
      const cacheKey = getCacheKey(url, username, password, dhis2Level);
      let cached = getFromCache(cacheKey);

      if (!cached) {
        const featureCollection = await fetchOrgUnitsGeoJsonForLevel(body, dhis2Level);
        const dhis2Features = await buildDhis2Context(body, featureCollection);

        cached = {
          fetchedAt: Date.now(),
          featureCollection,
          dhis2Features,
        };
        setInCache(cacheKey, cached);
      }

      const { featureCollection, dhis2Features } = cached;

      const propValues: Record<string, Set<string>> = {};
      let nullGeometryCount = 0;

      for (const feature of featureCollection.features) {
        if (feature.geometry === null) {
          nullGeometryCount++;
          continue;
        }
        if (!feature.properties) continue;
        for (const [key, val] of Object.entries(feature.properties)) {
          if (val == null) continue;
          if (!propValues[key]) {
            propValues[key] = new Set();
          }
          propValues[key].add(String(val));
        }
      }

      const properties = Object.keys(propValues).sort();
      const sampleValues: Record<string, string[]> = {};
      for (const prop of properties) {
        sampleValues[prop] = Array.from(propValues[prop]).sort();
      }

      const featureCount = featureCollection.features.length - nullGeometryCount;

      if (featureCount === 0) {
        return c.json({
          success: false,
          err: `No features with geometry found at DHIS2 level ${dhis2Level}. This level may not have geographic boundaries stored in DHIS2.`,
        });
      }

      return c.json({
        success: true,
        data: {
          properties,
          sampleValues,
          featureCount,
          nullGeometryCount,
          dhis2Features,
        },
      });
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to fetch GeoJSON from DHIS2",
      });
    }
  },
);

defineRoute(
  routesGeoJsonMaps,
  "dhis2SaveGeoJsonMap",
  requireGlobalPermission("can_configure_data"),
  log("dhis2SaveGeoJsonMap"),
  async (c, { body }) => {
    const { url, username, password, dhis2Level, adminAreaLevel, areaMatchProp, areaMapping } = body;

    if (!url || !username || !password) {
      return c.json({ success: false, err: "DHIS2 credentials are required" });
    }
    if (![2, 3, 4].includes(adminAreaLevel)) {
      return c.json({ success: false, err: "Admin area level must be 2, 3, or 4" });
    }
    if (typeof dhis2Level !== "number" || dhis2Level < 1) {
      return c.json({ success: false, err: "Invalid DHIS2 level" });
    }

    try {
      const cacheKey = getCacheKey(url, username, password, dhis2Level);
      let cached = getFromCache(cacheKey);

      if (!cached) {
        const validation = await validateDhis2Connection({ url, username, password });
        if (!validation.valid) {
          return c.json({ success: false, err: validation.message.en });
        }

        const featureCollection = await fetchOrgUnitsGeoJsonForLevel(body, dhis2Level);
        const dhis2Features = await buildDhis2Context(body, featureCollection);

        cached = {
          fetchedAt: Date.now(),
          featureCollection,
          dhis2Features,
        };
        setInCache(cacheKey, cached);
      }

      const processedGeoJson = processGeoJsonFromDhis2(
        cached.featureCollection as GeoJsonFeatureCollection,
        areaMatchProp,
        areaMapping,
      );

      const res = await saveGeoJsonMap(c.var.mainDb, adminAreaLevel, processedGeoJson);

      if (res.success) {
        notifyInstanceGeoJsonMapsUpdated(await getGeoJsonMapSummaries(c.var.mainDb));
      }

      return c.json(res);
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to save GeoJSON from DHIS2",
      });
    }
  },
);

defineRoute(
  routesGeoJsonMaps,
  "dhis2DetectLevelMapping",
  requireGlobalPermission("can_configure_data"),
  log("dhis2DetectLevelMapping"),
  async (c, { body }) => {
    const { url, username, password } = body;
    if (!url || !username || !password) {
      return c.json({ success: false, err: "DHIS2 credentials are required" });
    }

    const validation = await validateDhis2Connection({ url, username, password });
    if (!validation.valid) {
      return c.json({ success: false, err: validation.message.en });
    }

    try {
      const maxAdminAreaRes = await getMaxAdminAreaConfig(c.var.mainDb);
      throwIfErrWithData(maxAdminAreaRes);
      const maxAdminArea = maxAdminAreaRes.data.maxAdminArea;

      const metadata = await getOrgUnitMetadata({ dhis2Credentials: body });

      // Pre-fetch geometry counts for each level we might match
      const geometryCounts = new Map<number, number>();
      for (const level of metadata.levels) {
        if (level.count === 0) continue;
        try {
          const geojson = await fetchOrgUnitsGeoJsonForLevel(body, level.level);
          const withGeometry = geojson.features.filter((f) => f.geometry !== null).length;
          geometryCounts.set(level.level, withGeometry);
        } catch {
          geometryCounts.set(level.level, 0);
        }
      }

      const mappings: Array<{
        adminAreaLevel: 2 | 3 | 4;
        adminAreaCount: number;
        dhis2Level: number | null;
        dhis2LevelName: string | null;
        dhis2Count: number | null;
        geometryCount: number | null;
        matchedNames: number;
        confidence: "high" | "medium" | "low" | "none";
      }> = [];

      for (let aaLevel = 2; aaLevel <= maxAdminArea; aaLevel++) {
        const aaNamesRes = await getAdminAreaNamesForLevel(c.var.mainDb, aaLevel);
        if (!aaNamesRes.success) continue;

        const aaNames = aaNamesRes.data;
        const aaCount = aaNames.length;

        let bestMatch: {
          dhis2Level: number;
          dhis2LevelName: string;
          dhis2Count: number;
          geometryCount: number;
          matchedNames: number;
          confidence: "high" | "medium" | "low" | "none";
        } | null = null;

        for (const level of metadata.levels) {
          if (level.count === 0) continue;

          const geoCount = geometryCounts.get(level.level) ?? 0;
          // Skip levels with no geometry
          if (geoCount === 0) continue;

          const countMatch = level.count === aaCount;
          const countRatio = Math.min(level.count, aaCount) / Math.max(level.count, aaCount);

          let confidence: "high" | "medium" | "low" | "none" = "none";
          if (countMatch) {
            confidence = "high";
          } else if (countRatio > 0.9) {
            confidence = "medium";
          } else if (countRatio > 0.7) {
            confidence = "low";
          }

          if (confidence !== "none" && (!bestMatch || confidence === "high" || (confidence === "medium" && bestMatch.confidence !== "high"))) {
            bestMatch = {
              dhis2Level: level.level,
              dhis2LevelName: level.displayName || level.name,
              dhis2Count: level.count,
              geometryCount: geoCount,
              matchedNames: 0,
              confidence,
            };
          }
        }

        mappings.push({
          adminAreaLevel: aaLevel as 2 | 3 | 4,
          adminAreaCount: aaCount,
          dhis2Level: bestMatch?.dhis2Level ?? null,
          dhis2LevelName: bestMatch?.dhis2LevelName ?? null,
          dhis2Count: bestMatch?.dhis2Count ?? null,
          geometryCount: bestMatch?.geometryCount ?? null,
          matchedNames: bestMatch?.matchedNames ?? 0,
          confidence: bestMatch?.confidence ?? "none",
        });
      }

      return c.json({ success: true, data: { mappings } });
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to detect level mapping",
      });
    }
  },
);
