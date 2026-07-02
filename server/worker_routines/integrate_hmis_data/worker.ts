import { Sql } from "postgres";
import {
  DBDatasetHmisUploadAttempt,
  createBulkImportConnection,
  createWorkerReadConnection,
  getCurrentDatasetHmisMaxVersionId,
} from "../../db/mod.ts";
import {
  parseJsonOrThrow,
  type DatasetUploadAttemptStatus,
  type DatasetStagingResult,
  type DatasetDhis2StagingResult,
} from "lib";
import { UPLOADED_HMIS_DATA_STAGING_TABLE_NAME } from "../../exposed_env_vars.ts";

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

    // Parse staging result - could be CSV or DHIS2 format
    const stagingResultRaw = parseJsonOrThrow<DatasetStagingResult>(
      rawDUA.step_3_result
    );

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
    // PHASE 2: Get Version ID and Begin Transaction
    // ==================================================

    // Get the version ID fresh at integration time to avoid conflicts
    const currentMaxVersionId = await getCurrentDatasetHmisMaxVersionId(mainDb);
    const newVersionId = (currentMaxVersionId ?? 0) + 1;

    console.log(`Creating new version ${newVersionId} for dataset hmis`);

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

      // Track row counts separately
      let rowsUpdated = 0;
      let rowsInserted = 0;
      let rowsDeleted = 0;

      // Single source of truth for the Phase 4 / Phase 5 branch decision: a
      // DHIS2 attempt staged by post-fix code carries the delete scope; when
      // absent (old staged attempt across a deploy) or CSV, fall back to the
      // legacy merge — degrades safely, no deletes.
      const scopedDelete =
        stagingResultRaw.sourceType === "dhis2" &&
        Array.isArray(stagingResultRaw.succeededWorkItems) &&
        Array.isArray(stagingResultRaw.fetchedFacilityIds)
          ? {
              stagingResult: stagingResultRaw,
              succeededWorkItems: stagingResultRaw.succeededWorkItems,
              fetchedFacilityIds: stagingResultRaw.fetchedFacilityIds,
            }
          : null;

      // ==================================================
      // PHASE 4: Integration into Main Dataset Table
      // ==================================================

      if (scopedDelete) {
        // DHIS2 branch: scoped delete-then-insert. DHIS2 analytics omits
        // zeroed/deleted/never-reported cells, so a merge can never remove
        // them — DHIS2 is authoritative over every (indicator, period) pair
        // that fetched successfully, for exactly the facilities queried.
        const succeeded = scopedDelete.succeededWorkItems;
        const fetchedFacilityIds = scopedDelete.fetchedFacilityIds;

        // Two parallel arrays, same order, for a set-based UNNEST join. Always
        // equal-length by construction — both built from one .map() over `succeeded`.
        const scopeIndicatorIds = succeeded.map((w) => w.indicatorRawId);
        const scopePeriodIds = succeeded.map((w) => w.periodId);

        // 1) Remove existing rows in the successfully-fetched scope, for exactly
        //    the facilities that were queried at staging time (a snapshot, not
        //    re-derived — a facility never queried is never touched, whatever
        //    its id looks like). Pair-wise (indicator, period) match — NOT a
        //    cross product — so a pair that failed to fetch is never deleted.
        const deleteResult = await sql`
          DELETE FROM ${sql(datasetTableName)} dt
          USING UNNEST(
            ${scopeIndicatorIds}::text[],
            ${scopePeriodIds}::int[]
          ) AS s(indicator_raw_id, period_id)
          WHERE dt.indicator_raw_id = s.indicator_raw_id
            AND dt.period_id = s.period_id
            AND dt.facility_id = ANY(${fetchedFacilityIds}::text[])
        `;
        rowsDeleted = deleteResult.count;
        console.log(
          `Deleted ${rowsDeleted} stale rows in ${datasetTableName} (DHIS2 scoped delete)`
        );

        // Update progress: 40% - Delete complete
        await updateIntegrationProgress(mainDb, 40);

        // 2) Insert exactly what DHIS2 returned. DISTINCT ON guards against
        //    DHIS2 returning the same org unit twice across facility batches —
        //    without it, a duplicate (facility_id, indicator_raw_id, period_id)
        //    in the source aborts the whole INSERT ("ON CONFLICT DO UPDATE
        //    command cannot affect row a second time" — Postgres only dedupes
        //    against the TARGET table, never within the inserted batch). After
        //    dedup, the delete just cleared this exact scope, so ON CONFLICT
        //    should never fire in practice; it's a defensive backstop, not the
        //    primary duplicate-handling mechanism.
        const insertResult = await sql`
          INSERT INTO ${sql(datasetTableName)}
            (facility_id, indicator_raw_id, period_id, count, version_id)
          SELECT DISTINCT ON (facility_id, indicator_raw_id, period_id)
            facility_id, indicator_raw_id, period_id, count, ${newVersionId}::INTEGER
          FROM ${sql(aggregatedTableName)}
          ORDER BY facility_id, indicator_raw_id, period_id
          ON CONFLICT (facility_id, indicator_raw_id, period_id)
          DO UPDATE SET count = EXCLUDED.count, version_id = EXCLUDED.version_id
        `;
        rowsInserted = insertResult.count;

        console.log(
          `Integration complete (DHIS2 scoped delete): ${rowsDeleted} deleted, ${rowsInserted} inserted for version ${newVersionId}`
        );

        // Update progress: 60% - Delete/insert complete
        await updateIntegrationProgress(mainDb, 60);
      } else {
        // CSV branch (and DHIS2 staged by pre-fix code, missing the new scope
        // fields): existing merge, unchanged. CSV semantics ("absent = keep
        // prior value") are intended and must not change.

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

        rowsUpdated = updateResult.count;
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

        rowsInserted = insertResult.count;

        console.log(
          `Integration complete: ${rowsUpdated + rowsInserted} rows affected (${rowsUpdated} updated, ${rowsInserted} inserted) for version ${newVersionId}`
        );

        // Update progress: 60% - Inserts complete
        await updateIntegrationProgress(mainDb, 60);
      }

      // ==================================================
      // PHASE 5: Update Version Record with Actual Counts
      // ==================================================

      if (scopedDelete) {
        // DHIS2 branch: no in-place updates happen under scoped delete, so
        // n_rows_updated is honestly 0; n_rows_total_imported means "rows now
        // present because of this import" — deleted rows aren't imported, so
        // they don't belong in this total (rowsInserted, not
        // rowsDeleted + rowsInserted). The real deletion count is real,
        // useful information — it goes into the JSON blob (no migration
        // needed), which also drops fetchedFacilityIds since it's only needed
        // to drive the delete above, not to be kept in version history.
        const versionStagingResult: DatasetDhis2StagingResult = {
          ...scopedDelete.stagingResult,
          fetchedFacilityIds: undefined,
          dhis2RowsDeleted: rowsDeleted,
        };
        await sql`
          UPDATE dataset_hmis_versions
          SET
            n_rows_total_imported = ${rowsInserted},
            n_rows_inserted = ${rowsInserted},
            n_rows_updated = 0,
            staging_result = ${JSON.stringify(versionStagingResult)}
          WHERE id = ${newVersionId}
        `;
      } else {
        const totalRowsAffected = rowsUpdated + rowsInserted;
        await sql`
          UPDATE dataset_hmis_versions
          SET
            n_rows_total_imported = ${totalRowsAffected},
            n_rows_inserted = ${rowsInserted},
            n_rows_updated = ${rowsUpdated}
          WHERE id = ${newVersionId}
        `;
      }

      console.log(`Version record ${newVersionId} updated with actual counts`);

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
