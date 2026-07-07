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
import {
  UPLOADED_HFA_DATA_STAGING_TABLE_NAME,
  UPLOADED_HFA_DICT_VALUES_STAGING_TABLE_NAME,
  UPLOADED_HFA_DICT_VARS_STAGING_TABLE_NAME,
} from "../../exposed_env_vars.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

async function run(std: {
  rawDUA: DBDatasetHfaUploadAttempt;
}) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { rawDUA } = std;

  const stagingTableName = UPLOADED_HFA_DATA_STAGING_TABLE_NAME;
  const datasetTableName = "hfa_data";

  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  async function updateIntegrationProgress(progress: number) {
    const status: DatasetHfaUploadAttemptStatus = {
      status: "integrating",
      progress,
    };

    await mainDb`
      UPDATE hfa_upload_attempts
      SET
        status = ${JSON.stringify(status)},
        status_type = 'integrating'
    `;
  }

  try {
    if (!rawDUA.step_2_result || !rawDUA.step_3_result) {
      throw new Error("Not yet ready for integration step");
    }

    const stagingResult = parseJsonOrThrow<DatasetHfaCsvStagingResult>(
      rawDUA.step_3_result,
    );

    const timePoint = stagingResult.timePoint;
    const dictVarsStagingTable = stagingResult.dictionaryVarsStagingTableName;
    const dictValuesStagingTable =
      stagingResult.dictionaryValuesStagingTableName;

    // Verify staging table exists
    const stagingTableCheck = await importDb<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = ${stagingTableName}
      ) as exists
    `;

    if (!stagingTableCheck[0]?.exists) {
      throw new Error(
        `Staging table ${stagingTableName} not found - staging may have failed or been cleaned up`,
      );
    }

    // Check for invalid facilities
    const invalidFacilities = await importDb`
      SELECT DISTINCT s.facility_id
      FROM ${importDb(stagingTableName)} s
      LEFT JOIN facilities_hfa f ON s.facility_id = f.facility_id
      WHERE f.facility_id IS NULL
    `;

    if (invalidFacilities.length > 0) {
      const facilityList = invalidFacilities
        .map((f) => f.facility_id)
        .join(", ");
      throw new Error(
        `Cannot integrate: The following facilities in the staged data no longer exist: ${facilityList}. ` +
          `Please re-run staging or update the facilities list.`,
      );
    }

    await updateIntegrationProgress(10);

    await importDb`ANALYZE ${importDb(stagingTableName)}`;

    await updateIntegrationProgress(20);

    // Single transaction: delete existing time_point data + insert new data + dictionary
    await mainDb.begin(async (sql) => {
      await sql`SET LOCAL work_mem = '256MB'`;
      await sql`SET LOCAL synchronous_commit = OFF`;
      await sql`SET LOCAL maintenance_work_mem = '512MB'`;

      // Time points are created via the UI (createHfaTimePoint), never by import
      const stamped = await sql`
        UPDATE hfa_time_points SET imported_at = NOW() WHERE label = ${timePoint}
      `;
      if (stamped.count === 0) {
        throw new Error(
          `Time point "${timePoint}" does not exist. Create it on the HFA time points page before importing data.`,
        );
      }

      // Delete existing data for this time_point
      await sql`DELETE FROM hfa_data WHERE time_point = ${timePoint}`;
      await sql`DELETE FROM hfa_variables WHERE time_point = ${timePoint}`;

      await updateIntegrationProgress(30);

      // Insert dictionary vars from staging
      await sql.unsafe(`
        INSERT INTO hfa_variables (time_point, var_name, var_label, var_type)
        SELECT time_point, var_name, var_label, var_type FROM ${dictVarsStagingTable}
      `);

      // Insert dictionary values from staging
      await sql.unsafe(`
        INSERT INTO hfa_variable_values (time_point, var_name, value, value_label, sentinel_class)
        SELECT time_point, var_name, value, value_label, sentinel_class FROM ${dictValuesStagingTable}
      `);

      await updateIntegrationProgress(50);

      // Insert all HFA data
      await sql`
        INSERT INTO ${sql(datasetTableName)}
        (facility_id, time_point, var_name, value)
        SELECT facility_id, time_point, var_name, value
        FROM ${sql(stagingTableName)}
      `;

      await updateIntegrationProgress(80);
    });

    await updateIntegrationProgress(85);

    // Drop all staging tables
    await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${dictVarsStagingTable}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${dictValuesStagingTable}`);

    await updateIntegrationProgress(90);

    // Mark as complete
    await mainDb`
      UPDATE hfa_upload_attempts
      SET
        status = ${JSON.stringify({
          status: "complete",
          nRowsIntegrated: stagingResult.nRowsTotal,
        })},
        status_type = 'complete'
    `;

    (self as unknown as Worker).postMessage("COMPLETED");
  } catch (error) {
    console.error("Error in integration worker:", error);

    try {
      await mainDb`
        UPDATE hfa_upload_attempts
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

    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
      await importDb.unsafe(
        `DROP TABLE IF EXISTS ${UPLOADED_HFA_DICT_VARS_STAGING_TABLE_NAME}`,
      );
      await importDb.unsafe(
        `DROP TABLE IF EXISTS ${UPLOADED_HFA_DICT_VALUES_STAGING_TABLE_NAME}`,
      );
    } catch (cleanupError) {
      console.error("Failed to clean up staging tables:", cleanupError);
    }

    throw error;
  } finally {
    // Connection teardown only — never self.close() here: closing before the
    // rethrown error reaches the preamble's reportError discards it, so the
    // host's error listener never fires and the worker slot is stranded.
    await importDb.end();
    await mainDb.end();
  }
}
