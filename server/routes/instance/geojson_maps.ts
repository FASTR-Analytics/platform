import { Hono } from "hono";
import {
  getGeoJsonMapSummaries,
  getGeoJsonForLevel,
  getAdminAreaOptionsForLevel,
  saveGeoJsonMap,
  deleteGeoJsonMap,
} from "../../db/mod.ts";
import { resolveAssetFilePath } from "../../db/instance/assets.ts";
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
  fetchGeometryCountForLevel,
  fetchOrgUnitsGeoJsonForLevel,
  fetchOrgUnitsMetadataForLevel,
  getCredsCacheKey,
  heavyGeoJsonSessionCache,
  metadataSessionCache,
} from "../../dhis2/goal4_geojson/mod.ts";

// Guard before the unbounded readTextFile + JSON.parse: any authenticated
// configure-data user could otherwise OOM the server with one huge upload.
// The same cap bounds the DHIS2 .geojson response body below — an arbitrary
// URL is accepted as a "DHIS2 server" on loose evidence, so the response
// must not be materialized unbounded either.
const MAX_GEOJSON_FILE_BYTES = 100 * 1024 * 1024;

// The heavy .geojson pull is ~20 MB / up to ~43 s for a 200-district country.
// Generous timeout, and NO retries — a transient failure must not re-download
// the payload up to 5× (the shared fetcher's default).
const HEAVY_GEOJSON_FETCH = {
  timeoutMs: 180000,
  maxAttempts: 1,
  maxResponseBytes: MAX_GEOJSON_FILE_BYTES,
};

export const routesGeoJsonMaps = new Hono();

async function readAssetFile(assetFileName: string): Promise<string> {
  const filePath = resolveAssetFilePath(assetFileName);
  const stat = await Deno.stat(filePath);
  if (stat.size > MAX_GEOJSON_FILE_BYTES) {
    throw new Error(
      `GeoJSON file is too large (${Math.round(stat.size / 1048576)} MB; max 100 MB)`,
    );
  }
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
      // JSON.parse SyntaxErrors embed a snippet of the file — never echo them
      if (e instanceof SyntaxError) {
        return c.json({ success: false, err: "File is not valid JSON/GeoJSON" });
      }
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
      const result = processGeoJson(rawGeoJson, areaMatchProp, areaMapping);
      // Never store an empty map: a wrong/renamed match property silently
      // drops every feature (matchValue == null → skipped).
      if (result.featureCount === 0) {
        return c.json({
          success: false,
          err: result.droppedNoMatchValueCount > 0
            ? `The match property "${areaMatchProp}" is not present on the file's features — nothing would be saved`
            : "No features with geometry to save",
        });
      }
      const res = await saveGeoJsonMap(
        c.var.mainDb,
        adminAreaLevel,
        result.geojson,
      );
      if (res.success === false) {
        return c.json(res);
      }
      notifyInstanceGeoJsonMapsUpdated(await getGeoJsonMapSummaries(c.var.mainDb));
      return c.json({
        success: true,
        data: {
          featureCount: result.featureCount,
          matchedCount: result.matchedCount,
          unmatchedCount: result.unmatchedCount,
        },
      });
    } catch (e) {
      // JSON.parse SyntaxErrors embed a snippet of the file — never echo them
      if (e instanceof SyntaxError) {
        return c.json({ success: false, err: "File is not valid JSON/GeoJSON" });
      }
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
  "getAdminAreaOptionsForLevel",
  requireGlobalPermission(),
  log("getAdminAreaOptionsForLevel"),
  async (c, { params }) => {
    if (![2, 3, 4].includes(params.level)) {
      return c.json({ success: false, err: "Level must be 2, 3, or 4" });
    }
    const res = await getAdminAreaOptionsForLevel(c.var.mainDb, params.level);
    return c.json(res);
  },
);

