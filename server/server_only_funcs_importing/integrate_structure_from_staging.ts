import { Sql } from "postgres";
import { StructureIntegrateStrategy, OptionalFacilityColumn } from "lib";

export interface IntegrateStructureResult {
  success: boolean;
  adminAreasProcessed: {
    level1: number;
    level2: number;
    level3: number;
    level4: number;
  };
  facilitiesProcessed: number;
  error?: string;
}

interface AdminAreaCounts {
  level1: number;
  level2: number;
  level3: number;
  level4: number;
}

/**
 * Integrates structure data from a staging table into the main admin_areas and facilities tables.
 * This is the common integration logic used by both CSV and DHIS2 import workflows.
 *
 * @param mainDb - Database connection
 * @param stagingTableName - Name of the staging table containing the data to integrate
 * @param optionalColumns - Array of optional facility column names to include in the integration
 * @returns Result object with counts of processed records
 */
export async function integrateStructureFromStaging(
  mainDb: Sql,
  stagingTableName: string,
  strategy: StructureIntegrateStrategy,
  optionalColumns: OptionalFacilityColumn[] = []
): Promise<IntegrateStructureResult> {
  try {
    // Validate strategy if it has selectedColumns
    if (strategy.type === "only_update_selected_cols_by_existing_facility_id") {
      if (strategy.selectedColumns.length === 0) {
        throw new Error(
          "At least one column must be selected for selective update strategy"
        );
      }

      // Validate that optional facility columns are actually enabled
      const requestedOptionalColumns = strategy.selectedColumns.filter(
        (col) => col !== "all_admin_areas"
      );
      const invalidOptionalColumns = requestedOptionalColumns.filter(
        (col) => !optionalColumns.includes(col as OptionalFacilityColumn)
      );

      if (invalidOptionalColumns.length > 0) {
        throw new Error(
          `Optional facility columns not enabled: ${invalidOptionalColumns.join(
            ", "
          )}. Enable them in instance configuration first.`
        );
      }
    }

    // Track counts for reporting
    const adminAreasProcessed = {
      level1: 0,
      level2: 0,
      level3: 0,
      level4: 0,
    };
    let facilitiesProcessed = 0;

    // Start transaction for the actual import
    await mainDb.begin(async (sql) => {
      // ==================================================
      // Process Admin Areas with Multi-Step Approach
      // ==================================================

      // Determine admin area processing steps
      const adminSteps = getAdminAreaSteps(strategy);
      let needsCleanup = false;

      // Execute admin area steps
      for (const step of adminSteps) {
        switch (step) {
          case "delete_all": {
            await deleteAllStructureData(sql);
            break;
          }
          case "insert_clean": {
            const counts = await insertAdminAreasFromStaging(
              sql,
              stagingTableName,
              "error"
            );
            adminAreasProcessed.level1 = counts.level1;
            adminAreasProcessed.level2 = counts.level2;
            adminAreasProcessed.level3 = counts.level3;
            adminAreasProcessed.level4 = counts.level4;
            break;
          }
          case "insert_do_nothing": {
            const counts = await insertAdminAreasFromStaging(
              sql,
              stagingTableName,
              "do_nothing"
            );
            adminAreasProcessed.level1 = counts.level1;
            adminAreasProcessed.level2 = counts.level2;
            adminAreasProcessed.level3 = counts.level3;
            adminAreasProcessed.level4 = counts.level4;
            break;
          }
          case "insert_error_on_conflict": {
            const counts = await insertAdminAreasFromStaging(
              sql,
              stagingTableName,
              "error"
            );
            adminAreasProcessed.level1 = counts.level1;
            adminAreasProcessed.level2 = counts.level2;
            adminAreasProcessed.level3 = counts.level3;
            adminAreasProcessed.level4 = counts.level4;
            break;
          }
        }
      }

      // Check if we need cleanup after facility processing
      if (strategy.type === "add_all_and_update_all_as_needed") {
        needsCleanup = true; // Updates can change facility admin areas, leaving orphans
      } else if (
        strategy.type === "only_update_selected_cols_by_existing_facility_id"
      ) {
        const hasAdminCols = strategy.selectedColumns.includes("all_admin_areas");
        needsCleanup = hasAdminCols;
      }

      // ==================================================
      // Process Facilities
      // ==================================================

      // Build column lists for facilities
      const facilityColumns = [
        "facility_id",
        "admin_area_1",
        "admin_area_2",
        "admin_area_3",
        "admin_area_4",
        ...optionalColumns,
      ];

      switch (strategy.type) {
        case "first_delete_all_then_add_all": {
          console.log(
            "Processing facilities from staging (after delete all)..."
          );

          // Use ROW_NUMBER() to deduplicate by facility_id, keeping the first occurrence
          const facilityResult = await sql.unsafe(`
            INSERT INTO facilities (${facilityColumns.join(", ")})
            SELECT ${facilityColumns.join(", ")}
            FROM (
              SELECT ${facilityColumns.join(", ")},
                     ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
              FROM ${stagingTableName}
            ) t
            WHERE rn = 1
            RETURNING facility_id
          `);

          facilitiesProcessed = facilityResult.length;
          console.log(`Processed ${facilitiesProcessed} facilities`);
          break;
        }

        case "add_all_and_update_all_as_needed": {
          console.log(
            "Processing facilities from staging (insert with update on conflict)..."
          );

          // Build update clause for all columns except facility_id
          const updateColumns = facilityColumns.slice(1);
          const updateSetClause = updateColumns
            .map((col) => `${col} = EXCLUDED.${col}`)
            .join(",\n            ");

          // Insert with ON CONFLICT UPDATE for facilities
          // Use ROW_NUMBER() to deduplicate by facility_id, keeping the first occurrence
          const facilityResult = await sql.unsafe(`
            INSERT INTO facilities (${facilityColumns.join(", ")})
            SELECT ${facilityColumns.join(", ")}
            FROM (
              SELECT ${facilityColumns.join(", ")},
                     ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
              FROM ${stagingTableName}
            ) t
            WHERE rn = 1
            ON CONFLICT (facility_id) 
            DO UPDATE SET 
              ${updateSetClause}
            RETURNING facility_id
          `);

          facilitiesProcessed = facilityResult.length;
          console.log(`Processed ${facilitiesProcessed} facilities`);
          break;
        }

        case "add_all_new_rows_and_ignore_conflicts": {
          console.log(
            "Processing facilities from staging (insert new only, ignore conflicts)..."
          );

          // Use ROW_NUMBER() to deduplicate by facility_id, keeping the first occurrence
          const facilityResult = await sql.unsafe(`
            INSERT INTO facilities (${facilityColumns.join(", ")})
            SELECT ${facilityColumns.join(", ")}
            FROM (
              SELECT ${facilityColumns.join(", ")},
                     ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
              FROM ${stagingTableName}
            ) t
            WHERE rn = 1
            ON CONFLICT (facility_id) DO NOTHING
            RETURNING facility_id
          `);

          facilitiesProcessed = facilityResult.length;
          console.log(`Processed ${facilitiesProcessed} facilities`);
          break;
        }

        case "add_all_new_rows_and_error_if_any_conflicts": {
          console.log(
            "Processing facilities from staging (insert new only, error on conflicts)..."
          );

          // Use ROW_NUMBER() to deduplicate by facility_id, keeping the first occurrence
          const facilityResult = await sql.unsafe(`
            INSERT INTO facilities (${facilityColumns.join(", ")})
            SELECT ${facilityColumns.join(", ")}
            FROM (
              SELECT ${facilityColumns.join(", ")},
                     ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
              FROM ${stagingTableName}
            ) t
            WHERE rn = 1
            RETURNING facility_id
          `);

          facilitiesProcessed = facilityResult.length;
          console.log(`Processed ${facilitiesProcessed} facilities`);
          break;
        }

        case "only_update_optional_facility_cols_by_existing_facility_id": {
          console.log(
            "Processing facilities from staging (update optional columns only)..."
          );

          if (optionalColumns.length === 0) {
            console.log(
              "No optional columns specified, skipping facility updates"
            );
            facilitiesProcessed = 0;
          } else {
            // Build update clause for optional columns only
            const updateSetClause = optionalColumns
              .map((col) => `${col} = s.${col}`)
              .join(",\n              ");

            // Update only optional columns for existing facilities
            const facilityResult = await sql.unsafe(`
              UPDATE facilities
              SET ${updateSetClause}
              FROM (
                SELECT facility_id, ${optionalColumns.join(", ")},
                       ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
                FROM ${stagingTableName}
              ) s
              WHERE facilities.facility_id = s.facility_id
                AND s.rn = 1
              RETURNING facilities.facility_id
            `);

            facilitiesProcessed = facilityResult.length;
            console.log(
              `Updated ${facilitiesProcessed} existing facilities with optional columns`
            );
          }
          break;
        }

        case "only_update_selected_cols_by_existing_facility_id": {
          console.log(
            "Processing facilities from staging (update selected columns only)..."
          );

          if (
            strategy.type !==
            "only_update_selected_cols_by_existing_facility_id"
          ) {
            throw new Error("Invalid strategy type");
          }

          // Build column list for update, expanding "all_admin_areas" if needed
          const actualColumns: string[] = [];
          for (const col of strategy.selectedColumns) {
            if (col === "all_admin_areas") {
              actualColumns.push("admin_area_1", "admin_area_2", "admin_area_3", "admin_area_4");
            } else {
              actualColumns.push(col);
            }
          }

          // Build update clause for selected columns only
          const updateSetClause = actualColumns
            .map((col: string) => `${col} = s.${col}`)
            .join(",\n              ");

          // Update only selected columns for existing facilities
          const facilityResult = await sql.unsafe(`
            UPDATE facilities
            SET ${updateSetClause}
            FROM (
              SELECT facility_id, ${actualColumns.join(", ")},
                     ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY rowid) as rn
              FROM ${stagingTableName}
            ) s
            WHERE facilities.facility_id = s.facility_id
              AND s.rn = 1
            RETURNING facilities.facility_id
          `);

          facilitiesProcessed = facilityResult.length;
          console.log(
            `Updated ${facilitiesProcessed} existing facilities with selected columns: ${actualColumns.join(
              ", "
            )}`
          );
          break;
        }

        default: {
          const strategyType =
            typeof strategy === "object" && strategy !== null
              ? (strategy as { type: string }).type
              : String(strategy);
          throw new Error(
            `Unknown structure integrate strategy: ${strategyType}`
          );
        }
      }

      // ==================================================
      // Post-Processing Cleanup
      // ==================================================

      // Clean up unused admin areas if needed
      if (needsCleanup) {
        await cleanupUnusedAdminAreas(sql);
      }
    });

    console.log("Structure integration completed successfully");

    return {
      success: true,
      adminAreasProcessed,
      facilitiesProcessed,
    };
  } catch (error) {
    console.error("Error during structure integration:", error);
    return {
      success: false,
      adminAreasProcessed: {
        level1: 0,
        level2: 0,
        level3: 0,
        level4: 0,
      },
      facilitiesProcessed: 0,
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
 * Helper function to delete all facilities and admin areas in the correct order
 */
async function deleteAllStructureData(sql: Sql): Promise<void> {
  console.log("Deleting all existing structure data...");

  // Delete in reverse order with constraint deferral in single statement
  await sql.unsafe(`
    SET CONSTRAINTS dataset_hmis_facility_id_fkey, dataset_hfa_facility_id_fkey DEFERRED;
    DELETE FROM facilities;
  `);
  await sql`DELETE FROM admin_areas_4`;
  await sql`DELETE FROM admin_areas_3`;
  await sql`DELETE FROM admin_areas_2`;
  await sql`DELETE FROM admin_areas_1`;
}

/**
 * Helper function to insert admin areas from staging with conflict handling
 */
async function insertAdminAreasFromStaging(
  sql: Sql,
  stagingTableName: string,
  onConflict: "do_nothing" | "error"
): Promise<AdminAreaCounts> {
  console.log(`Processing admin areas from staging (${onConflict})...`);

  const conflictClause =
    onConflict === "do_nothing" ? " ON CONFLICT DO NOTHING" : "";

  // Level 1
  const level1Result = await sql.unsafe(`
    INSERT INTO admin_areas_1 (admin_area_1)
    SELECT DISTINCT admin_area_1
    FROM ${stagingTableName}
    ${conflictClause}
    RETURNING admin_area_1
  `);
  console.log(`Processed ${level1Result.length} level 1 admin areas`);

  // Level 2
  const level2Result = await sql.unsafe(`
    INSERT INTO admin_areas_2 (admin_area_1, admin_area_2)
    SELECT DISTINCT admin_area_1, admin_area_2
    FROM ${stagingTableName}
    ${
      onConflict === "do_nothing"
        ? "ON CONFLICT (admin_area_2, admin_area_1) DO NOTHING"
        : ""
    }
    RETURNING admin_area_2
  `);
  console.log(`Processed ${level2Result.length} level 2 admin areas`);

  // Level 3
  const level3Result = await sql.unsafe(`
    INSERT INTO admin_areas_3 (admin_area_1, admin_area_2, admin_area_3)
    SELECT DISTINCT admin_area_1, admin_area_2, admin_area_3
    FROM ${stagingTableName}
    ${
      onConflict === "do_nothing"
        ? "ON CONFLICT (admin_area_3, admin_area_2, admin_area_1) DO NOTHING"
        : ""
    }
    RETURNING admin_area_3
  `);
  console.log(`Processed ${level3Result.length} level 3 admin areas`);

  // Level 4
  const level4Result = await sql.unsafe(`
    INSERT INTO admin_areas_4 (admin_area_1, admin_area_2, admin_area_3, admin_area_4)
    SELECT DISTINCT admin_area_1, admin_area_2, admin_area_3, admin_area_4
    FROM ${stagingTableName}
    ${
      onConflict === "do_nothing"
        ? "ON CONFLICT (admin_area_4, admin_area_3, admin_area_2, admin_area_1) DO NOTHING"
        : ""
    }
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
async function cleanupUnusedAdminAreas(sql: Sql): Promise<void> {
  console.log("Cleaning up unused admin areas...");

  // Delete unused admin areas in reverse order (4 -> 3 -> 2 -> 1)
  const deleted4 = await sql`
    DELETE FROM admin_areas_4
    WHERE (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    NOT IN (SELECT DISTINCT admin_area_4, admin_area_3, admin_area_2, admin_area_1 FROM facilities)
  `;

  const deleted3 = await sql`
    DELETE FROM admin_areas_3
    WHERE (admin_area_3, admin_area_2, admin_area_1)
    NOT IN (SELECT DISTINCT admin_area_3, admin_area_2, admin_area_1 FROM facilities)
  `;

  const deleted2 = await sql`
    DELETE FROM admin_areas_2
    WHERE (admin_area_2, admin_area_1)
    NOT IN (SELECT DISTINCT admin_area_2, admin_area_1 FROM facilities)
  `;

  const deleted1 = await sql`
    DELETE FROM admin_areas_1
    WHERE admin_area_1
    NOT IN (SELECT DISTINCT admin_area_1 FROM facilities)
  `;

  console.log(
    `Cleaned up ${
      deleted4.count + deleted3.count + deleted2.count + deleted1.count
    } unused admin area records`
  );
}

/**
 * Determine the admin area processing steps for a given strategy
 */
function getAdminAreaSteps(strategy: StructureIntegrateStrategy): string[] {
  switch (strategy.type) {
    case "first_delete_all_then_add_all":
      return ["delete_all", "insert_clean"];

    case "add_all_and_update_all_as_needed":
    case "add_all_new_rows_and_ignore_conflicts":
      return ["insert_do_nothing"];

    case "add_all_new_rows_and_error_if_any_conflicts":
      return ["insert_error_on_conflict"];

    case "only_update_optional_facility_cols_by_existing_facility_id":
      return []; // Skip all admin area processing

    case "only_update_selected_cols_by_existing_facility_id": {
      const hasAdminCols = strategy.selectedColumns.includes("all_admin_areas");
      return hasAdminCols ? ["insert_do_nothing"] : [];
    }

    default:
      return [];
  }
}
