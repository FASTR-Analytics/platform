import { Sql } from "postgres";
import {
  APIResponseWithData,
  Dhis2Credentials,
  StructureDhis2OrgUnitSelection,
  StructureStagingResult,
  throwIfErrWithData,
  getEnabledOptionalFacilityColumns,
} from "lib";
import { type DHIS2OrgUnit } from "../dhis2/goal1_org_units_v2/mod.ts";
import { getDHIS2 } from "../dhis2/common/base_fetcher.ts";
import {
  getFacilityColumnsConfig,
  getMaxAdminAreaConfig,
} from "../db/instance/config.ts";

// Helper function to process a batch of org units during DHIS2 import
async function processBatch(
  batch: DHIS2OrgUnit[],
  globalLookup: Map<string, DHIS2OrgUnit>,
  maxAdminArea: number,
  enabledOptionalColumns: string[],
  rowBuffer: string[],
  _mainDb: Sql,
  _stagingTableName: string,
  BUFFER_SIZE: number,
  flushBuffer: () => Promise<void>,
  facilitiesFound: { count: number },
  totalRows: { count: number }
): Promise<void> {
  console.log(`Processing batch of ${batch.length} org units...`);

  // Build a lookup map for parent resolution within the batch
  const batchLookup = new Map<string, DHIS2OrgUnit>();
  for (const orgUnit of batch) {
    batchLookup.set(orgUnit.id, orgUnit);
  }

  // Process each org unit in the batch
  for (const orgUnit of batch) {
    facilitiesFound.count++;

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
          // Try to resolve name from global lookup, fall back to batch lookup, then ID
          const parentId = parentParts[i];
          const parentOrgUnit =
            globalLookup.get(parentId) || batchLookup.get(parentId);
          const parentName = parentOrgUnit
            ? parentOrgUnit.displayName || parentOrgUnit.name
            : parentId;
          allAdminValues.push(parentName);
        } else {
          // Need to use prefixed version of penultimate element
          if (parentParts.length > 0) {
            const penultimateId = parentParts[parentParts.length - 1];
            const penultimateOrgUnit =
              globalLookup.get(penultimateId) || batchLookup.get(penultimateId);
            const penultimateName = penultimateOrgUnit
              ? penultimateOrgUnit.displayName || penultimateOrgUnit.name
              : penultimateId;
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
        const parentId = parentParts[i];
        const parentOrgUnit =
          globalLookup.get(parentId) || batchLookup.get(parentId);
        const parentName = parentOrgUnit
          ? parentOrgUnit.displayName || parentOrgUnit.name
          : parentId;
        allAdminValues.push(parentName);
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

    // Extract optional facility metadata
    const optionalValues: string[] = [];
    for (const column of enabledOptionalColumns) {
      if (column === "facility_name") {
        optionalValues.push(orgUnit.displayName || orgUnit.name);
      } else {
        // For other columns, we don't have data from DHIS2 org units
        optionalValues.push("");
      }
    }

    // Build VALUES tuple for staging insert
    const escapedFacilityId = facilityId.replace(/'/g, "''");
    const escapedAdminValues = allAdminValues.map(
      (v) => `'${v.replace(/'/g, "''")}'`
    );
    const escapedOptionalValues = optionalValues.map(
      (v) => `'${v.replace(/'/g, "''")}'`
    );

    const allValues = [
      `'${escapedFacilityId}'`,
      ...escapedAdminValues,
      ...escapedOptionalValues,
    ];

    const valuesTuple = `(${allValues.join(",")})`;
    rowBuffer.push(valuesTuple);
    totalRows.count++;

    // Flush buffer when it reaches size limit
    if (rowBuffer.length >= BUFFER_SIZE) {
      await flushBuffer();
    }
  }
}

export async function stageStructureFromDhis2V2(
  mainDb: Sql,
  credentials: Dhis2Credentials,
  selection: StructureDhis2OrgUnitSelection,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseWithData<StructureStagingResult>> {
  // Check if another staging process is already running
  const lockResult = await mainDb.unsafe(`SELECT pg_try_advisory_lock(12345, 67890) as acquired`);
  
  if (!lockResult[0]?.acquired) {
    return {
      success: false,
      err: "DHIS2 structure staging is already in progress. Please wait for it to complete."
    };
  }

  // Temporary staging table name
  const stagingTableName = "temp_structure_staging";

  try {
    // ==================================================
    // PHASE 1: Setup & Validation
    // ==================================================

    if (onProgress) await onProgress(0.1, "Setting up staging environment...");

    // Get configuration
    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);
    const maxAdminArea = resMaxAdminArea.data.maxAdminArea;

    const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(resFacilityConfig);
    const facilityConfig = resFacilityConfig.data;
    const enabledOptionalColumns =
      getEnabledOptionalFacilityColumns(facilityConfig);

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
    for (const column of enabledOptionalColumns) {
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

    // Build a global lookup map for parent name resolution
    const globalLookup = new Map<string, DHIS2OrgUnit>();

    if (parentLevels.length > 0) {
      console.log(
        `Fetching parent levels ${parentLevels.join(
          ", "
        )} for name resolution...`
      );

      // Fetch each level separately with minimal fields for better performance
      for (const level of parentLevels) {
        console.log(`Fetching level ${level} parent org units...`);

        // Use minimal fields for parent lookup - only what we need for names
        const params = new URLSearchParams();
        params.set("fields", "id,name,displayName");
        params.set("filter", `level:eq:${level}`);
        params.set("paging", "false"); // Get all at once for each level

        const response = await getDHIS2<{
          organisationUnits: Array<{
            id: string;
            name: string;
            displayName?: string;
          }>;
        }>("/api/organisationUnits.json", fetchOptions, params);

        if (response.organisationUnits) {
          for (const orgUnit of response.organisationUnits) {
            globalLookup.set(orgUnit.id, {
              id: orgUnit.id,
              name: orgUnit.name,
              displayName: orgUnit.displayName,
            } as DHIS2OrgUnit);
          }
          console.log(
            `Loaded ${response.organisationUnits.length} level ${level} org units`
          );
        }
      }

      console.log(
        `Total loaded: ${globalLookup.size} parent org units for name resolution`
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
        ...enabledOptionalColumns,
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

      let currentPage = 1;
      let levelProcessed = 0;

      while (true) {
        const params = new URLSearchParams();
        params.set("fields", "id,name,displayName,path"); // Only essential fields for facilities
        params.set("filter", `level:eq:${level}`);
        params.set("pageSize", String(streamConfig.batchSize));
        params.set("page", String(currentPage));
        params.set("paging", "true");

        const response = await getDHIS2<{
          organisationUnits: Array<{
            id: string;
            name: string;
            displayName?: string;
            path: string;
          }>;
          pager?: { pageCount: number; total: number };
        }>("/api/organisationUnits.json", fetchOptions, params);

        if (
          !response.organisationUnits ||
          response.organisationUnits.length === 0
        ) {
          break;
        }

        // Convert to DHIS2OrgUnit format for processing
        const batch: DHIS2OrgUnit[] = response.organisationUnits.map(
          (ou) =>
            ({
              id: ou.id,
              name: ou.name,
              displayName: ou.displayName,
              path: ou.path,
              level, // Add the level we're fetching
            } as DHIS2OrgUnit)
        );

        // Process this batch (existing logic)
        await processBatch(
          batch,
          globalLookup,
          maxAdminArea,
          enabledOptionalColumns,
          rowBuffer,
          mainDb,
          stagingTableName,
          BUFFER_SIZE,
          flushBuffer,
          facilitiesFound,
          totalRows
        );

        levelProcessed += batch.length;
        totalProcessed += batch.length;
        console.log(
          `Progress: ${totalProcessed}/${totalProcessed} - Processed ${levelProcessed} level ${level} org units`
        );

        // Check if we're done with this level
        if (!response.pager || currentPage >= response.pager.pageCount) {
          break;
        }

        currentPage++;

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      currentLevelIndex++;
    }

    // Flush any remaining rows
    await flushBuffer();

    if (onProgress) await onProgress(0.9, "Finalizing import...");

    console.log(
      `Streaming complete: processed ${totalProcessed} org units, found ${facilitiesFound.count} facilities, staged ${totalRows.count} rows`
    );

    if (totalRows.count === 0) {
      await mainDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
      return {
        success: false,
        err: "No valid facility data found in DHIS2 org units",
      };
    }

    // Create indexes on staging table for better performance
    await mainDb.unsafe(
      `CREATE INDEX idx_staging_facility_dhis2 ON ${stagingTableName} (facility_id)`
    );
    for (let i = 1; i <= 4; i++) {
      await mainDb.unsafe(
        `CREATE INDEX idx_staging_admin_${i}_dhis2 ON ${stagingTableName} (admin_area_${i})`
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
      invalidRowsSkipped: 0, // DHIS2 doesn't have invalid rows in the same way
      adminAreasPreview,
      facilitiesPreview: facilitiesFound.count,
      validationWarnings: [],
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
  } finally {
    // Always release the advisory lock
    try {
      await mainDb.unsafe(`SELECT pg_advisory_unlock(12345, 67890)`);
    } catch {
      // Ignore unlock errors
    }
  }
}
