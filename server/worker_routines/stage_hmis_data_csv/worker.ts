import { Sql } from "postgres";
import { UPLOADED_HMIS_DATA_STAGING_TABLE_NAME } from "../../exposed_env_vars.ts";
import {
  DBDatasetHmisUploadAttempt,
  createBulkImportConnection,
  createWorkerReadConnection,
} from "../../db/mod.ts";
import {
  COUNT_CHECK_CONSTRAINT,
  PERIOD_ID_CHECK_CONSTRAINT,
  cleanValStrForSql,
  isValidDatasetRow,
  parseJsonOrThrow,
  throwIfErrWithData,
  type CsvDetails,
  type DatasetCsvStagingResult,
  type DatasetUploadAttemptStatus,
  type PeriodIndicatorRawStat,
} from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // This will trigger the error event listener in datasets.ts
    self.reportError(error);
    // Ensure the worker terminates after reporting the error
    self.close();
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

async function run(std: { rawDUA: DBDatasetHmisUploadAttempt }) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { rawDUA } = std;

  // Use fixed table names for staging
  const tempTableName = "uploaded_data_staging_raw";
  const dedupTableName = "uploaded_data_staging_dedup";
  const stagingTableName = UPLOADED_HMIS_DATA_STAGING_TABLE_NAME;
  const tempValidFacilitiesTable = "temp_valid_facilities"; // Intermediate table for facility validation

  // Fixed index names for staging tables
  const tempRawIndexName = "idx_staging_raw";
  const stagingIndexName = "idx_staging_final";

  // Create dedicated connections for the worker
  // These have longer timeouts and different pool settings for bulk operations
  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  try {
    if (!rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // ==================================================
    // PHASE 1: Setup & Initial Validation
    // ==================================================

    // Extract file path from step_1_result
    const csvDetails = parseJsonOrThrow<CsvDetails>(rawDUA.step_1_result);
    const assetFilePath = csvDetails.filePath;
    const mappings = parseJsonOrThrow<Record<string, string>>(
      rawDUA.step_2_result
    );

    // Get streaming components
    const resComponents = await getCsvStreamComponents(assetFilePath);
    throwIfErrWithData(resComponents);
    const { encodedHeaderToIndexMap, processRows } = resComponents.data;

    const headerIndexes = {
      periodId: getCsvColumnIndex(
        encodedHeaderToIndexMap,
        mappings,
        "period_id"
      ),
      facilityId: getCsvColumnIndex(
        encodedHeaderToIndexMap,
        mappings,
        "facility_id"
      ),
      rawIndicatorId: getCsvColumnIndex(
        encodedHeaderToIndexMap,
        mappings,
        "raw_indicator_id"
      ),
      count: getCsvColumnIndex(encodedHeaderToIndexMap, mappings, "count"),
    } as const;

    const dateImported = new Date().toISOString();

    // Get file size to estimate progress during CSV processing
    const fileInfo = await Deno.stat(assetFilePath);
    const fileSizeBytes = fileInfo.size;
    let lastProgressUpdate = 1;

    // ==================================================
    // PHASE 2: Import to Temporary Table (No Transaction)
    // ==================================================

    // Clean up any existing temp tables from failed imports (memory leak prevention)
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${dedupTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempValidFacilitiesTable}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);

    // Also drop any old hardcoded indexes from previous code versions
    await importDb.unsafe(`DROP INDEX IF EXISTS idx_temp_raw_ind`);
    await importDb.unsafe(`DROP INDEX IF EXISTS idx_temp_agg_comp`);

    // Update progress: 1% - Starting staging
    await updateImportProgress(mainDb, 1);

    // Create temporary unlogged table for fast staging
    // Using fixed staging table names
    await importDb.unsafe(`
CREATE UNLOGGED TABLE ${tempTableName} (
  facility_id TEXT NOT NULL,
  raw_indicator_id TEXT NOT NULL,
  period_id INTEGER NOT NULL ${PERIOD_ID_CHECK_CONSTRAINT},
  count INTEGER NOT NULL ${COUNT_CHECK_CONSTRAINT}
)`);

    // Prepare for bulk insert
    let rowBuffer: string[] = [];
    const BUFFER_SIZE = 10000; // Flush every 10k rows
    let totalRows = 0;
    let rowsProcessed = 0;
    let invalidRows = 0;
    let currentBytesRead = 0;

    // Track specific validation failures
    let invalidPeriodCount = 0;
    let invalidCountCount = 0;
    let missingFieldsCount = 0;

    // Helper to flush buffer to database
    const flushBuffer = async () => {
      if (rowBuffer.length === 0) return;

      // Build VALUES clause as a single string
      const valuesClause = rowBuffer.join(",\n");

      // Use unsafe query with no parameters for speed
      await importDb.unsafe(
        `INSERT INTO ${tempTableName} (facility_id, raw_indicator_id, period_id, count) VALUES ${valuesClause}`
      );

      rowBuffer = [];

      // Update progress based on actual bytes read
      // Progress during CSV processing ranges from 1% to 85%
      const actualProgress = Math.min(
        1 + (currentBytesRead / fileSizeBytes) * 84,
        85
      );

      // Only update if progress changed by at least 1%
      if (actualProgress - lastProgressUpdate >= 1) {
        await updateImportProgress(mainDb, actualProgress);
        lastProgressUpdate = actualProgress;
      }
    };

    // Stream through CSV once, writing to temp table
    await processRows(
      async (row: string[], _rowIndex: number, bytesRead: number) => {
        rowsProcessed++;
        currentBytesRead = bytesRead;

        const periodId = row[headerIndexes.periodId];
        const facilityId = row[headerIndexes.facilityId];
        const rawIndicatorId = row[headerIndexes.rawIndicatorId];
        const countVal = cleanValStrForSql(row[headerIndexes.count]);

        // Validate row and track specific failure reasons
        const validation = isValidDatasetRow(
          periodId,
          facilityId,
          rawIndicatorId,
          countVal
        );
        if (!validation.isValid) {
          invalidRows++;

          // Track specific failure reason
          switch (validation.failureReason) {
            case "missing_fields":
              missingFieldsCount++;
              break;
            case "invalid_period":
              invalidPeriodCount++;
              break;
            case "invalid_count":
              invalidCountCount++;
              break;
          }

          return;
        }

        // Add to buffer as SQL values tuple
        rowBuffer.push(
          `('${facilityId.replace(/'/g, "''")}','${rawIndicatorId.replace(
            /'/g,
            "''"
          )}','${periodId}',${countVal})`
        );
        totalRows++;

        // Flush buffer when it reaches size limit
        if (rowBuffer.length >= BUFFER_SIZE) {
          await flushBuffer();
        }
      }
    );

    // Flush any remaining rows
    await flushBuffer();

    // Update progress: 85% - CSV data loaded to staging table
    await updateImportProgress(mainDb, 85);

    // ==================================================
    // PHASE 3: Validation & Data Quality Checks
    // ==================================================

    // Validate we imported data to temp table
    const tempCount = await importDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM ${importDb(tempTableName)}
    `;

    const rowsAfterCsvValidation = tempCount[0]?.count || 0;
    console.log(`Staged ${rowsAfterCsvValidation} raw rows to staging table`);

    if (rowsAfterCsvValidation === 0) {
      console.log(
        "No valid data rows were imported from CSV - all rows failed initial validation"
      );

      // Clean up temp table
      await importDb.unsafe(`DROP TABLE ${tempTableName}`);

      // Return result showing where validation stopped
      const stagingResult: DatasetCsvStagingResult = {
        sourceType: "csv",
        dateImported,
        assetFileName: assetFilePath.split("/").pop() || assetFilePath,
        periodIndicatorStats: [],
        rawCsvRowCount: rowsProcessed,
        validCsvRowCount: 0,
        dedupedRowCount: 0,
        finalStagingRowCount: 0,
        validation: {
          invalidPeriods: {
            rowsDropped: invalidPeriodCount,
          },
          invalidCounts: {
            rowsDropped: invalidCountCount,
          },
          missingRequiredFields: {
            rowsDropped: missingFieldsCount,
          },
          invalidFacilities: {
            total: 0,
            sample: [],
            rowsDropped: 0,
          },
          unmappedIndicators: {
            total: 0,
            sample: [],
            rowsDropped: 0,
          },
        },
      };

      await mainDb`
        UPDATE dataset_hmis_upload_attempts
        SET 
          step = 4,
          step_3_result = ${JSON.stringify(stagingResult)},
          status = ${JSON.stringify({ status: "staged" })},
          status_type = 'staged'
      `;

      console.log("Staging completed with no valid data");

      // Close connections properly
      await importDb.end();
      await mainDb.end();

      // Signal successful completion (even though no data)
      self.postMessage("COMPLETED");
      return;
    }

    // Create index on staging table for better join performance
    await importDb.unsafe(
      `CREATE INDEX ${tempRawIndexName} ON ${tempTableName} (raw_indicator_id)`
    );

    // ==================================================
    // PHASE 3.5: Deduplication
    // ==================================================

    let dedupCount = [{ count: rowsAfterCsvValidation }]; // Default to same as CSV validation if no dedup

    if (rowsAfterCsvValidation > 0) {
      console.log("Deduplicating raw data...");

      // Create deduplicated table using MAX for count when duplicates exist
      await importDb.unsafe(`
  CREATE UNLOGGED TABLE ${dedupTableName} AS
  SELECT 
    facility_id,
    raw_indicator_id,
    period_id,
    MAX(count) as count
  FROM ${tempTableName}
  GROUP BY facility_id, raw_indicator_id, period_id
  `);

      // Count how many duplicates were removed
      dedupCount = await importDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM ${importDb(dedupTableName)}
      `;

      const duplicateRowsRemoved = rowsAfterCsvValidation - dedupCount[0].count;

      if (duplicateRowsRemoved > 0) {
        console.log(
          `Removed ${duplicateRowsRemoved} duplicate rows during deduplication`
        );
      }

      // Drop the raw table now that we have the deduplicated version
      await importDb.unsafe(`DROP TABLE ${tempTableName}`);

      // Create index on dedup table for better join performance
      await importDb.unsafe(
        `CREATE INDEX idx_staging_dedup ON ${dedupTableName} (raw_indicator_id)`
      );
    } else {
      console.log("Skipping deduplication - no valid CSV rows");
    }

    // Update progress: 87% - Deduplication complete
    await updateImportProgress(mainDb, 87);

    // ==================================================
    // PHASE 4A: Facility Validation
    // ==================================================

    // Extract filename from asset path
    const assetFileName = assetFilePath.split("/").pop() || assetFilePath;

    let facilityValidation;
    let rowsAfterFacilityValidation = 0;

    if (dedupCount[0].count > 0) {
      console.log("Validating facilities...");

      // Get invalid facilities (first 10 for reporting)
      const invalidFacilitiesSample = await importDb<
        { facility_id: string; row_count: number }[]
      >`
        SELECT t.facility_id, COUNT(*)::INTEGER as row_count
        FROM ${importDb(dedupTableName)} t
        LEFT JOIN facilities f ON t.facility_id = f.facility_id
        WHERE f.facility_id IS NULL
        GROUP BY t.facility_id
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `;

      // Get total count of invalid facilities
      const invalidFacilitiesTotal = await importDb<
        { total_invalid: number }[]
      >`
        SELECT COUNT(DISTINCT t.facility_id)::INTEGER as total_invalid
        FROM ${importDb(dedupTableName)} t
        LEFT JOIN facilities f ON t.facility_id = f.facility_id
        WHERE f.facility_id IS NULL
      `;

      // Count rows that will be dropped due to invalid facilities
      const rowsDroppedByFacility = await importDb<{ count: number }[]>`
        SELECT COUNT(*)::INTEGER as count
        FROM ${importDb(dedupTableName)} t
        LEFT JOIN facilities f ON t.facility_id = f.facility_id
        WHERE f.facility_id IS NULL
      `;

      facilityValidation = {
        total: invalidFacilitiesTotal[0]?.total_invalid || 0,
        sample: invalidFacilitiesSample,
        rowsDropped: rowsDroppedByFacility[0]?.count || 0,
      };

      if (facilityValidation.total > 0) {
        console.log(
          `Found ${facilityValidation.total} invalid facilities affecting ${facilityValidation.rowsDropped} rows`
        );
        if (facilityValidation.sample.length > 0) {
          console.log(
            "Top invalid facilities:",
            facilityValidation.sample
              .slice(0, 3)
              .map((f) => `${f.facility_id} (${f.row_count} rows)`)
              .join(", ")
          );
        }
      }

      // Create intermediate table with only valid facilities
      await importDb.unsafe(`
        CREATE UNLOGGED TABLE ${tempValidFacilitiesTable} AS
        SELECT t.*
        FROM ${dedupTableName} t
        INNER JOIN facilities f ON t.facility_id = f.facility_id
      `);

      // Check if any rows remain after facility validation
      const validFacilityCount = await importDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM ${importDb(tempValidFacilitiesTable)}
      `;

      rowsAfterFacilityValidation = validFacilityCount[0]?.count || 0;
      console.log(
        `${rowsAfterFacilityValidation} rows remain after facility validation`
      );

      // If no rows remain, we can skip further processing but still return results
      if (rowsAfterFacilityValidation === 0) {
        console.log("No valid facilities found - all rows filtered out");
      }

      // Drop the dedup table now that we've validated facilities
      await importDb.unsafe(`DROP TABLE ${dedupTableName}`);
    } else {
      // No rows to validate, set empty validation results
      facilityValidation = {
        total: 0,
        sample: [],
        rowsDropped: 0,
      };
      console.log("Skipping facility validation - no deduplicated rows");
    }

    // Update progress: 88% - Facility validation complete
    await updateImportProgress(mainDb, 88);

    // ==================================================
    // PHASE 4B: Indicator Validation
    // ==================================================

    let indicatorValidation;

    if (rowsAfterFacilityValidation > 0) {
      console.log("Validating indicators...");

      // Get unmapped indicators (first 10 for reporting)
      const unmappedIndicatorsSample = await importDb<
        { indicator_raw_id: string; row_count: number }[]
      >`
        SELECT t.raw_indicator_id as indicator_raw_id, COUNT(*)::INTEGER as row_count
        FROM ${importDb(tempValidFacilitiesTable)} t
        WHERE NOT EXISTS (
          SELECT 1 FROM indicators_raw ir 
          WHERE ir.indicator_raw_id = t.raw_indicator_id
        )
        GROUP BY t.raw_indicator_id
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `;

      // Get total count of unmapped indicators
      const unmappedIndicatorsTotal = await importDb<
        { total_invalid: number }[]
      >`
        SELECT COUNT(DISTINCT t.raw_indicator_id)::INTEGER as total_invalid
        FROM ${importDb(tempValidFacilitiesTable)} t
        WHERE NOT EXISTS (
          SELECT 1 FROM indicators_raw ir 
          WHERE ir.indicator_raw_id = t.raw_indicator_id
        )
      `;

      // Count rows that will be dropped due to unmapped indicators
      const rowsDroppedByIndicator = await importDb<{ count: number }[]>`
        SELECT COUNT(*)::INTEGER as count
        FROM ${importDb(tempValidFacilitiesTable)} t
        WHERE NOT EXISTS (
          SELECT 1 FROM indicators_raw ir 
          WHERE ir.indicator_raw_id = t.raw_indicator_id
        )
      `;

      indicatorValidation = {
        total: unmappedIndicatorsTotal[0]?.total_invalid || 0,
        sample: unmappedIndicatorsSample,
        rowsDropped: rowsDroppedByIndicator[0]?.count || 0,
      };

      if (indicatorValidation.total > 0) {
        console.log(
          `Found ${indicatorValidation.total} unmapped indicators affecting ${indicatorValidation.rowsDropped} rows`
        );
        if (indicatorValidation.sample.length > 0) {
          console.log(
            "Top unmapped indicators:",
            indicatorValidation.sample
              .slice(0, 3)
              .map((i) => `${i.indicator_raw_id} (${i.row_count} rows)`)
              .join(", ")
          );
        }
      }
    } else {
      // No rows to validate, set empty validation results
      indicatorValidation = {
        total: 0,
        sample: [],
        rowsDropped: 0,
      };
      console.log(
        "Skipping indicator validation - no rows after facility validation"
      );
    }

    // Create final staging table with both validations
    let finalStagingCount: { count: number }[] = [{ count: 0 }];

    if (rowsAfterFacilityValidation > 0) {
      console.log("Creating final staging table with validated data...");

      await importDb.unsafe(`
        CREATE UNLOGGED TABLE ${stagingTableName} AS
        SELECT 
          t.facility_id,
          t.raw_indicator_id as indicator_raw_id,
          t.period_id::INTEGER as period_id,
          t.count::INTEGER as count
        FROM ${tempValidFacilitiesTable} t
        WHERE EXISTS (
          SELECT 1 FROM indicators_raw ir 
          WHERE ir.indicator_raw_id = t.raw_indicator_id
        )
      `);

      // Check if any rows remain after indicator validation
      finalStagingCount = await importDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM ${importDb(stagingTableName)}
      `;

      const finalRowCount = finalStagingCount[0]?.count || 0;
      console.log(
        `${finalRowCount} rows in final staging table after all validations`
      );

      if (finalRowCount > 0) {
        // Create index on staging table for better performance
        await importDb.unsafe(
          `CREATE INDEX ${stagingIndexName} ON ${stagingTableName} (facility_id, indicator_raw_id, period_id)`
        );
      }
    } else {
      // Create empty staging table for consistency
      console.log("Creating empty staging table - no valid facilities");
      await importDb.unsafe(`
        CREATE UNLOGGED TABLE ${stagingTableName} (
          facility_id TEXT,
          indicator_raw_id TEXT,
          period_id INTEGER,
          count INTEGER
        )
      `);
    }

    // Clean up intermediate table if it exists
    if (rowsAfterFacilityValidation > 0) {
      await importDb.unsafe(`DROP TABLE ${tempValidFacilitiesTable}`);
    }

    // Update progress: 90% - Data staged
    await updateImportProgress(mainDb, 90);

    // ==================================================
    // PHASE 5: Collect Statistics from Staged Data
    // ==================================================

    let periodIndicatorStats: PeriodIndicatorRawStat[] = [];

    if (finalStagingCount[0]?.count > 0) {
      // Collect period-indicator statistics from staged data
      // Collect statistics on raw indicators (consistent with DHIS2 staging)
      const periodIndicatorStatsRaw = await importDb<
        {
          period_id: number;
          indicator_raw_id: string;
          n_records: number;
          total_count: number;
        }[]
      >`
  SELECT 
    period_id,
    indicator_raw_id,
    COUNT(*) as n_records,
    SUM(count) as total_count
  FROM ${importDb(stagingTableName)}
  GROUP BY period_id, indicator_raw_id
  ORDER BY period_id, indicator_raw_id
  `;

      // Map database field names to TypeScript property names
      periodIndicatorStats = periodIndicatorStatsRaw.map<PeriodIndicatorRawStat>(
        (stat) => ({
          periodId: stat.period_id,
          indicatorRawId: stat.indicator_raw_id,
          nRecords: stat.n_records,
          totalCount: stat.total_count,
        })
      );

      console.log(
        `Aggregated data contains ${periodIndicatorStats.length} period-indicator combinations`
      );
    } else {
      console.log("No data to collect statistics from");
    }

    console.log(
      `Staged ${rowsAfterCsvValidation} raw rows into ${finalStagingCount[0].count} unique facility-indicator-period combinations`
    );

    if (invalidRows > 0) {
      console.log(`Skipped ${invalidRows} invalid rows during import:`);
      if (missingFieldsCount > 0) {
        console.log(
          `  - ${missingFieldsCount} rows with missing required fields`
        );
      }
      if (invalidPeriodCount > 0) {
        console.log(
          `  - ${invalidPeriodCount} rows with invalid period format`
        );
      }
      if (invalidCountCount > 0) {
        console.log(`  - ${invalidCountCount} rows with invalid count values`);
      }
    }

    // ==================================================
    // PHASE 6: Save Staging Results
    // ==================================================

    // Store staging results in step_3_result
    const stagingResult: DatasetCsvStagingResult = {
      sourceType: "csv",
      dateImported,
      assetFileName,
      periodIndicatorStats,
      rawCsvRowCount: rowsProcessed,
      validCsvRowCount: rowsAfterCsvValidation,
      dedupedRowCount: dedupCount[0].count,
      finalStagingRowCount: finalStagingCount[0].count,
      validation: {
        // Initial CSV validation failures
        invalidPeriods: {
          rowsDropped: invalidPeriodCount,
        },
        invalidCounts: {
          rowsDropped: invalidCountCount,
        },
        missingRequiredFields: {
          rowsDropped: missingFieldsCount,
        },
        // Reference validation failures
        invalidFacilities: facilityValidation,
        unmappedIndicators: indicatorValidation,
      },
    };

    await mainDb`
        UPDATE dataset_hmis_upload_attempts
        SET 
          step = 4,
          step_3_result = ${JSON.stringify(stagingResult)},
          status = ${JSON.stringify({ status: "staged" })},
          status_type = 'staged'
      `;

    console.log(`Staging completed successfully for upload attempt`);

    // Close connections properly
    await importDb.end();
    await mainDb.end();

    // Signal successful completion
    self.postMessage("COMPLETED");

    // Successfully completed
  } catch (e) {
    console.error("Failed on staging:", e);

    // Update status to error
    try {
      await mainDb`
      UPDATE dataset_hmis_upload_attempts
      SET 
        status = ${JSON.stringify({
          status: "error",
          err: e instanceof Error ? e.message : "Staging failed",
        })},
        status_type = 'error'
    `;
    } catch {
      // Ignore status update errors
    }

    // Try to clean up any staging tables that might exist
    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${tempTableName}`);
    } catch {
      // Ignore cleanup errors
    }

    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${dedupTableName}`);
    } catch {
      // Ignore cleanup errors
    }

    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${tempValidFacilitiesTable}`);
    } catch {
      // Ignore cleanup errors
    }

    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
    } catch {
      // Ignore cleanup errors
    }

    // Close connections on error too
    try {
      await importDb.end();
      await mainDb.end();
    } catch {
      // Ignore connection close errors
    }

    // Re-throw the error to trigger error event
    throw e;
  }
}

// Helper function to update staging progress
async function updateImportProgress(
  mainDb: Sql,
  progress: number // 0-100 representing percentage
): Promise<void> {
  const status: DatasetUploadAttemptStatus = {
    status: "staging",
    progress: Math.round(progress), // Round to nearest integer
  };
  await mainDb`
    UPDATE dataset_hmis_upload_attempts
    SET 
      status = ${JSON.stringify(status)},
      status_type = 'staging'
  `;
}
