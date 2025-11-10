import { Sql } from "postgres";
import {
  APIResponseWithData,
  StructureColumnMappings,
  StructureStagingResult,
  cleanValStrForSql,
  getEnabledOptionalFacilityColumns,
  throwIfErrWithData,
} from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import {
  getFacilityColumnsConfig,
  getMaxAdminAreaConfig,
} from "../db/instance/config.ts";

export async function stageStructureFromCsv(
  mainDb: Sql,
  csvFilePath: string,
  columnMappings: StructureColumnMappings,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseWithData<StructureStagingResult>> {
  // Temporary staging table names
  const stagingTableName = "temp_structure_staging";

  try {
    // ==================================================
    // PHASE 1: Setup & Initial Validation
    // ==================================================
    
    if (onProgress) await onProgress(0.05, "Validating CSV file...");

    // Check file size before processing
    const fileInfo = await Deno.stat(csvFilePath);
    const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB limit

    if (fileInfo.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (fileInfo.size / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
      return {
        success: false,
        err: `CSV file is too large for adding admin areas and facilities (${sizeMB}MB). Maximum file size allowed is ${maxMB}MB. Consider using a background worker process for larger imports.`,
      };
    }

    if (onProgress) await onProgress(0.1, "Loading configuration...");

    // Get maxAdminArea from config
    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);
    const maxAdminArea = resMaxAdminArea.data.maxAdminArea;

    // Get facility columns config to know which optional columns are enabled
    const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(resFacilityConfig);
    const facilityConfig = resFacilityConfig.data;

    if (onProgress) await onProgress(0.15, "Analyzing CSV structure...");

    // Get streaming components
    const resComponents = await getCsvStreamComponents(csvFilePath);
    if (!resComponents.success) {
      return { success: false, err: resComponents.err };
    }
    const { encodedHeaderToIndexMap, processRows } = resComponents.data;

    // Helper to get column index with encodedHeaderToIndexMap and columnMappings in scope
    const getMappedColumnIndex = (
      columnKey: keyof StructureColumnMappings
    ): number => {
      const mappedHeader = columnMappings[columnKey];
      if (!mappedHeader) return -1;

      return getCsvColumnIndex(
        encodedHeaderToIndexMap,
        columnMappings as Record<string, string>,
        columnKey
      );
    };

    // Get column indexes from mappings
    const facilityIndex = getMappedColumnIndex("facility_id");

    const adminIndexes: { level: number; index: number }[] = [];
    for (let i = 1; i <= maxAdminArea; i++) {
      const key = `admin_area_${i}` as keyof StructureColumnMappings;
      const index = getMappedColumnIndex(key);
      if (index >= 0) {
        adminIndexes.push({ level: i, index });
      }
    }

    // Get indexes for optional columns (only if enabled and mapped)
    const enabledOptionalColumns =
      getEnabledOptionalFacilityColumns(facilityConfig);
    const optionalIndexes: { column: string; index: number }[] = [];

    for (const column of enabledOptionalColumns) {
      const index = getMappedColumnIndex(
        column as keyof StructureColumnMappings
      );
      if (index >= 0) {
        optionalIndexes.push({ column, index });
      }
    }

    // ==================================================
    // PHASE 2: Stream CSV to Staging Table
    // ==================================================
    
    if (onProgress) await onProgress(0.2, "Creating staging table...");

    console.log("Creating staging table for structure import...");

    // Drop any existing staging table
    await mainDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);

    // Create staging table with all 4 admin columns plus optional columns
    const stagingColumns: string[] = [
      "rowid SERIAL PRIMARY KEY", // Add rowid for deduplication ordering
      "facility_id TEXT NOT NULL",
      "admin_area_1 TEXT NOT NULL",
      "admin_area_2 TEXT NOT NULL",
      "admin_area_3 TEXT NOT NULL",
      "admin_area_4 TEXT NOT NULL",
    ];

    // Add optional columns to staging table
    for (const opt of optionalIndexes) {
      stagingColumns.push(`${opt.column} TEXT`);
    }

    await mainDb.unsafe(`
      CREATE UNLOGGED TABLE ${stagingTableName} (
        ${stagingColumns.join(",\n        ")}
      )
    `);

    // Prepare for bulk insert
    let rowBuffer: string[] = [];
    const BUFFER_SIZE = 10000; // Flush every 10k rows
    let totalRows = 0;
    let invalidRows = 0;
    let rowsProcessed = 0;

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
        ...optionalIndexes.map((opt) => opt.column),
      ];

      await mainDb.unsafe(
        `INSERT INTO ${stagingTableName} (${allColumns.join(
          ", "
        )}) VALUES ${valuesClause}`
      );

      rowBuffer = [];
    };

    // Track if we need to abort
    // Stream through CSV once, writing to staging table
    if (onProgress) await onProgress(0.25, "Processing CSV rows...");
    
    try {
      await processRows(async (row: string[]) => {
        rowsProcessed++;

        // Report progress every 1000 rows (between 25% and 70%)
        if (rowsProcessed % 1000 === 0 && onProgress) {
          const baseProgress = 0.25 + (rowsProcessed / 10000) * 0.45; // Scale to 25-70%
          const progress = Math.min(0.7, baseProgress);
          await onProgress(progress, `Processed ${rowsProcessed.toLocaleString()} rows...`);
        }

        // Extract and validate all required fields
        const facilityId = cleanValStrForSql(row[facilityIndex]);
        if (!facilityId) {
          invalidRows++;
          return;
        }

        // Extract admin areas and validate all are present (up to maxAdminArea)
        const adminValues: string[] = [];
        for (const ai of adminIndexes) {
          const value = cleanValStrForSql(row[ai.index]);
          if (!value) {
            invalidRows++;
            return;
          }
          adminValues.push(value);
        }

        // Pad admin values to always have 4 levels
        // If maxAdminArea < 4, duplicate the highest level value
        const allAdminValues: string[] = [];
        for (let i = 1; i <= 4; i++) {
          if (i <= maxAdminArea) {
            // Use the actual value from CSV
            allAdminValues.push(adminValues[i - 1]);
          } else {
            // Duplicate the highest admin level we have
            allAdminValues.push(adminValues[adminValues.length - 1]);
          }
        }

        // Extract optional column values
        const optionalValues: string[] = [];
        for (const opt of optionalIndexes) {
          const value = cleanValStrForSql(row[opt.index]) || "";
          optionalValues.push(value);
        }

        // Build VALUES tuple
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
        totalRows++;

        // Flush buffer when it reaches size limit
        if (rowBuffer.length >= BUFFER_SIZE) {
          await flushBuffer();
        }
      });
    } catch (error) {
      // Clean up staging table before re-throwing
      await mainDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
      throw error;
    }

    // Flush any remaining rows
    await flushBuffer();

    if (onProgress) await onProgress(0.75, `Processed ${totalRows.toLocaleString()} rows, creating indexes...`);

    console.log(
      `Staged ${totalRows} valid rows (${invalidRows} invalid rows skipped, ${rowsProcessed} total rows processed)`
    );

    if (totalRows === 0) {
      await mainDb.unsafe(`DROP TABLE ${stagingTableName}`);
      return { success: false, err: "No valid data rows found in CSV" };
    }

    // Create index on staging table for better performance
    await mainDb.unsafe(
      `CREATE INDEX idx_staging_facility ON ${stagingTableName} (facility_id)`
    );
    // Always create indexes for all 4 admin levels
    for (let i = 1; i <= 4; i++) {
      await mainDb.unsafe(
        `CREATE INDEX idx_staging_admin_${i} ON ${stagingTableName} (admin_area_${i})`
      );
    }

    // ==================================================
    // PHASE 3: Generate Preview Counts for Client
    // ==================================================
    
    if (onProgress) await onProgress(0.85, "Analyzing data structure...");

    console.log("Generating preview counts...");

    // Get admin area counts at each level
    const adminPreviewQueries = await Promise.all([
      mainDb.unsafe(`SELECT COUNT(DISTINCT admin_area_1) as count FROM ${stagingTableName}`),
      mainDb.unsafe(`SELECT COUNT(DISTINCT (admin_area_1, admin_area_2)) as count FROM ${stagingTableName}`),
      mainDb.unsafe(`SELECT COUNT(DISTINCT (admin_area_1, admin_area_2, admin_area_3)) as count FROM ${stagingTableName}`),
      mainDb.unsafe(`SELECT COUNT(DISTINCT (admin_area_1, admin_area_2, admin_area_3, admin_area_4)) as count FROM ${stagingTableName}`)
    ]);

    const adminAreasPreview = {
      level1: adminPreviewQueries[0][0]?.count || 0,
      level2: adminPreviewQueries[1][0]?.count || 0,
      level3: adminPreviewQueries[2][0]?.count || 0,
      level4: adminPreviewQueries[3][0]?.count || 0,
    };

    const facilitiesPreview = totalRows;

    console.log("CSV structure staging completed successfully");

    const stagingResult: StructureStagingResult = {
      stagingTableName,
      totalRowsStaged: totalRows,
      invalidRowsSkipped: invalidRows,
      adminAreasPreview,
      facilitiesPreview,
      validationWarnings: [],
    };

    if (onProgress) await onProgress(1, `Successfully staged ${totalRows.toLocaleString()} rows`);

    return { success: true, data: stagingResult };
  } catch (error) {
    // Try to clean up staging table on error
    try {
      await mainDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      err:
        error instanceof Error ? error.message : "Unknown error during import",
    };
  }
}
