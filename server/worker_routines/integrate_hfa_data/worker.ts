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
  HfaCsvMappingParams,
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
  const datasetTableName = "dataset_hfa";

  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  async function updateIntegrationProgress(
    progress: number,
    result?: { versionId: number; nRowsIntegrated: number },
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
    if (!rawDUA.step_2_result || !rawDUA.step_3_result) {
      throw new Error("Not yet ready for integration step");
    }

    const mappings = parseJsonOrThrow<HfaCsvMappingParams>(rawDUA.step_2_result);
    const timePointLabel = mappings.timePointLabel;

    const stagingResult = parseJsonOrThrow<DatasetHfaCsvStagingResult>(
      rawDUA.step_3_result,
    );

    const timePointValue = stagingResult.timePointValue;
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
      LEFT JOIN facilities f ON s.facility_id = f.facility_id
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

    const dateImported = new Date().toISOString();

    // Single transaction: delete existing time_point data + insert new data + dictionary
    await mainDb.begin(async (sql) => {
      await sql`SET LOCAL work_mem = '256MB'`;
      await sql`SET LOCAL synchronous_commit = OFF`;
      await sql`SET LOCAL maintenance_work_mem = '512MB'`;

      // Delete existing data for this time_point (preserve time_point row for indicator code FK)
      await sql`DELETE FROM dataset_hfa WHERE time_point = ${timePointValue}`;
      await sql`DELETE FROM dataset_hfa_dictionary_vars WHERE time_point = ${timePointValue}`;

      await updateIntegrationProgress(30);

      // UPSERT time_point (preserves hfa_indicator_code FK references)
      await sql`
        INSERT INTO dataset_hfa_dictionary_time_points (time_point, time_point_label, date_imported)
        VALUES (${timePointValue}, ${timePointLabel}, ${dateImported})
        ON CONFLICT (time_point) DO UPDATE SET
          time_point_label = EXCLUDED.time_point_label,
          date_imported = EXCLUDED.date_imported
      `;

      // Auto-copy indicator code from most recent existing time_point
      await sql`
        INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
        SELECT var_name, ${timePointValue}, r_code, r_filter_code
        FROM hfa_indicator_code
        WHERE time_point = (
          SELECT tp.time_point FROM dataset_hfa_dictionary_time_points tp
          WHERE tp.time_point != ${timePointValue}
          ORDER BY tp.date_imported DESC NULLS LAST
          LIMIT 1
        )
        ON CONFLICT DO NOTHING
      `;

      // Insert dictionary vars from staging
      await sql.unsafe(`
        INSERT INTO dataset_hfa_dictionary_vars (time_point, var_name, var_label, var_type)
        SELECT time_point, var_name, var_label, var_type FROM ${dictVarsStagingTable}
      `);

      // Insert dictionary values from staging
      await sql.unsafe(`
        INSERT INTO dataset_hfa_dictionary_values (time_point, var_name, value, value_label)
        SELECT time_point, var_name, value, value_label FROM ${dictValuesStagingTable}
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
      UPDATE dataset_hfa_upload_attempts
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
    await importDb.end();
    await mainDb.end();
    self.close();
  }
}