defineRoute(
  routesGeoJsonMaps,
  "getGeoJsonForLevel",
  requireGlobalPermission(),
  log("getGeoJsonForLevel"),
  async (c, { params }) => {
    if (![2, 3, 4].includes(params.level)) {
      return c.json({ success: false, err: "Level must be 2, 3, or 4" });
    }
    const res = await getGeoJsonForLevel(c.var.mainDb, params.level);
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
        const sourceName = feature.properties?.source_name;

        // For unmatched features (empty area_id), check if source_name has a mapping.
        // "" is a valid target: it explicitly unmaps the feature.
        if (currentAreaId === "" && typeof sourceName === "string" && remapping[`__source__${sourceName}`] !== undefined) {
          feature.properties.area_id = remapping[`__source__${sourceName}`];
        } else if (typeof currentAreaId === "string" && remapping[currentAreaId] !== undefined) {
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
      // Metadata-only analyze: the matching UI needs names, never polygons.
      // The full geometry is fetched at SAVE (dhis2SaveGeoJsonMap below).
      const cacheKey = await getCredsCacheKey(url, username, password, dhis2Level);
      let cached = metadataSessionCache.get(cacheKey);

      if (!cached) {
        const [units, withGeometryCount] = await Promise.all([
          fetchOrgUnitsMetadataForLevel(body, dhis2Level),
          fetchGeometryCountForLevel(body, dhis2Level),
        ]);
        cached = { fetchedAt: Date.now(), units, withGeometryCount };
        metadataSessionCache.set(cacheKey, cached);
      }

      const featureCount = cached.withGeometryCount;
      // Units with no stored boundary — the .geojson endpoint OMITS them (it
      // does not return null-geometry features), so this is metadata total
      // minus the exact with-geometry count.
      const nullGeometryCount = cached.units.length - cached.withGeometryCount;

      if (featureCount === 0) {
        return c.json({
          success: false,
          err: `No features with geometry found at DHIS2 level ${dhis2Level}. This level may not have geographic boundaries stored in DHIS2.`,
        });
      }

      // Offer only match properties guaranteed present in the .geojson the
      // save step fetches: name always; code only where units carry one
      // (verified live: Cameroon L3 has no codes at all).
      const nameValues = new Set<string>();
      const codeValues = new Set<string>();
      for (const unit of cached.units) {
        if (unit.name !== "") nameValues.add(unit.name);
        if (unit.code !== null) codeValues.add(unit.code);
      }
      const properties = codeValues.size > 0 ? ["code", "name"] : ["name"];
      const sampleValues: Record<string, string[]> = {
        name: Array.from(nameValues).sort(),
      };
      if (codeValues.size > 0) {
        sampleValues.code = Array.from(codeValues).sort();
      }

      return c.json({
        success: true,
        data: {
          properties,
          sampleValues,
          featureCount,
          nullGeometryCount,
          dhis2Features: cached.units,
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
      // The heavy geometry fetch happens HERE, not at analyze. The small
      // heavy cache exists so a re-save after fixing a mapping isn't another
      // multi-minute fetch.
      const cacheKey = await getCredsCacheKey(url, username, password, dhis2Level);
      let cached = heavyGeoJsonSessionCache.get(cacheKey);

      if (!cached) {
        const validation = await validateDhis2Connection({ url, username, password });
        if (!validation.valid) {
          return c.json({ success: false, err: validation.message.en });
        }

        const featureCollection = await fetchOrgUnitsGeoJsonForLevel(
          body,
          dhis2Level,
          HEAVY_GEOJSON_FETCH,
        );
        cached = { fetchedAt: Date.now(), featureCollection };
        heavyGeoJsonSessionCache.set(cacheKey, cached);
      }

      const result = processGeoJsonFromDhis2(
        cached.featureCollection,
        areaMatchProp,
        areaMapping,
      );

      // Never store an empty map. The mapping was built against the .json
      // metadata but is applied against .geojson feature properties — if the
      // match property is absent there, every feature is silently dropped.
      if (result.featureCount === 0) {
        return c.json({
          success: false,
          err: result.droppedNoMatchValueCount > 0
            ? `The match property "${areaMatchProp}" is not present on the DHIS2 geojson features — nothing would be saved`
            : `No features with geometry found at DHIS2 level ${dhis2Level} — nothing to save`,
        });
      }

      const res = await saveGeoJsonMap(c.var.mainDb, adminAreaLevel, result.geojson);
      if (res.success === false) {
        return c.json(res);
      }
      // The save succeeded — drop both cache entries so a follow-up wizard
      // run (e.g. after adding the missing boundaries in DHIS2 that the
      // unmatched count points at) fetches fresh data instead of silently
      // re-saving this payload for up to 15 minutes. The caches only need
      // to survive the fix-a-mapping-and-re-save loop, which ends here.
      heavyGeoJsonSessionCache.delete(cacheKey);
      metadataSessionCache.delete(cacheKey);
      notifyInstanceGeoJsonMapsUpdated(await getGeoJsonMapSummaries(c.var.mainDb));
      return c.json({
        success: true,
        data: {
          featureCount: result.featureCount,
          matchedCount: result.matchedCount,
          unmatchedCount: result.unmatchedCount,
        },
      });
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : "Failed to save GeoJSON from DHIS2",
      });
    }
  },
);
