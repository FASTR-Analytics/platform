import { Sql } from "postgres";
import {
  APIResponseWithData,
  Dhis2Credentials,
  StructureDhis2OrgUnitSelection,
  StructureStagingResult,
  throwIfErrWithData,
  getEnabledOptionalFacilityColumns,
  type FacilityFamily,
} from "lib";
import {
  type Dhis2OrgUnitPath,
  getOrgUnitNamesAtLevel,
  pageOrgUnitPathsAtLevel,
} from "../dhis2/goal1_org_units_v2/mod.ts";
import { escapeSqlString } from "../db/utils.ts";
import {
  getStructureSchema,
} from "../db/instance/config.ts";

// Helper function to process a batch of org units during DHIS2 import
async function processBatch(
  batch: Dhis2OrgUnitPath[],
  parentNames: Map<string, string>,
  maxAdminArea: number,
  optionalColumns: string[],
  rowBuffer: string[],
  BUFFER_SIZE: number,
  flushBuffer: () => Promise<void>,
  facilitiesFound: { count: number },
  totalRows: { count: number },
  invalidRows: { count: number }
): Promise<void> {
  console.log(`Processing batch of ${batch.length} org units...`);

  // Parent resolution: the parent levels fetched up front, then this batch,
  // then the id itself.
  const batchNames = new Map(batch.map((u) => [u.id, u.name]));
  const nameOf = (id: string): string =>
    parentNames.get(id) ?? batchNames.get(id) ?? id;

  // Process each org unit in the batch
  for (const orgUnit of batch) {
    // Parse path - remove empty elements and extract IDs
    const pathParts = orgUnit.path.split("/").filter((p) => p !== "");

    // IMPORTANT: Last element is always facility_id
    const facilityId = pathParts[pathParts.length - 1];

    // Parent elements (excluding the facility itself)
    const parentParts = pathParts.slice(0, -1);

    // Initialize admin areas
    const allAdminValues: string[] = [];

    // Apply path-based mapping heuristic
    if (parentParts.length <= maxAdminArea) {
      // Case 1: Path length fits within maxAdminArea
      // Fill admin areas directly from path
      for (let i = 0; i < maxAdminArea; i++) {
        if (i < parentParts.length) {
          allAdminValues.push(nameOf(parentParts[i]));
        } else {
          // Need to use prefixed version of penultimate element
          if (parentParts.length > 0) {
            const penultimateName = nameOf(parentParts[parentParts.length - 1]);
            const facilityLevel = parentParts.length + 1; // +1 because facility is next level
            allAdminValues.push(
              `FACILITY AT LEVEL ${facilityLevel}: ${penultimateName}`
            );
          } else {
            allAdminValues.push("");
          }
        }
      }
    } else {
      // Case 2: Path length exceeds maxAdminArea
      // Take first maxAdminArea elements, ignore middle ones
      for (let i = 0; i < maxAdminArea; i++) {
        allAdminValues.push(nameOf(parentParts[i]));
      }
    }

    // Ensure we always have exactly 4 admin values for the staging table
    while (allAdminValues.length < 4) {
      if (allAdminValues.length > 0) {
        // Duplicate the last admin value
        allAdminValues.push(allAdminValues[allAdminValues.length - 1]);
      } else {
        // Shouldn't happen, but safe fallback
        allAdminValues.push("");
      }
    }

    // A root-level org unit (no parents) yields empty admin values; the staging
    // columns are NOT NULL and integration would create '' admin areas. Drop
    // the row and count it, mirroring the CSV path's invalid-row handling.
    if (allAdminValues.some((v) => v.trim() === "")) {
      invalidRows.count++;
      continue;
    }

    // Extract optional facility metadata
    const optionalValues: string[] = [];
    for (const column of optionalColumns) {
      if (column === "facility_name") {
        optionalValues.push(orgUnit.name);
      } else {
        // For other columns, we don't have data from DHIS2 org units
        optionalValues.push("");
      }
    }

    // Build VALUES tuple for staging insert
    const escapedFacilityId = escapeSqlString(facilityId);
    const escapedAdminValues = allAdminValues.map(
      (v) => `'${escapeSqlString(v)}'`
    );
    const escapedOptionalValues = optionalValues.map(
      (v) => `'${escapeSqlString(v)}'`
    );

    const allValues = [
      `'${escapedFacilityId}'`,
      ...escapedAdminValues,
      ...escapedOptionalValues,
    ];

    const valuesTuple = `(${allValues.join(",")})`;
    rowBuffer.push(valuesTuple);
    facilitiesFound.count++;
    totalRows.count++;

    // Flush buffer when it reaches size limit
    if (rowBuffer.length >= BUFFER_SIZE) {
      await flushBuffer();
    }
  }
}

