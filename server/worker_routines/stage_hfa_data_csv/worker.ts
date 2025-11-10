import { Sql } from "postgres";
import { UPLOADED_HFA_DATA_STAGING_TABLE_NAME } from "../../exposed_env_vars.ts";
import {
  DBDatasetHfaUploadAttempt,
  createBulkImportConnection,
  createWorkerReadConnection,
} from "../../db/mod.ts";
import {
  cleanValStrForSql,
  parseJsonOrThrow,
  throwIfErrWithData,
  type CsvDetails,
} from "lib";
import {
  DatasetHfaCsvStagingResult,
  DatasetHfaUploadAttemptStatus,
} from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    self.reportError(error);
    self.close();
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

async function run(std: { rawDUA: DBDatasetHfaUploadAttempt }) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { rawDUA } = std;

  // Use fixed table names for staging
  const tempTableName = "uploaded_data_staging_raw_hfa";
  const stagingTableName = UPLOADED_HFA_DATA_STAGING_TABLE_NAME;
  const tempValidFacilitiesTable = "temp_valid_facilities_hfa";

  // Create dedicated connections for the worker
  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  try {
    if (!rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // Extract file path from step_1_result
    const csvDetails = parseJsonOrThrow<CsvDetails>(rawDUA.step_1_result);
    const assetFilePath = csvDetails.filePath;
    const mappings = parseJsonOrThrow<Record<string, string>>(
      rawDUA.step_2_result
    );

    // Get streaming components - allow rows with fewer columns for wide HFA data
    const resComponents = await getCsvStreamComponents(
      assetFilePath,
      "allow-fewer-columns"
    );
    throwIfErrWithData(resComponents);
    const { headers, encodedHeaderToIndexMap, processRows } = resComponents.data;

    // Get facility_id and time_point column indices from mappings
    const facilityIdIndex = getCsvColumnIndex(
      encodedHeaderToIndexMap,
      mappings,
      "facility_id"
    );
    const timePointIndex = getCsvColumnIndex(
      encodedHeaderToIndexMap,
      mappings,
      "time_point"
    );

    // Get all other column names as variable names (excluding facility_id and time_point columns)
    const varNames: string[] = [];
    const varNameToIndex = new Map<string, number>();
    headers.forEach((header, index) => {
      if (index !== facilityIdIndex && index !== timePointIndex) {
        varNames.push(header);
        varNameToIndex.set(header, index);
      }
    });

    const dateImported = new Date().toISOString();

    // Get file size to estimate progress during CSV processing
    const fileInfo = await Deno.stat(assetFilePath);
    const fileSizeBytes = fileInfo.size;
    let lastProgressUpdate = 1;

    // Clean up any existing temp tables from failed imports
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempValidFacilitiesTable}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);

    // Update progress: 1% - Starting staging
    await updateImportProgress(mainDb, 1);

    // Create temporary unlogged table for HFA data
    await importDb.unsafe(`
CREATE UNLOGGED TABLE ${tempTableName} (
  facility_id TEXT NOT NULL,
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL
)`);

    // Prepare for bulk insert
    let rowBuffer: string[] = [];
    // Increased buffer size since wide format creates many records per row
    const BUFFER_SIZE = 100000; // Flush every 100k records (e.g., 100 rows × 1000 columns)
    let totalRows = 0;
    let rowsProcessed = 0;
    let invalidRows = 0;
    let missingFacilityIdCount = 0;
    let duplicateRowsCount = 0;
    const seenFacilities = new Set<string>();

    // Helper to flush buffer to database
    const flushBuffer = async () => {
      if (rowBuffer.length === 0) return;
      const insertQuery = `INSERT INTO ${tempTableName} (facility_id, time_point, var_name, value) VALUES ${rowBuffer.join(
        ","
      )}`;
      await importDb.unsafe(insertQuery);
      rowBuffer = [];
    };

    // Process CSV rows - transform from wide to long format
    await processRows(async (row: string[], _rowIndex: number, bytesRead: number) => {
      totalRows++;

      const facilityIdRaw = row[facilityIdIndex];
      const timePointRaw = row[timePointIndex];

      // Clean and check facility_id
      if (!facilityIdRaw) {
        missingFacilityIdCount++;
        invalidRows++;
        return;
      }

      const facilityId = cleanValStrForSql(facilityIdRaw);
      if (!facilityId) {
        // After cleaning, it might be empty
        missingFacilityIdCount++;
        invalidRows++;
        return;
      }

      // Clean and check time_point
      if (!timePointRaw) {
        invalidRows++;
        return;
      }

      const timePoint = cleanValStrForSql(timePointRaw);
      if (!timePoint) {
        // After cleaning, it might be empty
        invalidRows++;
        return;
      }

      // Check for duplicates (facility_id + time_point combination)
      const facilityTimeKey = `${facilityId}|${timePoint}`;
      if (seenFacilities.has(facilityTimeKey)) {
        duplicateRowsCount++;
        invalidRows++;
        return;
      }
      seenFacilities.add(facilityTimeKey);

      rowsProcessed++;

      // For each variable column, create a record (empty values become empty strings)
      for (const varName of varNames) {
        const columnIndex = varNameToIndex.get(varName);
        if (columnIndex === undefined) continue;
        const valueRaw = row[columnIndex] || "";
        const value = cleanValStrForSql(valueRaw);
        rowBuffer.push(
          `('${facilityId}','${timePoint}','${cleanValStrForSql(varName)}','${value}')`
        );
      }

      // Flush buffer if it reaches the limit
      if (rowBuffer.length >= BUFFER_SIZE) {
        await flushBuffer();

        // Update progress periodically (1% to 85% during CSV processing)
        const progress = Math.floor((bytesRead / fileSizeBytes) * 84) + 1;
        if (progress > lastProgressUpdate) {
          await updateImportProgress(mainDb, progress);
          lastProgressUpdate = progress;
        }
      }
    });

    // Flush any remaining rows
    await flushBuffer();

    // Update progress: 88% - Validating facilities
    await updateImportProgress(mainDb, 88);

    // Create valid facilities table
    await importDb.unsafe(`
CREATE UNLOGGED TABLE ${tempValidFacilitiesTable} AS
SELECT DISTINCT facility_id FROM facilities
WHERE EXISTS (
  SELECT 1 FROM ${tempTableName} t
  WHERE t.facility_id = facilities.facility_id
)`);

    // Update progress: 90% - Creating final staging table
    await updateImportProgress(mainDb, 90);

    // Create final staging table with validated facilities only
    await importDb.unsafe(`
CREATE TABLE ${stagingTableName} AS
SELECT
  t.facility_id,
  t.time_point,
  t.var_name,
  t.value
FROM ${tempTableName} t
WHERE EXISTS (
  SELECT 1 FROM ${tempValidFacilitiesTable} vf
  WHERE vf.facility_id = t.facility_id
)`);

    // Add primary key to staging table
    await importDb.unsafe(`
ALTER TABLE ${stagingTableName}
ADD PRIMARY KEY (facility_id, time_point, var_name)`);

    // Update progress: 95% - Gathering statistics
    await updateImportProgress(mainDb, 95);

    // Get statistics
    const validRowCount = (
      await importDb<{ count: number }[]>`
SELECT COUNT(*) as count FROM ${importDb.unsafe(stagingTableName)}`
    )[0].count;

    // Count facilities not found in facilities table
    const invalidFacilityNotFoundCount = (
      await importDb<{ count: number }[]>`
SELECT COUNT(DISTINCT facility_id) as count 
FROM ${importDb.unsafe(tempTableName)}
WHERE NOT EXISTS (
  SELECT 1 FROM ${importDb.unsafe(tempValidFacilitiesTable)} vf
  WHERE vf.facility_id = ${importDb.unsafe(tempTableName)}.facility_id
)`
    )[0].count;

    // Clean up temporary tables
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempValidFacilitiesTable}`);

    // Prepare result
    const result: DatasetHfaCsvStagingResult = {
      stagingTableName,
      dateImported,
      assetFileName: assetFilePath.split("/").pop() || assetFilePath,
      nRowsInFile: totalRows,
      nRowsValid: rowsProcessed - invalidFacilityNotFoundCount,
      nRowsInvalidMissingFacilityId: missingFacilityIdCount,
      nRowsInvalidFacilityNotFound: invalidFacilityNotFoundCount,
      nRowsDuplicated: duplicateRowsCount,
      nRowsTotal: validRowCount,
      byVariable: [], // Empty for now (all variables have same stats)
    };

    // Update progress: 100% - Complete
    await updateImportProgress(mainDb, 100, result);

    // Mark as complete
    await mainDb`
UPDATE dataset_hfa_upload_attempts
SET 
  step = 4,
  step_3_result = ${JSON.stringify(result)},
  status = ${JSON.stringify({ status: "staged", result })},
  status_type = 'staged'
`;

    (self as unknown as Worker).postMessage("COMPLETED");
  } catch (error) {
    console.error("Error in staging worker:", error);

    // Update status to error
    try {
      await mainDb`
UPDATE dataset_hfa_upload_attempts
SET 
  status = ${JSON.stringify({
    status: "error",
    err: error instanceof Error ? error.message : String(error),
  })},
  status_type = 'error'
`;
    } catch (dbError) {
      console.error("Failed to update error status:", dbError);
    }

    throw error;
  } finally {
    // Clean up connections
    await importDb.end();
    await mainDb.end();
    self.close();
  }
}

async function updateImportProgress(
  mainDb: Sql,
  progress: number,
  result?: DatasetHfaCsvStagingResult
) {
  const status: DatasetHfaUploadAttemptStatus = result
    ? { status: "staged", result }
    : { status: "staging", progress };

  await mainDb`
UPDATE dataset_hfa_upload_attempts
SET 
  status = ${JSON.stringify(status)},
  status_type = ${result ? "staged" : "staging"}
`;
}
