import { Sql } from "postgres";
import {
  StructureIntegrateStrategy,
  _OPTIONAL_FACILITY_COLUMNS,
  type FacilityFamily,
} from "lib";

export interface IntegrateStructureResult {
  success: boolean;
  inserted: number;
  updated: number;
  deleted: number;
  error?: string;
}

interface AdminAreaCounts {
  level1: number;
  level2: number;
  level3: number;
  level4: number;
}

/**
 * Integrates structure data from a staging table into the main admin_areas and
 * facilities tables. Common logic for both CSV and DHIS2 import workflows.
 *
 * Column scope is the staging table's own columns (= what was mapped at step 2),
 * discovered here — never the instance's enabled-columns config. Admin areas are
 * just mapped columns: present in staging iff mapped. See
 * PLAN_FACILITY_UPDATE_MODES.md.
 */
export async function integrateStructureFromStaging(
  mainDb: Sql,
  stagingTableName: string,
  strategy: StructureIntegrateStrategy,
  family: FacilityFamily
): Promise<IntegrateStructureResult> {
  const facilitiesTable =
    family === "hmis" ? "facilities_hmis" : "facilities_hfa";
  try {
    // Source of truth for column scope: the columns the file actually staged.
    const stagedColumns = await getStagedColumns(mainDb, stagingTableName);
    const stagedAdminAreas = stagedColumns.includes("admin_area_1");
    const stagedOptionalColumns = _OPTIONAL_FACILITY_COLUMNS.filter((col) =>
      stagedColumns.includes(col)
    );

    // Insert-capable intents need admin areas to place new facilities (the
    // facilities table requires them NOT NULL). The UI blocks this; guard anyway.
    const isInsertIntent =
      strategy.type === "replace_all" || strategy.type === "add_and_update";
    if (isInsertIntent && !stagedAdminAreas) {
      throw new Error(
        'Admin areas must be mapped to add facilities. Map the admin area columns, or choose "Update existing facilities only".'
      );
    }

    // Replace deletes the whole family first — refuse with a clear message if
    // anything still references these facilities (a dataset, or HFA weights),
    // instead of failing at COMMIT with a raw FK error.
    if (strategy.type === "replace_all") {
      await assertNoBlockingReferencesForReplace(mainDb, family);
    }

    // Update-only: every staged facility_id must already exist, or its data is
    // silently dropped. Fail loudly before mutating anything.
    if (strategy.type === "update_existing_only") {
      await assertAllStagedFacilitiesExist(
        mainDb,
        stagingTableName,
        facilitiesTable,
        family
      );
    }

    // The columns this file governs: admin placement (if mapped) + mapped metadata.
    const adminColumns = stagedAdminAreas
      ? ["admin_area_1", "admin_area_2", "admin_area_3", "admin_area_4"]
      : [];
    const writeColumns = [...adminColumns, ...stagedOptionalColumns];

    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    await mainDb.begin(async (sql) => {
      switch (strategy.type) {
        case "replace_all": {
          deleted = await deleteAllFamilyFacilities(sql, family);
          await insertAdminAreasFromStaging(sql, stagingTableName);
          inserted = await insertAllFacilities(
            sql,
            facilitiesTable,
            stagingTableName,
            writeColumns
          );
          await cleanupUnusedAdminAreas(sql);
          break;
        }

        case "add_and_update": {
          await insertAdminAreasFromStaging(sql, stagingTableName);
          const result = await upsertFacilities(
            sql,
            facilitiesTable,
            stagingTableName,
            writeColumns
          );
          inserted = result.inserted;
          updated = result.updated;
          // Updates can re-place existing facilities, leaving orphan admin areas.
          await cleanupUnusedAdminAreas(sql);
          break;
        }

        case "update_existing_only": {
          // Moving a facility to a new admin tuple needs the target admin rows
          // to exist first (FK), and may orphan the vacated ones afterward.
          if (stagedAdminAreas) {
            await insertAdminAreasFromStaging(sql, stagingTableName);
          }
          if (writeColumns.length > 0) {
            updated = await updateExistingFacilities(
              sql,
              facilitiesTable,
              stagingTableName,
              writeColumns
            );
          }
          if (stagedAdminAreas) {
            await cleanupUnusedAdminAreas(sql);
          }
          break;
        }
      }
    });

    console.log(
      `Structure integration complete: ${inserted} inserted, ${updated} updated, ${deleted} deleted`
    );

    return { success: true, inserted, updated, deleted };
  } catch (error) {
    console.error("Error during structure integration:", error);
    return {
      success: false,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error during integration",
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * The real column scope: the columns physically present in the staging table,
 * which the stager built from what the user mapped (CSV) or what the source
 * supplies (DHIS2). This is the authoritative source — not the enabled-columns
 * config, which staging may not have materialized.
 */
async function getStagedColumns(
  sql: Sql,
  stagingTableName: string
): Promise<string[]> {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${stagingTableName}
  `;
  return rows.map((r) => r.column_name);
}

/**
 * "Update existing facilities only" matches staged rows to existing facilities
 * by facility_id. A staged facility_id with no match would be silently dropped,
 * so the import can "succeed" while updating nothing. Reference-validate every
 * staged id against the target table and fail with the unmatched count + sample
 * ids, mirroring the HMIS integration's orphan check.
 */
async function assertAllStagedFacilitiesExist(
  sql: Sql,
  stagingTableName: string,
  facilitiesTable: string,
  family: FacilityFamily
): Promise<void> {
  const unmatched = await sql.unsafe(`
    SELECT s.facility_id, COUNT(*) OVER () AS total_unmatched
    FROM (SELECT DISTINCT facility_id FROM ${stagingTableName}) s
    LEFT JOIN ${facilitiesTable} f ON s.facility_id = f.facility_id
    WHERE f.facility_id IS NULL
    ORDER BY s.facility_id
    LIMIT 5
  `);
  if (unmatched.length === 0) {
    return;
  }
  const totalUnmatched = Number(unmatched[0].total_unmatched);
  const sample = unmatched.map((r) => r.facility_id).join(", ");
  const more =
    totalUnmatched > unmatched.length ? `, … (${totalUnmatched} total)` : "";
  const familyLabel = family === "hmis" ? "HMIS" : "HFA";
  throw new Error(
    `${totalUnmatched} facility ID(s) in your file do not match any existing ${familyLabel} facility in the backbone, so their data would not be imported. Examples: ${sample}${more}. Check that the facility ID column is mapped to the column that holds the backbone's facility IDs, and that you are importing into the correct dataset (HMIS vs HFA).`
  );
}

/**
 * Replace deletes the whole family's facilities. If a dataset (or, for HFA,
 * sampling weights) still references them, the delete fails at COMMIT with a raw
 * FK error. Pre-check and refuse with a clear instruction to delete those first.
 */
async function assertNoBlockingReferencesForReplace(
  sql: Sql,
  family: FacilityFamily
): Promise<void> {
  if (family === "hmis") {
    const ds = await sql<
      { n: number }[]
    >`SELECT COUNT(*)::int AS n FROM dataset_hmis`;
    if ((ds[0]?.n ?? 0) > 0) {
      throw new Error(
        "Cannot replace all HMIS facilities: an HMIS dataset still references them. Delete the HMIS dataset first, then replace the facilities."
      );
    }
    return;
  }
  const ds = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM hfa_data`;
  if ((ds[0]?.n ?? 0) > 0) {
    throw new Error(
      "Cannot replace all HFA facilities: an HFA dataset still references them. Delete the HFA dataset first, then replace the facilities."
    );
  }
  const weights = await sql<
    { n: number }[]
  >`SELECT COUNT(*)::int AS n FROM hfa_facility_weights`;
  if ((weights[0]?.n ?? 0) > 0) {
    throw new Error(
      "Cannot replace all HFA facilities: sampling weights still reference them. Delete the HFA sampling weights first, then replace the facilities."
    );
  }
}

/**
 * Insert all staged facilities (dedup by facility_id, first occurrence wins).
 * Used by replace_all after the wipe. Returns rows inserted.
 */
async function insertAllFacilities(
  sql: Sql,
  facilitiesTable: string,
  stagingTableName: string,
  writeColumns: string[]
): Promise<number> {
  const cols = ["facility_id", ...writeColumns];
  const result = await sql.unsafe(`
    INSERT INTO ${facilitiesTable} (${cols.join(", ")})
    SELECT ${cols.join(", ")}
    FROM (
      SELECT ${cols.join(", ")},
             ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
      FROM ${stagingTableName}
    ) t
    WHERE rn = 1
  `);
  return result.count ?? 0;
}

/**
 * Insert new facilities, update existing ones (mapped columns only). Splits the
 * affected rows into inserted vs updated by pre-counting existing matches.
 * writeColumns is always non-empty here (insert intents require admin areas).
 */
async function upsertFacilities(
  sql: Sql,
  facilitiesTable: string,
  stagingTableName: string,
  writeColumns: string[]
): Promise<{ inserted: number; updated: number }> {
  const cols = ["facility_id", ...writeColumns];
  const beforeRows = await sql.unsafe(`
    SELECT COUNT(*)::int AS matched
    FROM (SELECT DISTINCT facility_id FROM ${stagingTableName}) s
    JOIN ${facilitiesTable} f ON f.facility_id = s.facility_id
  `);
  const updated = beforeRows[0]?.matched ?? 0;
  const setClause = writeColumns
    .map((col) => `${col} = EXCLUDED.${col}`)
    .join(",\n      ");
  const result = await sql.unsafe(`
    INSERT INTO ${facilitiesTable} (${cols.join(", ")})
    SELECT ${cols.join(", ")}
    FROM (
      SELECT ${cols.join(", ")},
             ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
      FROM ${stagingTableName}
    ) t
    WHERE rn = 1
    ON CONFLICT (facility_id) DO UPDATE SET
      ${setClause}
  `);
  const total = result.count ?? 0;
  return { inserted: Math.max(0, total - updated), updated };
}

/**
 * Update mapped columns on existing facilities matched by facility_id (dedup by
 * first occurrence). Returns rows updated.
 */
async function updateExistingFacilities(
  sql: Sql,
  facilitiesTable: string,
  stagingTableName: string,
  writeColumns: string[]
): Promise<number> {
  const setClause = writeColumns
    .map((col) => `${col} = s.${col}`)
    .join(",\n      ");
  const result = await sql.unsafe(`
    UPDATE ${facilitiesTable}
    SET ${setClause}
    FROM (
      SELECT facility_id, ${writeColumns.join(", ")},
             ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
      FROM ${stagingTableName}
    ) s
    WHERE ${facilitiesTable}.facility_id = s.facility_id
      AND s.rn = 1
  `);
  return result.count ?? 0;
}

/**
 * Deletes all of a family's facilities. replace_all's pre-check
 * (assertNoBlockingReferencesForReplace) already guarantees nothing references
 * them — no dataset rows, and no HFA sampling weights — so a plain delete is
 * safe: no deferred FK and no weight stash/restore are needed. Returns rows
 * deleted. Admin areas are shared and never deleted here.
 */
async function deleteAllFamilyFacilities(
  sql: Sql,
  family: FacilityFamily
): Promise<number> {
  const facilitiesTable =
    family === "hmis" ? "facilities_hmis" : "facilities_hfa";
  console.log(`Deleting all existing ${family} facilities...`);
  const result = await sql.unsafe(`DELETE FROM ${facilitiesTable}`);
  return result.count ?? 0;
}

/**
 * Helper function to insert admin areas from staging with conflict handling
 */
async function insertAdminAreasFromStaging(
  sql: Sql,
  stagingTableName: string
): Promise<AdminAreaCounts> {
  console.log("Processing admin areas from staging...");

  // Always ON CONFLICT DO NOTHING: admin areas are shared across families and
  // may already exist from the other family's imports
  // Level 1
  const level1Result = await sql.unsafe(`
    INSERT INTO admin_areas_1 (admin_area_1)
    SELECT DISTINCT admin_area_1
    FROM ${stagingTableName}
    ON CONFLICT DO NOTHING
    RETURNING admin_area_1
  `);
  console.log(`Processed ${level1Result.length} level 1 admin areas`);

  // Level 2
  const level2Result = await sql.unsafe(`
    INSERT INTO admin_areas_2 (admin_area_1, admin_area_2)
    SELECT DISTINCT admin_area_1, admin_area_2
    FROM ${stagingTableName}
    ON CONFLICT (admin_area_2, admin_area_1) DO NOTHING
    RETURNING admin_area_2
  `);
  console.log(`Processed ${level2Result.length} level 2 admin areas`);

  // Level 3
  const level3Result = await sql.unsafe(`
    INSERT INTO admin_areas_3 (admin_area_1, admin_area_2, admin_area_3)
    SELECT DISTINCT admin_area_1, admin_area_2, admin_area_3
    FROM ${stagingTableName}
    ON CONFLICT (admin_area_3, admin_area_2, admin_area_1) DO NOTHING
    RETURNING admin_area_3
  `);
  console.log(`Processed ${level3Result.length} level 3 admin areas`);

  // Level 4
  const level4Result = await sql.unsafe(`
    INSERT INTO admin_areas_4 (admin_area_1, admin_area_2, admin_area_3, admin_area_4)
    SELECT DISTINCT admin_area_1, admin_area_2, admin_area_3, admin_area_4
    FROM ${stagingTableName}
    ON CONFLICT (admin_area_4, admin_area_3, admin_area_2, admin_area_1) DO NOTHING
    RETURNING admin_area_4
  `);
  console.log(`Processed ${level4Result.length} level 4 admin areas`);

  return {
    level1: level1Result.length,
    level2: level2Result.length,
    level3: level3Result.length,
    level4: level4Result.length,
  };
}

/**
 * Helper function to clean up unused admin areas
 */
export async function cleanupUnusedAdminAreas(sql: Sql): Promise<void> {
  console.log("Cleaning up unused admin areas...");

  // Delete unused admin areas in reverse order (4 -> 3 -> 2 -> 1).
  // An admin area is "used" if ANY facility table references it — every
  // admin-area-keyed table added in future (e.g. population) must be UNIONed
  // in here, or its admin areas get cleaned up from under it.
  const deleted4 = await sql`
    DELETE FROM admin_areas_4
    WHERE (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    NOT IN (
      SELECT DISTINCT admin_area_4, admin_area_3, admin_area_2, admin_area_1 FROM facilities_hmis
      UNION
      SELECT DISTINCT admin_area_4, admin_area_3, admin_area_2, admin_area_1 FROM facilities_hfa
    )
  `;

  const deleted3 = await sql`
    DELETE FROM admin_areas_3
    WHERE (admin_area_3, admin_area_2, admin_area_1)
    NOT IN (
      SELECT DISTINCT admin_area_3, admin_area_2, admin_area_1 FROM facilities_hmis
      UNION
      SELECT DISTINCT admin_area_3, admin_area_2, admin_area_1 FROM facilities_hfa
    )
  `;

  const deleted2 = await sql`
    DELETE FROM admin_areas_2
    WHERE (admin_area_2, admin_area_1)
    NOT IN (
      SELECT DISTINCT admin_area_2, admin_area_1 FROM facilities_hmis
      UNION
      SELECT DISTINCT admin_area_2, admin_area_1 FROM facilities_hfa
    )
  `;

  const deleted1 = await sql`
    DELETE FROM admin_areas_1
    WHERE admin_area_1
    NOT IN (
      SELECT DISTINCT admin_area_1 FROM facilities_hmis
      UNION
      SELECT DISTINCT admin_area_1 FROM facilities_hfa
    )
  `;

  console.log(
    `Cleaned up ${
      deleted4.count + deleted3.count + deleted2.count + deleted1.count
    } unused admin area records`
  );
}
