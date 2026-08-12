import { Sql } from "postgres";
import type {
  APIResponseNoData,
  APIResponseWithData,
  FacilityFamily,
  GeoJsonMapSummary,
  GeojsonOrphanedAreaIds,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  getStructureSchema,
  STRUCTURE_GEOJSON_ADVISORY_LOCK_KEY,
} from "./config.ts";

export async function getGeoJsonMapSummaries(
  mainDb: Sql,
): Promise<GeoJsonMapSummary[]> {
  const rows = await mainDb<
    { facility_family: FacilityFamily; admin_area_level: number; uploaded_at: Date }[]
  >`SELECT facility_family, admin_area_level, uploaded_at FROM geojson_maps ORDER BY facility_family, admin_area_level`;
  return rows.map((r) => ({
    family: r.facility_family,
    adminAreaLevel: r.admin_area_level,
    uploadedAt: r.uploaded_at.toISOString(),
  }));
}

export async function getGeoJsonForLevel(
  mainDb: Sql,
  family: FacilityFamily,
  level: number,
): Promise<APIResponseWithData<{ geojson: string; uploadedAt: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<
      { geojson: string; uploaded_at: Date }[]
    >`SELECT geojson, uploaded_at FROM geojson_maps WHERE facility_family = ${family} AND admin_area_level = ${level}`;
    if (rows.length === 0) {
      return { success: false, err: `No GeoJSON found for ${family} admin area level ${level}` };
    }
    return { success: true, data: { geojson: rows[0].geojson, uploadedAt: rows[0].uploaded_at.toISOString() } };
  });
}

// Every save path (file upload, DHIS2, remap) funnels through here, so the
// family-local depth guard lives here: a map may not exist above its family's
// configured admin depth. The advisory lock closes the check-then-write race
// against setStructureSchema's depth change.
export async function saveGeoJsonMap(
  mainDb: Sql,
  family: FacilityFamily,
  level: number,
  processedGeoJson: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    return await mainDb.begin(async (sql): Promise<APIResponseNoData> => {
      await sql`SELECT pg_advisory_xact_lock(${STRUCTURE_GEOJSON_ADVISORY_LOCK_KEY})`;
      const resSchema = await getStructureSchema(sql, family);
      if (resSchema.success === false) {
        return resSchema;
      }
      if (level > resSchema.data.adminDepth) {
        return {
          success: false,
          err: `Cannot save a level-${level} map: the ${family.toUpperCase()} registry's admin depth is ${resSchema.data.adminDepth}`,
        };
      }
      await sql`
        INSERT INTO geojson_maps (facility_family, admin_area_level, geojson, uploaded_at)
        VALUES (${family}, ${level}, ${processedGeoJson}, NOW())
        ON CONFLICT (facility_family, admin_area_level)
        DO UPDATE SET geojson = ${processedGeoJson}, uploaded_at = NOW()
      `;
      return { success: true };
    });
  });
}

export async function deleteGeoJsonMap(
  mainDb: Sql,
  family: FacilityFamily,
  level: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM geojson_maps WHERE facility_family = ${family} AND admin_area_level = ${level}`;
    return { success: true };
  });
}

export async function countOrphanedGeoJsonAreaIds(
  mainDb: Sql,
): Promise<GeojsonOrphanedAreaIds[]> {
  const rows = await mainDb<
    { facility_family: FacilityFamily; admin_area_level: number; geojson: string }[]
  >`
    SELECT facility_family, admin_area_level, geojson FROM geojson_maps ORDER BY facility_family, admin_area_level`;
  const results: GeojsonOrphanedAreaIds[] = [];
  for (const row of rows) {
    const parsed = JSON.parse(row.geojson) as {
      features: Array<{ properties?: Record<string, unknown> }>;
    };
    const areaIds = new Set<string>();
    for (const feature of parsed.features) {
      const areaId = feature.properties?.area_id;
      if (typeof areaId === "string" && areaId !== "") {
        areaIds.add(areaId);
      }
    }
    if (areaIds.size === 0) {
      continue;
    }
    const level = row.admin_area_level;
    // A map's area_ids are matched against the tree of the registry it was
    // mapped from — never the other family's.
    const existingRows = await mainDb<{ name: string }[]>`
      SELECT ${mainDb(`admin_area_${level}`)} as name
      FROM ${mainDb(`admin_areas_${row.facility_family}_${level}`)}`;
    const existingNames = new Set(existingRows.map((r) => r.name));
    const orphanedCount = Array.from(areaIds).filter(
      (id) => !existingNames.has(id),
    ).length;
    if (orphanedCount > 0) {
      results.push({
        family: row.facility_family,
        adminAreaLevel: level,
        orphanedCount,
      });
    }
  }
  return results;
}

export type AdminAreaOption = { value: string; label: string };

export async function getAdminAreaOptionsForLevel(
  mainDb: Sql,
  family: FacilityFamily,
  level: number,
): Promise<APIResponseWithData<AdminAreaOption[]>> {
  return await tryCatchDatabaseAsync(async () => {
    if (level === 2) {
      const rows = await mainDb<{ name: string }[]>`
        SELECT DISTINCT admin_area_2 as name, LOWER(admin_area_2) as sort_key
        FROM ${mainDb(`admin_areas_${family}_2`)} ORDER BY sort_key`;
      return { success: true, data: rows.map((r) => ({ value: r.name, label: r.name })) };
    } else if (level === 3) {
      const rows = await mainDb<{ name: string; parent: string }[]>`
        SELECT admin_area_3 as name, admin_area_2 as parent, LOWER(admin_area_2 || admin_area_3) as sort_key
        FROM ${mainDb(`admin_areas_${family}_3`)} ORDER BY sort_key`;
      return { success: true, data: rows.map((r) => ({ value: r.name, label: `${r.parent} > ${r.name}` })) };
    } else if (level === 4) {
      const rows = await mainDb<{ name: string; parent3: string; parent2: string }[]>`
        SELECT admin_area_4 as name, admin_area_3 as parent3, admin_area_2 as parent2,
               LOWER(admin_area_2 || admin_area_3 || admin_area_4) as sort_key
        FROM ${mainDb(`admin_areas_${family}_4`)} ORDER BY sort_key`;
      return { success: true, data: rows.map((r) => ({ value: r.name, label: `${r.parent2} > ${r.parent3} > ${r.name}` })) };
    } else {
      return { success: false, err: "Level must be 2, 3, or 4" };
    }
  });
}
