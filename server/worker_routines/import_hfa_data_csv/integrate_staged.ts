import { Sql } from "postgres";
import type { DatasetHfaCsvStagingResult, HfaCsvMappingParams } from "lib";
import {
  finishHfaRegistryWrite,
  reportHfaRegistryOrphans,
  writeHfaFacilitiesFromImport,
} from "../../db/instance/hfa_facilities.ts";
import type { HfaFileFacility } from "../../server_only_funcs_csvs/scan_hfa_rows.ts";
import { dropHfaStagingTables, hfaStagingTableNames } from "./stage_csv.ts";

// One transaction that stamps the time point, writes the facilities the user
// approved and replaces the round's data and dictionary wholesale. The order
// is forced by the schema: the facility FK on hfa_data is immediate, and the
// composite FK on facilities_hfa needs the admin rows first. The completion
// flip comes last, so on success the run row is 'complete' when this returns.
export async function integrateStagedHfaData(args: {
  importDb: Sql;
  mainDb: Sql;
  runId: number;
  mappings: HfaCsvMappingParams;
  stagingResult: DatasetHfaCsvStagingResult;
  onProgress: (percent: number) => void;
}): Promise<void> {
  const { importDb, mainDb, runId, mappings, stagingResult, onProgress } = args;
  const names = hfaStagingTableNames(runId);
  const timePoint = stagingResult.timePoint;

  const stagingTableCheck = await importDb<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = ${names.facilities}
    ) AND EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = ${names.final}
    ) as exists
  `;
  if (!stagingTableCheck[0]?.exists) {
    throw new Error(
      `Staging tables for run ${runId} not found — staging may have failed or been cleaned up. Start the import again.`,
    );
  }

  await importDb`ANALYZE ${importDb(names.final)}`;

  onProgress(20);

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

    const staged = (
      await sql<{ facility: string; known: boolean }[]>`
        SELECT facility, known FROM ${
        sql(names.facilities)
      } ORDER BY facility_id
      `
    ).map((r) => ({
      facility: JSON.parse(r.facility) as HfaFileFacility,
      known: r.known,
    }));
    const registry = await writeHfaFacilitiesFromImport(sql, {
      file: staged.map((r) => r.facility),
      facilityColumns: mappings.facilityColumns,
      timePoint,
      decisions: mappings.facilityChanges,
      recodes: mappings.recodes,
    });
    // A facility known at staging and removed from the registry during a
    // hold would otherwise lose its data here unseen, as a new facility with
    // no admin tuple.
    const knownAtStaging = new Set(
      staged.filter((r) => r.known).map((r) => r.facility.facilityId),
    );
    const removedDuringHold = registry.skippedFacilityIds.filter((id) =>
      knownAtStaging.has(id)
    );
    if (removedDuringHold.length > 0) {
      throw new Error(
        `Facilities left the HFA registry after staging and the file has no complete admin areas for them: ${
          removedDuringHold.slice(0, 10).join(", ")
        }. Start the import again.`,
      );
    }

    onProgress(40);

    await sql.unsafe(`
      INSERT INTO hfa_variables (time_point, variable_id, variable_label, variable_type)
      SELECT time_point, variable_id, variable_label, variable_type FROM ${names.dictVars}
    `);
    await sql.unsafe(`
      INSERT INTO hfa_variable_values (time_point, variable_id, value, value_label, sentinel_class)
      SELECT time_point, variable_id, value, value_label, sentinel_class FROM ${names.dictValues}
    `);

    onProgress(50);

    const inserted = await sql`
      INSERT INTO hfa_data (facility_id, time_point, variable_id, value)
      SELECT facility_id, time_point, variable_id, value FROM ${
      sql(names.final)
    }
      WHERE facility_id <> ALL(${registry.skippedFacilityIds}::text[])
    `;

    onProgress(80);

    await finishHfaRegistryWrite(sql, registry.registryChanged);

    const diagnostics: DatasetHfaCsvStagingResult = {
      ...stagingResult,
      facilityMatch: registry.match,
      facilityChanges: registry.changeCounts,
      facilitiesWithoutAdminTuple: registry.facilitiesWithoutAdminTuple,
      ...(await reportHfaRegistryOrphans(sql)),
    };

    // The completion flip lives INSIDE the merge transaction, conditional on
    // the run still being 'running', and comes LAST (so the run-row lock is
    // held only for the final instant). This closes the cancel-vs-commit
    // race in both directions: a cancel that flips the row first makes this
    // match zero rows and the throw rolls the whole merge back (a run marked
    // cancelled has truly integrated nothing); a merge that commits has
    // atomically marked itself complete, so a blocked cancel then no-ops.
    const flipped = await sql`
      UPDATE hfa_import_runs
      SET status = 'complete', ended_at = now(), progress = NULL,
        diagnostics = ${JSON.stringify(diagnostics)},
        n_rows_integrated = ${inserted.count}
      WHERE id = ${runId} AND status = 'running'
    `;
    if (flipped.count === 0) {
      throw new Error(
        "The run was cancelled during integration — nothing was merged.",
      );
    }
  });

  onProgress(90);

  await dropHfaStagingTables(importDb, runId, { keepFinal: false });
}