export async function stageStructureFromDhis2V2(
  mainDb: Sql,
  family: FacilityFamily,
  credentials: Dhis2Credentials,
  selection: StructureDhis2OrgUnitSelection,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseWithData<StructureStagingResult>> {
  // Per-family staging table so HMIS and HFA imports can run concurrently
  // without clobbering each other's staging data. Same-family double-staging is
  // gated by the status_type='importing' check in the step-3 wrapper; the
  // staging table is family-scoped so the residual race is benign (same attempt,
  // same mappings → same result, deduped at integration). No advisory lock: the
  // old pg_advisory_lock leaked because acquire and the finally-unlock ran on
  // different pooled mainDb connections, wedging the lock until restart.
  const stagingTableName = `temp_structure_staging_${family}`;

  try {
    // ==================================================
    // PHASE 1: Setup & Validation
    // ==================================================

    if (onProgress) await onProgress(0.1, "Setting up staging environment...");

    // The family's structure schema: admin depth + enabled optional columns
    const resStructureSchema = await getStructureSchema(mainDb, family);
    throwIfErrWithData(resStructureSchema);
    const maxAdminArea = resStructureSchema.data.adminDepth;
    const enabledOptionalColumns =
      getEnabledOptionalFacilityColumns(resStructureSchema.data);
    // DHIS2 only supplies facility_name (from displayName). Never stage the other
    // metadata columns: integration writes exactly the staged columns, and a
    // blank facility_type/ownership would wipe existing values under the two
    // updating strategies (replace_all blanks unmapped columns by design).
    const dhis2OptionalColumns = enabledOptionalColumns.filter(
      (c) => c === "facility_name"
    );

    // ==================================================
    // PHASE 2: Setup Staging Table
    // ==================================================

    console.log("Creating staging table for DHIS2 structure import...");

    // Drop any existing staging table
    await mainDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);

    // Create staging table with all 4 admin columns plus optional columns
    const stagingColumns: string[] = [
      "rowid SERIAL PRIMARY KEY",
      "facility_id TEXT NOT NULL",
      "admin_area_1 TEXT NOT NULL",
      "admin_area_2 TEXT NOT NULL",
      "admin_area_3 TEXT NOT NULL",
      "admin_area_4 TEXT NOT NULL",
    ];

    // Add optional columns to staging table
    for (const column of dhis2OptionalColumns) {
      stagingColumns.push(`${column} TEXT`);
    }

    await mainDb.unsafe(`
      CREATE UNLOGGED TABLE ${stagingTableName} (
        ${stagingColumns.join(",\n        ")}
      )
    `);

    // ==================================================
    // PHASE 3: Fetch Parent Org Units for Name Resolution
    // ==================================================

    const fetchOptions = { 
      dhis2Credentials: credentials
      // Keep default retry options for individual API calls
    };

    if (onProgress) await onProgress(0.2, "Fetching parent organization units...");

    console.log("Fetching parent org units for admin area name resolution...");

    // Determine which levels we need for parent resolution
    const maxSelectedLevel = Math.max(...selection.selectedLevels);
    const parentLevels = [];
    for (let i = 1; i < maxSelectedLevel; i++) {
      parentLevels.push(i);
    }

    // Parent id to label, for admin area name resolution
    const parentNames = new Map<string, string>();

    if (parentLevels.length > 0) {
      console.log(
        `Fetching parent levels ${parentLevels.join(
          ", "
        )} for name resolution...`
      );

      for (const level of parentLevels) {
        console.log(`Fetching level ${level} parent org units...`);
        const units = await getOrgUnitNamesAtLevel(level, fetchOptions);
        for (const unit of units) {
          parentNames.set(unit.id, unit.name);
        }
        console.log(`Loaded ${units.length} level ${level} org units`);
      }

      console.log(
        `Total loaded: ${parentNames.size} parent org units for name resolution`
      );
    }

    // ==================================================
    // PHASE 4: Stream Organization Units to Staging
    // ==================================================

    // Streaming config - only fetch selected levels
    // Increased batch size since we're fetching minimal fields
    const streamConfig = {
      selectedLevels: selection.selectedLevels,
      batchSize: 500,
    };

    if (onProgress) await onProgress(0.3, "Processing organization unit data...");

    console.log(`Starting DHIS2 streaming import with config:`, streamConfig);

    // Prepare for bulk insert to staging table
    let rowBuffer: string[] = [];
    const BUFFER_SIZE = 5000; // Flush every 5k rows
    let totalProcessed = 0;
    const facilitiesFound = { count: 0 };
    const totalRows = { count: 0 };
    const invalidRows = { count: 0 };

    // Helper to flush buffer to database
    const flushBuffer = async () => {
      if (rowBuffer.length === 0) return;

      const valuesClause = rowBuffer.join(",\n");

      const allColumns = [
        "facility_id",
        "admin_area_1",
        "admin_area_2",
        "admin_area_3",
        "admin_area_4",
        ...dhis2OptionalColumns,
      ];

      await mainDb.unsafe(
        `INSERT INTO ${stagingTableName} (${allColumns.join(
          ", "
        )}) VALUES ${valuesClause}`
      );

      rowBuffer = [];
    };

    // Stream and process org units in batches with minimal fields
    // Custom streaming for facilities - only fetch what we need
    const totalLevels = selection.selectedLevels.length;
    let currentLevelIndex = 0;

    for (const level of selection.selectedLevels) {
      console.log(`Fetching level ${level} facilities...`);

      // Progress between 0.3 and 0.8 based on level processing
      const levelProgress = 0.3 + (currentLevelIndex / totalLevels) * 0.5;
      if (onProgress) await onProgress(levelProgress, `Fetching level ${level} facilities...`);

      let levelProcessed = 0;

      for await (
        const page of pageOrgUnitPathsAtLevel(
          level,
          streamConfig.batchSize,
          fetchOptions,
        )
      ) {
        // A unit with no id or no path cannot be staged: counted like the CSV
        // path's invalid rows.
        invalidRows.count += page.dropped;

        await processBatch(
          page.units,
          parentNames,
          maxAdminArea,
          dhis2OptionalColumns,
          rowBuffer,
          BUFFER_SIZE,
          flushBuffer,
          facilitiesFound,
          totalRows,
          invalidRows
        );

        levelProcessed += page.units.length + page.dropped;
        totalProcessed += page.units.length + page.dropped;
        console.log(
          `Progress: processed ${levelProcessed} level ${level} org units (${totalProcessed} total)`
        );
      }

      currentLevelIndex++;
    }

    // Flush any remaining rows
    await flushBuffer();

    if (onProgress) await onProgress(0.9, "Finalizing import...");

    console.log(
      `Streaming complete: processed ${totalProcessed} org units, found ${facilitiesFound.count} facilities, staged ${totalRows.count} rows (${invalidRows.count} invalid rows skipped)`
    );

    if (totalRows.count === 0) {
      await mainDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
      return {
        success: false,
        err: "No valid facility data found in DHIS2 org units",
      };
    }

    // Create indexes on staging table for better performance. Index names are
    // schema-global, so base them on the per-family table name to avoid a
    // collision when HMIS and HFA stage concurrently.
    await mainDb.unsafe(
      `CREATE INDEX ${stagingTableName}_facility_idx ON ${stagingTableName} (facility_id)`
    );
    for (let i = 1; i <= 4; i++) {
      await mainDb.unsafe(
        `CREATE INDEX ${stagingTableName}_admin_${i}_idx ON ${stagingTableName} (admin_area_${i})`
      );
    }

    // ==================================================
    // PHASE 4: Generate Preview Counts for Client
    // ==================================================

    console.log("Generating preview counts...");

    // Get admin area counts at each level
    const adminPreviewQueries = await Promise.all([
      mainDb.unsafe(
        `SELECT COUNT(DISTINCT admin_area_1) as count FROM ${stagingTableName}`
      ),
      mainDb.unsafe(
        `SELECT COUNT(DISTINCT (admin_area_1, admin_area_2)) as count FROM ${stagingTableName}`
      ),
      mainDb.unsafe(
        `SELECT COUNT(DISTINCT (admin_area_1, admin_area_2, admin_area_3)) as count FROM ${stagingTableName}`
      ),
      mainDb.unsafe(
        `SELECT COUNT(DISTINCT (admin_area_1, admin_area_2, admin_area_3, admin_area_4)) as count FROM ${stagingTableName}`
      ),
    ]);

    const adminAreasPreview = {
      level1: adminPreviewQueries[0][0]?.count || 0,
      level2: adminPreviewQueries[1][0]?.count || 0,
      level3: adminPreviewQueries[2][0]?.count || 0,
      level4: adminPreviewQueries[3][0]?.count || 0,
    };

    console.log("DHIS2 structure staging completed successfully");

    if (onProgress) await onProgress(0.95, "Generating preview data...");

    const stagingResult: StructureStagingResult = {
      stagingTableName,
      totalRowsStaged: totalRows.count,
      invalidRowsSkipped: invalidRows.count,
      adminAreasPreview,
      facilitiesPreview: facilitiesFound.count,
      validationWarnings: [],
      stagedOptionalColumns: dhis2OptionalColumns,
      stagedAdminAreas: true,
      stagingNonce: crypto.randomUUID(),
    };

    return { success: true, data: stagingResult };
  } catch (error) {
    // Try to clean up staging table on error
    try {
      await mainDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
    } catch {
      // Ignore cleanup errors
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during DHIS2 streaming import";
    console.error("DHIS2 v2 structure import error:", error);
    return { success: false, err: errorMessage };
  }
}
