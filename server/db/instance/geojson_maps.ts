import { Sql } from "postgres";
import type { APIResponseNoData, APIResponseWithData, GeoJsonMapSummary } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export async function getGeoJsonMapSummaries(
  mainDb: Sql,
): Promise<GeoJsonMapSummary[]> {
  const rows = await mainDb<
    { admin_area_level: number; uploaded_at: Date }[]
  >`SELECT admin_area_level, uploaded_at FROM geojson_maps ORDER BY admin_area_level`;
  return rows.map((r) => ({
    adminAreaLevel: r.admin_area_level,
    uploadedAt: r.uploaded_at.toISOString(),
  }));
}

export async function getGeoJsonForLevel(
  mainDb: Sql,
  level: number,
): Promise<APIResponseWithData<{ geojson: string; uploadedAt: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<
      { geojson: string; uploaded_at: Date }[]
    >`SELECT geojson, uploaded_at FROM geojson_maps WHERE admin_area_level = ${level}`;
    if (rows.length === 0) {
      return { success: false, err: `No GeoJSON found for admin area level ${level}` };
    }
    return { success: true, data: { geojson: rows[0].geojson, uploadedAt: rows[0].uploaded_at.toISOString() } };
  });
}

export async function saveGeoJsonMap(
  mainDb: Sql,
  level: number,
  processedGeoJson: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO geojson_maps (admin_area_level, geojson, uploaded_at)
      VALUES (${level}, ${processedGeoJson}, NOW())
      ON CONFLICT (admin_area_level)
      DO UPDATE SET geojson = ${processedGeoJson}, uploaded_at = NOW()
    `;
    return { success: true };
  });
}

export async function getAdminAreaNamesForLevel(
  mainDb: Sql,
  level: number,
): Promise<APIResponseWithData<string[]>> {
  return await tryCatchDatabaseAsync(async () => {
    let rows: { name: string }[];
    if (level === 2) {
      rows = await mainDb<{ name: string }[]>`SELECT DISTINCT admin_area_2 as name, LOWER(admin_area_2) as sort_key FROM admin_areas_2 ORDER BY sort_key`;
    } else if (level === 3) {
      rows = await mainDb<{ name: string }[]>`SELECT DISTINCT admin_area_3 as name, LOWER(admin_area_3) as sort_key FROM admin_areas_3 ORDER BY sort_key`;
    } else if (level === 4) {
      rows = await mainDb<{ name: string }[]>`SELECT DISTINCT admin_area_4 as name, LOWER(admin_area_4) as sort_key FROM admin_areas_4 ORDER BY sort_key`;
    } else {
      return { success: false, err: "Level must be 2, 3, or 4" };
    }
    return { success: true, data: rows.map((r) => r.name) };
  });
}

export async function deleteGeoJsonMap(
  mainDb: Sql,
  level: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM geojson_maps WHERE admin_area_level = ${level}`;
    return { success: true };
  });
}

export type AdminAreaOption = { value: string; label: string };

export async function getAdminAreaOptionsForLevel(
  mainDb: Sql,
  level: number,
): Promise<APIResponseWithData<AdminAreaOption[]>> {
  return await tryCatchDatabaseAsync(async () => {
    if (level === 2) {
      const rows = await mainDb<{ name: string }[]>`
        SELECT DISTINCT admin_area_2 as name, LOWER(admin_area_2) as sort_key
        FROM admin_areas_2 ORDER BY sort_key`;
      return { success: true, data: rows.map((r) => ({ value: r.name, label: r.name })) };
    } else if (level === 3) {
      const rows = await mainDb<{ name: string; parent: string }[]>`
        SELECT admin_area_3 as name, admin_area_2 as parent, LOWER(admin_area_2 || admin_area_3) as sort_key
        FROM admin_areas_3 ORDER BY sort_key`;
      return { success: true, data: rows.map((r) => ({ value: r.name, label: `${r.parent} > ${r.name}` })) };
    } else if (level === 4) {
      const rows = await mainDb<{ name: string; parent3: string; parent2: string }[]>`
        SELECT admin_area_4 as name, admin_area_3 as parent3, admin_area_2 as parent2,
               LOWER(admin_area_2 || admin_area_3 || admin_area_4) as sort_key
        FROM admin_areas_4 ORDER BY sort_key`;
      return { success: true, data: rows.map((r) => ({ value: r.name, label: `${r.parent2} > ${r.parent3} > ${r.name}` })) };
    } else {
      return { success: false, err: "Level must be 2, 3, or 4" };
    }
  });
}
