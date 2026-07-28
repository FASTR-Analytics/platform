import { Sql } from "postgres";
import {
  DBDatasetHmisUploadAttempt,
  createBulkImportConnection,
  createWorkerReadConnection,
  upsertHmisLedgerPairsFromData,
} from "../../db/mod.ts";
import {
  parseJsonOrThrow,
  type DatasetUploadAttemptStatus,
  type DatasetStagingResult,
} from "lib";
import { UPLOADED_HMIS_DATA_STAGING_TABLE_NAME } from "../../exposed_env_vars.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
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

  // Use fixed table name for staging
  const aggregatedTableName = UPLOADED_HMIS_DATA_STAGING_TABLE_NAME;

  // Create dedicated connections for the worker
  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  try {
    if (!rawDUA.step_3_result) {
      throw new Error("Staging not complete - step_3_result is missing");
    }

    // ==================================================
    // PHASE 1: Load Staging Results
    // ==================================================

    const stagingResultRaw = parseJsonOrThrow<DatasetStagingResult>(
      rawDUA.step_3_result
    );

    // DHIS2 imports are runs (per-pair fetch+integrate in the run worker) —
    // this worker integrates CSV attempts only. A DHIS2-staged attempt can
    // only be a leftover from before the Phase 3 deploy.
    if (stagingResultRaw.sourceType === "dhis2") {
      throw new Error(
        "This staged DHIS2 attempt predates the per-pair import runs. " +
          "Delete this upload attempt and re-import via the DHIS2 import."
      );
    }

    const datasetTableName = "dataset_hmis";

    // Verify staging table exists
    const aggregatedTableCheck = await importDb<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = ${aggregatedTableName}
      ) as exists
    `;

    if (!aggregatedTableCheck[0]?.exists) {
      throw new Error(
        `Aggregated staging table ${aggregatedTableName} not found - staging may have failed or been cleaned up`
      );
    }

    // The staging table and step_3_result are separate artifacts that can
    // desynchronize between phases: the table is UNLOGGED (truncated by a
    // Postgres crash while the attempt row, WAL-logged, still says 'staged'),
    // and a killed re-stage can leave a partial table. The DHIS2 scoped
    // delete would turn either into deletions with nothing re-inserted, so
    // integration only proceeds when the table holds exactly the rows the
    // recorded staging result describes. Number() both sides: COUNT(*) comes
    // back as a string on this connection, and older staging results stored
    // finalStagingRowCount as a JSON string.
    const stagingRowCount = await importDb<{ count: string | number }[]>`
      SELECT COUNT(*) as count FROM ${importDb(aggregatedTableName)}
    `;
    const actualRows = Number(stagingRowCount[0].count);
    const recordedRows = Number(stagingResultRaw.finalStagingRowCount);
    if (actualRows !== recordedRows) {
      throw new Error(
        `Staging table holds ${actualRows} rows but the staging result recorded ${recordedRows}. ` +
          `The staged data no longer matches what was reviewed (interrupted re-stage or database crash). ` +
          `Please re-run staging.`
      );
    }

    console.log("Staging table verified, checking facility validity...");

    // Check for any facility_ids in staging that don't exist in facilities
    const invalidFacilities = await importDb`
      SELECT DISTINCT a.facility_id
      FROM ${importDb(aggregatedTableName)} a
      LEFT JOIN facilities_hmis f ON a.facility_id = f.facility_id
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
    await updateIntegrationProgress(mainDb, 10);

    // ==================================================
    // PHASE 2: Begin Transaction
    // ==================================================

    // Update table statistics for optimal query planning
    await importDb`ANALYZE ${importDb(aggregatedTableName)}`;
    await mainDb`ANALYZE ${mainDb(datasetTableName)}`;

    // Update progress: 20% - Starting transaction
    await updateIntegrationProgress(mainDb, 20);

    // Start transaction for the final integration steps
    await mainDb.begin(async (sql) => {
      // Increase memory for this transaction to improve sort/join performance
      await sql`SET LOCAL work_mem = '256MB'`;

      // Don't wait for WAL flush - faster writes but still transactionally safe
      await sql`SET LOCAL synchronous_commit = OFF`;

      // More memory for index operations during DELETE/INSERT
      await sql`SET LOCAL maintenance_work_mem = '512MB'`;

      // ==================================================
      // PHASE 3: Insert Version Record (needed for FK constraint)
      // ==================================================

      // Version id minted inside the transaction, right before its INSERT —
      // minimizes the window against the other version-id writer (windowed
      // delete, itself guarded against running during an active import).
      // True MAX(id) inline: getCurrentDatasetHmisMaxVersionId is a reader
      // that hides running-run versions and must never mint.
      const maxRows = await sql<{ max_id: number | null }[]>`
        SELECT MAX(id) AS max_id FROM dataset_hmis_versions
      `;
      const newVersionId = (maxRows[0].max_id ?? 0) + 1;
      console.log(`Creating new version ${newVersionId} for dataset hmis`);

      await sql`
        INSERT INTO dataset_hmis_versions
        (
          id, 
          n_rows_total_imported,
          n_rows_inserted,
          n_rows_updated,
          staging_result
        )
        VALUES
        (
          ${newVersionId}, 
          ${stagingResultRaw.finalStagingRowCount},
          0,  -- Will update after counting
          0,  -- Will update after counting
          ${JSON.stringify(stagingResultRaw)}
        )
      `;

      console.log(`Version record ${newVersionId} created`);

      // Update progress: 40% - Version record created
      await updateIntegrationProgress(mainDb, 40);

      // ==================================================
      // PHASE 4: Integration into Main Dataset Table (CSV merge —
      // "absent = keep prior value" semantics are intended and must not change)
      // ==================================================

      // First, update existing rows (much faster than ON CONFLICT)
      const updateResult = await sql`
        UPDATE ${sql(datasetTableName)} dt
        SET
          count = agg.count,
          version_id = ${newVersionId}::INTEGER
        FROM ${sql(aggregatedTableName)} agg
        WHERE
          dt.facility_id = agg.facility_id
          AND dt.indicator_raw_id = agg.indicator_raw_id
          AND dt.period_id = agg.period_id
      `;

      const rowsUpdated = updateResult.count;
      console.log(
        `Updated ${rowsUpdated} existing rows in ${datasetTableName}`
      );

      // Update progress: 40% - Updates complete
      await updateIntegrationProgress(mainDb, 40);

      // Delete the rows we just updated from the staging table
      // This leaves only new rows that need to be inserted
      console.log("Removing updated rows from staging table...");

      await sql`
        DELETE FROM ${sql(aggregatedTableName)} agg
        WHERE EXISTS (
          SELECT 1
          FROM ${sql(datasetTableName)} dt
          WHERE dt.facility_id = agg.facility_id
            AND dt.indicator_raw_id = agg.indicator_raw_id
            AND dt.period_id = agg.period_id
            AND dt.version_id = ${newVersionId}
        )
      `;

      console.log("Staging table now contains only new rows to insert");

      // Update progress: 60% - Staging table cleaned
      await updateIntegrationProgress(mainDb, 60);

      // Insert all remaining rows from staging (they're all new)
      const insertResult = await sql`
        INSERT INTO ${sql(datasetTableName)}
        (facility_id, indicator_raw_id, period_id, count, version_id)
        SELECT
          facility_id,
          indicator_raw_id,
          period_id,
          count,
          ${newVersionId}::INTEGER as version_id
        FROM ${sql(aggregatedTableName)}
      `;

      const rowsInserted = insertResult.count;

      console.log(
        `Integration complete: ${rowsUpdated + rowsInserted} rows affected (${rowsUpdated} updated, ${rowsInserted} inserted) for version ${newVersionId}`
      );

      // ==================================================
      // PHASE 5: Update Version Record with Actual Counts
      // ==================================================

      const totalRowsAffected = rowsUpdated + rowsInserted;
      await sql`
        UPDATE dataset_hmis_versions
        SET
          n_rows_total_imported = ${totalRowsAffected},
          n_rows_inserted = ${rowsInserted},
          n_rows_updated = ${rowsUpdated}
        WHERE id = ${newVersionId}
      `;

      console.log(`Version record ${newVersionId} updated with actual counts`);

      // ==================================================
      // PHASE 5.5: Import Ledger (same transaction — the ledger can never
      // disagree with the data): every pair this version touched.
      // ==================================================

      const touchedPairs = (
        await sql<{ indicator_raw_id: string; period_id: number }[]>`
          SELECT DISTINCT indicator_raw_id, period_id
          FROM ${sql(datasetTableName)}
          WHERE version_id = ${newVersionId}
        `
      ).map((r) => ({
        indicatorRawId: r.indicator_raw_id,
        periodId: r.period_id,
      }));

      await upsertHmisLedgerPairsFromData(
        sql,
        touchedPairs,
        stagingResultRaw.sourceType,
        newVersionId
      );

      console.log(
        `Import ledger updated: ${touchedPairs.length} pairs upserted`
      );

      // Update progress: 70% - Version record updated
      await updateIntegrationProgress(mainDb, 70);
    });

    // Update progress: 80% - Data integrated
    await updateIntegrationProgress(mainDb, 80);

    // ==================================================
    // PHASE 6: Cleanup
    // ==================================================

    // Drop the staging table
    await importDb.unsafe(`DROP TABLE IF EXISTS ${aggregatedTableName}`);

    console.log("Staging table cleaned up");

    // Update progress: 90% - Cleanup complete
    await updateIntegrationProgress(mainDb, 90);

    // Mark the upload attempt as complete instead of deleting
    await mainDb`
      UPDATE dataset_hmis_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "complete" })},
        status_type = 'complete'
    `;

    console.log(`Integration completed successfully for upload attempt `);

    // Close connections properly
    await importDb.end();
    await mainDb.end();

    // Signal successful completion
    self.postMessage("COMPLETED");

    // Successfully completed
  } catch (e) {
    console.error("Failed on integration:", e);

    // Update status to error
    try {
      await mainDb`
        UPDATE dataset_hmis_upload_attempts
        SET 
          status = ${JSON.stringify({
            status: "error",
            err: e instanceof Error ? e.message : "Integration failed",
          })},
          status_type = 'error'
      `;
    } catch {
      // Ignore status update errors
    }

    // Try to clean up staging table if it exists
    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${aggregatedTableName}`);
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

// Helper function to update integration progress
async function updateIntegrationProgress(
  mainDb: Sql,
  progress: number // 0-100 representing percentage
): Promise<void> {
  const status: DatasetUploadAttemptStatus = {
    status: "integrating",
    progress: Math.round(progress),
  };
  await mainDb`
    UPDATE dataset_hmis_upload_attempts
    SET 
      status = ${JSON.stringify(status)},
      status_type = 'integrating'
  `;
}
