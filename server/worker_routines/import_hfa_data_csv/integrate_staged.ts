import { Sql } from "postgres";
import type { DatasetHfaCsvStagingResult } from "lib";
import { dropHfaStagingTables, hfaStagingTableNames } from "./stage_csv.ts";

// The integration internals relocated from the old integrate_hfa_data worker:
// one transaction that stamps the time point and replaces its data +
// dictionary wholesale. Semantics unchanged — only the table names (per-run)
// and the progress transport differ.
export async function integrateStagedHfaData(args: {
  importDb: Sql;
  mainDb: Sql;
  runId: number;
  stagingResult: DatasetHfaCsvStagingResult;
  onProgress: (percent: number) => Promise<void>;
}): Promise<void> {
  const { importDb, mainDb, runId, stagingResult, onProgress } = args;
  const names = hfaStagingTableNames(runId);
  const timePoint = stagingResult.timePoint;

  const stagingTableCheck = await importDb<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = ${names.final}
    ) as exists
  `;
  if (!stagingTableCheck[0]?.exists) {
    throw new Error(
      `Staging table ${names.final} not found — staging may have failed or been cleaned up. Start the import again.`,
    );
  }

  // Facilities can be deleted while a run holds in needs_review, so the staged
  // set is re-validated against facilities_hfa immediately before the merge.
  const invalidFacilities = await importDb`
    SELECT DISTINCT s.facility_id
    FROM ${importDb(names.final)} s
    LEFT JOIN facilities_hfa f ON s.facility_id = f.facility_id
    WHERE f.facility_id IS NULL
  `;
  if (invalidFacilities.length > 0) {
    const facilityList = invalidFacilities.map((f) => f.facility_id).join(", ");
    throw new Error(
      `Cannot integrate: the following facilities in the staged data no longer exist: ${facilityList}. Start the import again.`,
    );
  }

  await onProgress(10);

  await importDb`ANALYZE ${importDb(names.final)}`;

  await onProgress(20);

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

    await sql`DELETE FROM hfa_data WHERE time_point = ${timePoint}`;
    await sql`DELETE FROM hfa_variables WHERE time_point = ${timePoint}`;

    await onProgress(30);

    await sql.unsafe(`
      INSERT INTO hfa_variables (time_point, var_name, var_label, var_type)
      SELECT time_point, var_name, var_label, var_type FROM ${names.dictVars}
    `);
    await sql.unsafe(`
      INSERT INTO hfa_variable_values (time_point, var_name, value, value_label, sentinel_class)
      SELECT time_point, var_name, value, value_label, sentinel_class FROM ${names.dictValues}
    `);

    await onProgress(50);

    await sql.unsafe(`
      INSERT INTO hfa_data (facility_id, time_point, var_name, value)
      SELECT facility_id, time_point, var_name, value FROM ${names.final}
    `);

    await onProgress(80);
  });

  await onProgress(90);

  await dropHfaStagingTables(importDb, runId, { keepFinal: false });
}
