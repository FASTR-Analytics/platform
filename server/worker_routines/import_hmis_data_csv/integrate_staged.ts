import { Sql } from "postgres";
import { upsertHmisLedgerPairsFromData } from "../../db/mod.ts";
import type { DatasetCsvStagingResult } from "lib";
import { hmisCsvStagingTableNames } from "./stage_csv.ts";

// The single-transaction CSV integration relocated from the old
// integrate_hmis_data worker — semantics unchanged (version minted MAX(id)
// inline, "absent = keep prior value" merge, ledger writes in the same
// transaction). Only the staging-table name (per-run) and the run linkage
// differ: version_id AND the completion flip land on the run row together as
// the transaction's last statement (see below). On success the run row is
// 'complete' when this returns.
export async function integrateStagedHmisCsvData(args: {
  importDb: Sql;
  mainDb: Sql;
  runId: number;
  stagingResult: DatasetCsvStagingResult;
  onProgress: (percent: number) => void;
}): Promise<{ versionId: number; rowsInserted: number; rowsUpdated: number }> {
  const { importDb, mainDb, runId, stagingResult, onProgress } = args;
  const stagingTableName = hmisCsvStagingTableNames(runId).final;
  const datasetTableName = "dataset_hmis";

  const aggregatedTableCheck = await importDb<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = ${stagingTableName}
    ) as exists
  `;
  if (!aggregatedTableCheck[0]?.exists) {
    throw new Error(
      `Staging table ${stagingTableName} not found — staging may have failed or been cleaned up. Start the import again.`,
    );
  }

  // The staging table and the recorded staging result are separate artifacts
  // that can desynchronize (UNLOGGED table truncated by a Postgres crash, a
  // killed re-stage). Integration only proceeds when the table holds exactly
  // the rows the recorded result describes.
  const stagingRowCount = await importDb<{ count: string | number }[]>`
    SELECT COUNT(*) as count FROM ${importDb(stagingTableName)}
  `;
  const actualRows = Number(stagingRowCount[0].count);
  const recordedRows = Number(stagingResult.finalStagingRowCount);
  if (actualRows !== recordedRows) {
    throw new Error(
      `Staging table holds ${actualRows} rows but the staging result recorded ${recordedRows}. ` +
        `The staged data no longer matches what was reviewed (interrupted re-stage or database crash). ` +
        `Start the import again.`,
    );
  }

  const invalidFacilities = await importDb<{ facility_id: string }[]>`
    SELECT DISTINCT a.facility_id
    FROM ${importDb(stagingTableName)} a
    LEFT JOIN facilities_hmis f ON a.facility_id = f.facility_id
    WHERE f.facility_id IS NULL
  `;
  if (invalidFacilities.length > 0) {
    const facilityList = invalidFacilities.map((f) => f.facility_id).join(", ");
    throw new Error(
      `Cannot integrate: The following facilities in the staged data no longer exist: ${facilityList}. ` +
        `Start the import again or update the facilities list.`,
    );
  }

  onProgress(10);

  await importDb`ANALYZE ${importDb(stagingTableName)}`;
  await mainDb`ANALYZE ${mainDb(datasetTableName)}`;

  onProgress(20);

  let rowsUpdated = 0;
  let rowsInserted = 0;
  let versionId = 0;

  await mainDb.begin(async (sql) => {
    await sql`SET LOCAL work_mem = '256MB'`;
    await sql`SET LOCAL synchronous_commit = OFF`;
    await sql`SET LOCAL maintenance_work_mem = '512MB'`;

    // Version id minted inside the transaction, right before its INSERT —
    // true MAX(id) inline (version READERS hide running-run versions and
    // must never mint).
    const maxRows = await sql<{ max_id: number | null }[]>`
      SELECT MAX(id) AS max_id FROM dataset_hmis_versions
    `;
    versionId = (maxRows[0].max_id ?? 0) + 1;

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
        ${versionId},
        ${stagingResult.finalStagingRowCount},
        0,
        0,
        ${JSON.stringify(stagingResult)}
      )
    `;

    onProgress(40);

    // CSV merge — "absent = keep prior value" semantics are intended and
    // must not change. Update existing rows first (faster than ON CONFLICT).
    const updateResult = await sql`
      UPDATE ${sql(datasetTableName)} dt
      SET
        count = agg.count,
        version_id = ${versionId}::INTEGER
      FROM ${sql(stagingTableName)} agg
      WHERE
        dt.facility_id = agg.facility_id
        AND dt.indicator_raw_id = agg.indicator_raw_id
        AND dt.period_id = agg.period_id
    `;
    rowsUpdated = updateResult.count;

    await sql`
      DELETE FROM ${sql(stagingTableName)} agg
      WHERE EXISTS (
        SELECT 1
        FROM ${sql(datasetTableName)} dt
        WHERE dt.facility_id = agg.facility_id
          AND dt.indicator_raw_id = agg.indicator_raw_id
          AND dt.period_id = agg.period_id
          AND dt.version_id = ${versionId}
      )
    `;

    onProgress(60);

    const insertResult = await sql`
      INSERT INTO ${sql(datasetTableName)}
      (facility_id, indicator_raw_id, period_id, count, version_id)
      SELECT
        facility_id,
        indicator_raw_id,
        period_id,
        count,
        ${versionId}::INTEGER as version_id
      FROM ${sql(stagingTableName)}
    `;
    rowsInserted = insertResult.count;

    const totalRowsAffected = rowsUpdated + rowsInserted;
    await sql`
      UPDATE dataset_hmis_versions
      SET
        n_rows_total_imported = ${totalRowsAffected},
        n_rows_inserted = ${rowsInserted},
        n_rows_updated = ${rowsUpdated}
      WHERE id = ${versionId}
    `;

    // Import ledger in the same transaction — the ledger can never disagree
    // with the data.
    const touchedPairs = (
      await sql<{ indicator_raw_id: string; period_id: number }[]>`
        SELECT DISTINCT indicator_raw_id, period_id
        FROM ${sql(datasetTableName)}
        WHERE version_id = ${versionId}
      `
    ).map((r) => ({
      indicatorRawId: r.indicator_raw_id,
      periodId: r.period_id,
    }));

    await upsertHmisLedgerPairsFromData(sql, touchedPairs, "csv", versionId);

    onProgress(70);

    // Single run-row write, LAST in the transaction (PROTOCOL_APP_WORKER_
    // ROUTINES.md "Gotchas"): version link + completion flip together, so the
    // run-row lock is held only for the final instant and version_id can never
    // be observed without status='complete'. Guarded on status='running': a
    // cancel that landed first matches zero rows and the throw rolls the whole
    // merge back (a run marked cancelled has truly integrated nothing); a
    // merge that commits has atomically marked itself complete, so a blocked
    // cancel then no-ops.
    const flipped = await sql`
      UPDATE dataset_hmis_import_runs
      SET version_id = ${versionId}, status = 'complete', ended_at = now(),
        progress = NULL,
        run_stats = ${JSON.stringify({ csvStagingResult: stagingResult })}
      WHERE id = ${runId} AND status = 'running'
    `;
    if (flipped.count === 0) {
      throw new Error(
        "The run was cancelled during integration — nothing was merged.",
      );
    }
  });

  onProgress(80);

  await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);

  onProgress(90);

  return { versionId, rowsInserted, rowsUpdated };
}
