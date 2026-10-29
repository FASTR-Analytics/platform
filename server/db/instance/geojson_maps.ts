import { Sql } from "postgres";
import type {
  AdminAreaDuplicateCount,
  AdminAreaLevel,
  AdminAreaOptionsForLevel,
  APIResponseNoData,
  APIResponseWithData,
  FacilityFamily,
  GeoJsonMapSummary,
  GeojsonOrphanedAreaIds,
} from "lib";
import { ALL_ADMIN_AREA_LEVELS } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import {
  getStructureSchema,
  STRUCTURE_GEOJSON_ADVISORY_LOCK_KEY,
} from "./config.ts";

export async function getGeoJsonMapSummaries(
  mainDb: Sql,
): Promise<GeoJsonMapSummary[]> {
  const rows = await mainDb<
    {
      facility_family: FacilityFamily;
      admin_area_level: number;
      uploaded_at: Date;
    }[]
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
      return {
        success: false,
        err: `No GeoJSON found for ${family} admin area level ${level}`,
      };
    }
    return {
      success: true,
      data: {
        geojson: rows[0].geojson,
        uploadedAt: rows[0].uploaded_at.toISOString(),
      },
    };
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
          err:
            `Cannot save a level-${level} map: the ${family.toUpperCase()} registry's admin depth is ${resSchema.data.adminDepth}`,
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

// `family` scopes the check to one registry's maps. Callers that report after
// a facility import MUST pass the imported family: a map is matched against
// its own registry's tree, so the other family's counts cannot have been
// changed by that import and reporting them blames the wrong registry.
export async function countOrphanedGeoJsonAreaIds(
  mainDb: Sql,
  family: FacilityFamily | undefined,
): Promise<GeojsonOrphanedAreaIds[]> {
  const rows = await mainDb<
    {
      facility_family: FacilityFamily;
      admin_area_level: number;
      geojson: string;
    }[]
  >`
    SELECT facility_family, admin_area_level, geojson FROM geojson_maps
    ${
    family === undefined ? mainDb`` : mainDb`WHERE facility_family = ${family}`
  }
    ORDER BY facility_family, admin_area_level`;
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
    // mapped from: never the other family's.
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

type AdminAreaRow = { name: string; parents: string[] };

// Every admin area at a level, with its parent names from level 1 down.
async function readAdminAreaRows(
  mainDb: Sql,
  family: FacilityFamily,
  level: AdminAreaLevel,
): Promise<AdminAreaRow[]> {
  const parentColumns = Array.from(
    { length: level - 1 },
    (_, i) => `admin_area_${i + 1}`,
  );
  const rows = await mainDb<Record<string, string>[]>`
    SELECT ${mainDb([`admin_area_${level}`, ...parentColumns])}
    FROM ${mainDb(`admin_areas_${family}_${level}`)}`;
  return rows.map((r) => ({
    name: r[`admin_area_${level}`],
    parents: parentColumns.map((c) => r[c]),
  }));
}

const compareNames = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

// One option per distinct name, labelled with its parents below level 1 when
// the name is unique; a repeated name is reported as a duplicate group.
export function buildAdminAreaOptions(
  rows: AdminAreaRow[],
): AdminAreaOptionsForLevel {
  const byName = new Map<string, string[][]>();
  for (const row of rows) {
    byName.set(row.name, [...(byName.get(row.name) ?? []), row.parents]);
  }
  const names = [...byName.keys()].toSorted(compareNames);
  return {
    options: names.map((name) => {
      const parentPaths = byName.get(name)!;
      return {
        value: name,
        label: parentPaths.length === 1
          ? [...parentPaths[0].slice(1), name].join(" > ")
          : name,
      };
    }),
    duplicates: names
      .filter((name) => byName.get(name)!.length > 1)
      .map((name) => ({
        name,
        parentPaths: byName.get(name)!.toSorted((a, b) =>
          compareNames(a.join(" > "), b.join(" > "))
        ),
      })),
  };
}

export async function getAdminAreaOptionsForLevel(
  mainDb: Sql,
  family: FacilityFamily,
  level: AdminAreaLevel,
): Promise<APIResponseWithData<AdminAreaOptionsForLevel>> {
  return await tryCatchDatabaseAsync(async () => ({
    success: true,
    data: buildAdminAreaOptions(
      await readAdminAreaRows(mainDb, family, level),
    ),
  }));
}

export async function countDuplicateAdminAreaNames(
  mainDb: Sql,
  family: FacilityFamily,
): Promise<AdminAreaDuplicateCount[]> {
  const counts: AdminAreaDuplicateCount[] = [];
  for (const level of ALL_ADMIN_AREA_LEVELS) {
    const { duplicates } = buildAdminAreaOptions(
      await readAdminAreaRows(mainDb, family, level),
    );
    if (duplicates.length > 0) {
      counts.push({ adminAreaLevel: level, duplicateCount: duplicates.length });
    }
  }
  return counts;
}
