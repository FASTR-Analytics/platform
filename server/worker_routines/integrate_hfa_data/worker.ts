import { Sql } from "postgres";
import {
  DBDatasetHfaUploadAttempt,
  createBulkImportConnection,
  createWorkerReadConnection,
} from "../../db/mod.ts";
import { parseJsonOrThrow } from "lib";
import {
  DatasetHfaCsvStagingResult,
  DatasetHfaUploadAttemptStatus,
} from "lib";
import { UPLOADED_HFA_DATA_STAGING_TABLE_NAME } from "../../exposed_env_vars.ts";

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

  // Use fixed table name for staging
  const stagingTableName = UPLOADED_HFA_DATA_STAGING_TABLE_NAME;
  const datasetTableName = "dataset_hfa";

  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  // Helper function to update integration progress
  async function updateIntegrationProgress(
    progress: number,
    result?: { versionId: number; nRowsIntegrated: number }
  ) {
    const status: DatasetHfaUploadAttemptStatus = result
      ? { status: "complete", ...result }
      : { status: "integrating", progress };

    await mainDb`
      UPDATE dataset_hfa_upload_attempts
      SET 
        status = ${JSON.stringify(status)},
        status_type = ${result ? "complete" : "integrating"}
    `;
  }

  try {
    if (!rawDUA.step_3_result) {
      throw new Error("Not yet ready for integration step");
    }

    // Parse staging result
    const stagingResult = parseJsonOrThrow<DatasetHfaCsvStagingResult>(
      rawDUA.step_3_result
    );

    // Verify staging table exists
    const stagingTableCheck = await importDb<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = ${stagingTableName}
      ) as exists
    `;

    if (!stagingTableCheck[0]?.exists) {
      throw new Error(
        `Staging table ${stagingTableName} not found - staging may have failed or been cleaned up`
      );
    }

    console.log("Staging table verified, checking facility validity...");

    // Check for any facility_ids in staging that don't exist in facilities
    const invalidFacilities = await importDb`
      SELECT DISTINCT s.facility_id
      FROM ${importDb(stagingTableName)} s
      LEFT JOIN facilities f ON s.facility_id = f.facility_id
      WHERE f.facility_id IS NULL
    `;

    if (invalidFacilities.length > 0) {
      const facilityList = invalidFacilities
        .map((f) => f.facility_id)
        .join(", ");
      throw new Error(
        `Cannot integrate: The following facilities in the staged data no longer exist: ${facilityList}. ` +
          `Please re-run staging or update the facilities list.`
      );
    }

    console.log("Facility validation passed, beginning integration...");

    // Update progress: 10% - Tables verified
    await updateIntegrationProgress(10);

    // Get next version ID
    const maxVersionResult = await mainDb<{ max_id: number | null }[]>`
      SELECT MAX(id) as max_id FROM dataset_hfa_versions
    `;
    const nextVersionId = (maxVersionResult[0].max_id ?? 0) + 1;

    // Update table statistics for optimal query planning
    await importDb`ANALYZE ${importDb(stagingTableName)}`;
    await mainDb`ANALYZE ${mainDb(datasetTableName)}`;

    // Update progress: 20% - Starting transaction
    await updateIntegrationProgress(20);

    // Begin transaction
    await mainDb.begin(async (sql) => {
      // Increase memory for this transaction to improve sort/join performance
      await sql`SET LOCAL work_mem = '256MB'`;
      await sql`SET LOCAL synchronous_commit = OFF`;
      await sql`SET LOCAL maintenance_work_mem = '512MB'`;

      // Create version record first (needed for FK constraint)
      await sql`
        INSERT INTO dataset_hfa_versions
        (
          id, 
          n_rows_total_imported,
          n_rows_inserted,
          n_rows_updated,
          staging_result
        )
        VALUES
        (
          ${nextVersionId}, 
          ${stagingResult.nRowsTotal},
          0,  -- Will update after counting
          0,  -- Will update after counting
          ${JSON.stringify(stagingResult)}
        )
      `;

      console.log(`Version record ${nextVersionId} created`);

      // Update progress: 30% - Version record created
      await updateIntegrationProgress(30);

      // Track row counts separately
      let rowsUpdated = 0;
      let rowsInserted = 0;

      // First, update existing rows (much faster than ON CONFLICT)
      const updateResult = await sql`
        UPDATE ${sql(datasetTableName)} dt
        SET
          value = s.value,
          version_id = ${nextVersionId}::INTEGER
        FROM ${sql(stagingTableName)} s
        WHERE
          dt.facility_id = s.facility_id
          AND dt.time_point = s.time_point
          AND dt.var_name = s.var_name
      `;

      rowsUpdated = updateResult.count;
      console.log(
        `Updated ${rowsUpdated} existing rows in ${datasetTableName}`
      );

      // Update progress: 40% - Updates complete
      await updateIntegrationProgress(40);

      // Delete the rows we just updated from the staging table
      await sql`
        DELETE FROM ${sql(stagingTableName)} s
        WHERE EXISTS (
          SELECT 1
          FROM ${sql(datasetTableName)} dt
          WHERE dt.facility_id = s.facility_id
            AND dt.time_point = s.time_point
            AND dt.var_name = s.var_name
            AND dt.version_id = ${nextVersionId}
        )
      `;

      console.log("Staging table now contains only new rows to insert");

      // Update progress: 50% - Staging table cleaned
      await updateIntegrationProgress(50);

      // Insert all remaining rows from staging (they're all new)
      const insertResult = await sql`
        INSERT INTO ${sql(datasetTableName)}
        (facility_id, time_point, var_name, value, version_id)
        SELECT
          facility_id,
          time_point,
          var_name,
          value,
          ${nextVersionId}::INTEGER as version_id
        FROM ${sql(stagingTableName)}
      `;

      rowsInserted = insertResult.count;
      const totalRowsAffected = rowsUpdated + rowsInserted;

      console.log(
        `Integration complete: ${totalRowsAffected} rows affected (${rowsUpdated} updated, ${rowsInserted} inserted) for version ${nextVersionId}`
      );

      // Update progress: 60% - Inserts complete
      await updateIntegrationProgress(60);

      // Update version record with actual counts
      await sql`
        UPDATE dataset_hfa_versions
        SET 
          n_rows_total_imported = ${totalRowsAffected},
          n_rows_inserted = ${rowsInserted},
          n_rows_updated = ${rowsUpdated}
        WHERE id = ${nextVersionId}
      `;

      console.log(`Version record ${nextVersionId} updated with actual counts`);

      // Update progress: 70% - Version record updated
      await updateIntegrationProgress(70);
    });

    // Update progress: 80% - Data integrated
    await updateIntegrationProgress(80);

    // Drop the staging table
    await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);

    console.log("Staging table cleaned up");

    // Update progress: 90% - Cleanup complete
    await updateIntegrationProgress(90);

    // Mark upload attempt as complete
    await mainDb`
      UPDATE dataset_hfa_upload_attempts
      SET 
        status = ${JSON.stringify({
          status: "complete",
          versionId: nextVersionId,
          nRowsIntegrated: stagingResult.nRowsTotal,
        })},
        status_type = 'complete'
    `;

    (self as unknown as Worker).postMessage("COMPLETED");
  } catch (error) {
    console.error("Error in integration worker:", error);

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
