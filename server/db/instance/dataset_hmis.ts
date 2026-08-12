import {
  _GLOBAL_MAX_YEAR_FOR_PERIODS,
  _GLOBAL_MIN_YEAR_FOR_PERIODS,
} from "@timroberton/panther";
import { Sql } from "postgres";
import type {
  DatasetHmisWindowingRaw,
  StructureSchema,
} from "lib";
import {
  APIResponseNoData,
  APIResponseWithData,
  DatasetHmisDetail,
  parseAa3CompositeKey,
  PeriodBounds,
  parseJsonOrUndefined,
  throwIfErrWithData,
  type DatasetHmisVersion,
  type DatasetStagingResult,
  type IndicatorType,
  type ItemsHolderDatasetHmisDisplay,
} from "lib";
import { escapeSqlString, tryCatchDatabaseAsync } from "../utils.ts";
import { reconcileHmisLedgerPairsAfterDelete } from "./dataset_hmis_import_ledger.ts";
import { assertNoRunningDatasetHmisImportRun } from "./dataset_hmis_import_runs.ts";
import type { DBDatasetHmisVersion } from "./_main_database_types.ts";

//////////////////////////////////////////////////////
//  _______               __                __  __  //
// /       \             /  |              /  |/  | //
// $$$$$$$  |  ______   _$$ |_     ______  $$/ $$ | //
// $$ |  $$ | /      \ / $$   |   /      \ /  |$$ | //
// $$ |  $$ |/$$$$$$  |$$$$$$/    $$$$$$  |$$ |$$ | //
// $$ |  $$ |$$    $$ |  $$ | __  /    $$ |$$ |$$ | //
// $$ |__$$ |$$$$$$$$/   $$ |/  |/$$$$$$$ |$$ |$$ | //
// $$    $$/ $$       |  $$  $$/ $$    $$ |$$ |$$ | //
// $$$$$$$/   $$$$$$$/    $$$$/   $$$$$$$/ $$/ $$/  //
//                                                  //
//////////////////////////////////////////////////////

export async function getDatasetHmisDetail(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHmisDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const resVersions = await getVersionsForDatasetHmis(mainDb);
    if (resVersions.success === false) {
      return resVersions;
    }
    const dataset: DatasetHmisDetail = {
      currentVersionId: resVersions.data.at(0)?.id,
      nVersions: resVersions.data.length,
    };
    return { success: true, data: dataset };
  });
}

////////////////////////////////////////////////////////////////////////////////
//  __     __                               __                                //
// /  |   /  |                             /  |                               //
// $$ |   $$ | ______    ______    _______ $$/   ______   _______    _______  //
// $$ |   $$ |/      \  /      \  /       |/  | /      \ /       \  /       | //
// $$  \ /$$//$$$$$$  |/$$$$$$  |/$$$$$$$/ $$ |/$$$$$$  |$$$$$$$  |/$$$$$$$/  //
//  $$  /$$/ $$    $$ |$$ |  $$/ $$      \ $$ |$$ |  $$ |$$ |  $$ |$$      \  //
//   $$ $$/  $$$$$$$$/ $$ |       $$$$$$  |$$ |$$ \__$$ |$$ |  $$ | $$$$$$  | //
//    $$$/   $$       |$$ |      /     $$/ $$ |$$    $$/ $$ |  $$ |/     $$/  //
//     $/     $$$$$$$/ $$/       $$$$$$$/  $$/  $$$$$$/  $$/   $$/ $$$$$$$/   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// A running DHIS2 run's version row is INVISIBLE to every reader until the
// run ends: per-pair integration keeps mutating dataset_hmis under that id
// for the run's whole duration, and every version-keyed cache (the client
// IndexedDB display cache, viz-query staleness hashes) assumes a visible
// version id names a settled data state. Hiding the row until the run ends
// makes the cache token flip exactly once, at run end. All version
// READERS carry this exclusion; version-MINTING paths must not use them —
// they compute MAX(id) inline in their own transaction (run worker, CSV
// integrate worker, windowed delete).
export async function getVersionsForDatasetHmis(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHmisVersion[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const csvVersions = (
      await mainDb<
        DBDatasetHmisVersion[]
      >`SELECT * FROM dataset_hmis_versions
        WHERE id NOT IN (
          SELECT version_id FROM dataset_hmis_import_runs
          WHERE status = 'running' AND version_id IS NOT NULL
        )
        ORDER BY id DESC`
    ).map<DatasetHmisVersion>((rawDatatableVersion) => {
      return {
        id: rawDatatableVersion.id,
        nRowsTotalImported: rawDatatableVersion.n_rows_total_imported,
        nRowsInserted: rawDatatableVersion.n_rows_inserted ?? undefined,
        nRowsUpdated: rawDatatableVersion.n_rows_updated ?? undefined,
        stagingResult: rawDatatableVersion.staging_result
          ? parseJsonOrUndefined<DatasetStagingResult>(
              rawDatatableVersion.staging_result
            )
          : undefined,
      };
    });
    return { success: true, data: csvVersions };
  });
}

// New deletion functions for datasets without version_id

export async function deleteAllDatasetHmisData(
  mainDb: Sql,
  windowing: DatasetHmisWindowingRaw
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // A delete minting a version id while an integration is mid-transaction
    // can collide with the integration's MAX(id)+1 and roll back the whole
    // merge at the end — refuse while an import run is running (CSV imports
    // are runs too, so the single runs-table check covers every import).
    // The reverse direction (a run LAUNCHING mid-delete) is deliberately not
    // claimed against: a mint collision aborts exactly one side's transaction
    // loudly, and the ledger reconcile/recompute reads dataset_hmis in-txn,
    // so both outcomes stay consistent.
    await assertNoRunningDatasetHmisImportRun(mainDb);

    // Build WHERE conditions based on windowing
    const conditions: string[] = [];

    // Period filtering
    conditions.push(`period_id >= ${windowing.start}`);
    conditions.push(`period_id <= ${windowing.end}`);

    // Indicator filtering
    if (
      !windowing.takeAllIndicators &&
      windowing.rawIndicatorsToInclude.length > 0
    ) {
      const indicatorList = windowing.rawIndicatorsToInclude
        .map((ind) => `'${escapeSqlString(ind)}'`)
        .join(", ");
      conditions.push(`indicator_raw_id IN (${indicatorList})`);
    }

    // Build admin area facility subquery — AA3 takes priority over AA2
    let facilitySubquery: string | undefined;
    const delAa3Items = windowing.adminArea3sToInclude ?? [];
    if (!(windowing.takeAllAdminArea3s ?? true) && delAa3Items.length > 0) {
      const pairs = delAa3Items.map((key) => parseAa3CompositeKey(key));
      facilitySubquery = `SELECT facility_id FROM facilities_hmis WHERE (admin_area_3, admin_area_2) IN (VALUES ${pairs
        .map(
          (p) =>
            `('${escapeSqlString(p.aa3)}', '${escapeSqlString(p.aa2)}')`
        )
        .join(", ")})`;
    } else if (
      !windowing.takeAllAdminArea2s &&
      windowing.adminArea2sToInclude.length > 0
    ) {
      const adminAreaList = windowing.adminArea2sToInclude
        .map((aa) => `'${escapeSqlString(aa)}'`)
        .join(", ");
      facilitySubquery = `SELECT facility_id FROM facilities_hmis WHERE admin_area_2 IN (${adminAreaList})`;
    }

    // Delete and version-record insert in one transaction: the recorded
    // count is the actual DELETE rowcount (not a separate pre-count that can
    // drift), and no deletion can land without its version record.
    const whereClause = facilitySubquery
      ? `facility_id IN (${facilitySubquery}) AND ${conditions.join(" AND ")}`
      : conditions.join(" AND ");

    await mainDb.begin(async (sql) => {
      // Captured before the DELETE so the ledger reconcile below knows which
      // (indicator, period) pairs to re-count — a facility-scoped deletion
      // can leave a pair partially populated.
      const affectedPairs = (
        await sql.unsafe<{ indicator_raw_id: string; period_id: number }[]>(`
          SELECT DISTINCT indicator_raw_id, period_id
          FROM dataset_hmis
          WHERE ${whereClause}
        `)
      ).map((r) => ({
        indicatorRawId: r.indicator_raw_id,
        periodId: r.period_id,
      }));

      // Zero-count ledger rows (DHIS2 "checked, empty" and error-only pairs)
      // have no dataset_hmis rows, so the scan above can't see them. A
      // non-facility-scoped deletion wipes the pair's whole window, so those
      // records go too; a facility-scoped deletion keeps them (partial
      // deletion doesn't invalidate pair-level state).
      const ledgerPairs = facilitySubquery
        ? []
        : (
            await sql.unsafe<
              { indicator_raw_id: string; period_id: number }[]
            >(`
              SELECT indicator_raw_id, period_id
              FROM dataset_hmis_import_ledger
              WHERE ${conditions.join(" AND ")}
            `)
          ).map((r) => ({
            indicatorRawId: r.indicator_raw_id,
            periodId: r.period_id,
          }));

      const deleteResult = await sql.unsafe(`
        DELETE FROM dataset_hmis
        WHERE ${whereClause}
      `);
      const deleteCount = deleteResult.count;

      if (deleteCount === 0 && ledgerPairs.length === 0) {
        return;
      }
      if (deleteCount === 0) {
        // Nothing deleted from dataset_hmis (no version record to mint), but
        // the window still holds zero-count ledger records to clear.
        await reconcileHmisLedgerPairsAfterDelete(sql, ledgerPairs);
        return;
      }

      const currentMaxVersionId = await sql<{ max: number | null }[]>`
        SELECT MAX(id) as max FROM dataset_hmis_versions
      `;
      const newVersionId = (currentMaxVersionId[0].max ?? 0) + 1;

      // Negative counts indicate deletion
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
          ${-deleteCount},
          ${-deleteCount},
          0,
          ${JSON.stringify({
            sourceType: "deletion",
            windowing: windowing,
            rowsDeleted: deleteCount,
            dateImported: new Date().toISOString(),
          })}
        )
      `;

      await reconcileHmisLedgerPairsAfterDelete(sql, [
        ...affectedPairs,
        ...ledgerPairs,
      ]);
    });

    return { success: true };
  });
}

////////////////////////////////////////////////////////
//  ______  __                                        //
// /      |/  |                                       //
// $$$$$$/_$$ |_     ______   _____  ____    _______  //
//   $$ |/ $$   |   /      \ /     \/    \  /       | //
//   $$ |$$$$$$/   /$$$$$$  |$$$$$$ $$$$  |/$$$$$$$/  //
//   $$ |  $$ | __ $$    $$ |$$ | $$ | $$ |$$      \  //
//  _$$ |_ $$ |/  |$$$$$$$$/ $$ | $$ | $$ | $$$$$$  | //
// / $$   |$$  $$/ $$       |$$ | $$ | $$ |/     $$/  //
// $$$$$$/  $$$$/   $$$$$$$/ $$/  $$/  $$/ $$$$$$$/   //
//                                                    //
////////////////////////////////////////////////////////

///////////////////////
//                   //
//    FOR DISPLAY    //
//                   //
///////////////////////

type SharedDataForDisplay = {
  structureSchema: StructureSchema;
  adminArea2s: string[];
  adminArea3s?: { admin_area_3: string; admin_area_2: string }[];
  facilityTypes?: string[];
  facilityOwnership?: string[];
};

export async function getDatasetHmisItemsForDisplay(
  mainDb: Sql,
  versionId: number | undefined,
  indicatorMappingsVersion: string | undefined,
  rawOrCommonIndicators: IndicatorType,
  structureSchema: StructureSchema
): Promise<APIResponseWithData<ItemsHolderDatasetHmisDisplay>> {
  return await tryCatchDatabaseAsync(async () => {
    // Query common data used by both raw and common functions. The windowing
    // tree is HMIS data's own registry tree — HFA areas are structurally gone.
    const adminArea2s = (
      await mainDb<
        { admin_area_2: string }[]
      >`SELECT admin_area_2 FROM admin_areas_hmis_2 ORDER BY LOWER(admin_area_2)`
    ).map<string>((aa) => aa.admin_area_2);

    let adminArea3s:
      | { admin_area_3: string; admin_area_2: string }[]
      | undefined;
    if (structureSchema.adminDepth >= 3) {
      adminArea3s = await mainDb<
        { admin_area_3: string; admin_area_2: string }[]
      >`SELECT admin_area_3, admin_area_2 FROM admin_areas_hmis_3
        ORDER BY LOWER(admin_area_2), LOWER(admin_area_3)`;
    }

    // Conditionally query facility types if enabled
    let facilityTypes: string[] | undefined;
    if (structureSchema.includeTypes) {
      facilityTypes = (
        await mainDb<
          { facility_type: string }[]
        >`SELECT DISTINCT facility_type FROM facilities_hmis
          WHERE facility_type IS NOT NULL
          ORDER BY facility_type`
      ).map<string>((ft) => ft.facility_type);
    }

    // Conditionally query facility ownership if enabled
    let facilityOwnership: string[] | undefined;
    if (structureSchema.includeOwnership) {
      facilityOwnership = (
        await mainDb<
          { facility_ownership: string }[]
        >`SELECT DISTINCT facility_ownership FROM facilities_hmis
          WHERE facility_ownership IS NOT NULL
          ORDER BY facility_ownership`
      ).map<string>((fo) => fo.facility_ownership);
    }

    const sharedData: SharedDataForDisplay = {
      structureSchema,
      adminArea2s,
      adminArea3s,
      facilityTypes,
      facilityOwnership,
    };

    const result =
      rawOrCommonIndicators === "raw"
        ? await getDatasetHmisItemsForDisplayRaw(
            mainDb,
            versionId,
            indicatorMappingsVersion,
            sharedData
          )
        : await getDatasetHmisItemsForDisplayCommon(
            mainDb,
            versionId,
            indicatorMappingsVersion,
            sharedData
          );

    return result;
  });
}

async function getDatasetHmisItemsForDisplayRaw(
  mainDb: Sql,
  versionId: number | undefined,
  indicatorMappingsVersion: string | undefined,
  sharedData: SharedDataForDisplay
): Promise<APIResponseWithData<ItemsHolderDatasetHmisDisplay>> {
  return await tryCatchDatabaseAsync(async () => {
    // Ledger reads (~1,440 rows for Nigeria) instead of a GROUP BY scan over
    // dataset_hmis (tens of millions of rows) — the ledger is maintained
    // inside every integration/deletion transaction, so it always agrees.
    // n_records > 0 keeps display behavior identical: zero-count "checked,
    // empty" and error-only pairs are checklist information, not data cells.
    const vizItems = await mainDb<Record<string, string>[]>`
  SELECT n_records::bigint AS count, sum_count AS sum, indicator_raw_id AS indicator_id, period_id
  FROM dataset_hmis_import_ledger
  WHERE n_records > 0
`;

    const indicators = await mainDb<
      { indicator_raw_id: string; common_ids: string | null }[]
    >`
  SELECT
    dh.indicator_raw_id,
    STRING_AGG(im.indicator_common_id, ', ' ORDER BY im.indicator_common_id) as common_ids
  FROM (
    SELECT DISTINCT indicator_raw_id
    FROM dataset_hmis_import_ledger
    WHERE n_records > 0
  ) dh
  LEFT JOIN indicator_mappings im ON dh.indicator_raw_id = im.indicator_raw_id
  GROUP BY dh.indicator_raw_id
  ORDER BY dh.indicator_raw_id
`.then((results) =>
      results.map<{ value: string; label: string }>((row) => ({
        value: row.indicator_raw_id,
        label: row.common_ids
          ? `${row.indicator_raw_id} (${row.common_ids})`
          : row.indicator_raw_id,
      }))
    );

    const indicatorLabelReplacements: Record<string, string> = {};
    for (const ind of indicators) {
      indicatorLabelReplacements[ind.value] = ind.label;
    }

    // Get period bounds
    const periodBoundsResult = await mainDb<
      { min_period: number; max_period: number }[]
    >`SELECT
        MIN(period_id) as min_period,
        MAX(period_id) as max_period
      FROM dataset_hmis_import_ledger
      WHERE n_records > 0`;

    const periodBounds: PeriodBounds = {
      min:
        periodBoundsResult[0]?.min_period ??
        _GLOBAL_MIN_YEAR_FOR_PERIODS * 100 + 1,
      max:
        periodBoundsResult[0]?.max_period ??
        _GLOBAL_MAX_YEAR_FOR_PERIODS * 100 + 12,
    };

    const ih: ItemsHolderDatasetHmisDisplay = {
      rawOrCommonIndicators: "raw",
      structureSchema: sharedData.structureSchema,
      versionId,
      indicatorMappingsVersion,
      vizItems,
      indicatorLabelReplacements,
      indicators,
      adminArea2s: sharedData.adminArea2s,
      adminArea3s: sharedData.adminArea3s,
      periodBounds,
      facilityTypes: sharedData.facilityTypes,
      facilityOwnership: sharedData.facilityOwnership,
    };

    return { success: true, data: ih };
  });
}

async function getDatasetHmisItemsForDisplayCommon(
  mainDb: Sql,
  versionId: number | undefined,
  indicatorMappingsVersion: string | undefined,
  sharedData: SharedDataForDisplay
): Promise<APIResponseWithData<ItemsHolderDatasetHmisDisplay>> {
  return await tryCatchDatabaseAsync(async () => {
    // Ledger + mappings join instead of scanning dataset_hmis (see the raw
    // variant above). `count` is the summed raw record count per (common,
    // period) — a facility reporting two raw indicators mapped to the same
    // common id counts twice, where the old per-facility aggregation counted
    // it once (PLAN_DHIS2_IMPORTER §6 ruled the join+SUM read).
    const vizItems = await mainDb<Record<string, string>[]>`
      SELECT SUM(l.n_records) AS count, SUM(l.sum_count) AS sum, im.indicator_common_id AS indicator_id, l.period_id
      FROM dataset_hmis_import_ledger l
      INNER JOIN indicator_mappings im ON l.indicator_raw_id = im.indicator_raw_id
      WHERE l.n_records > 0
      GROUP BY im.indicator_common_id, l.period_id
    `;

    const indicators = await mainDb<
      { indicator_common_id: string; indicator_common_label: string }[]
    >`
      SELECT DISTINCT im.indicator_common_id, i.indicator_common_label
      FROM dataset_hmis_import_ledger l
      INNER JOIN indicator_mappings im ON l.indicator_raw_id = im.indicator_raw_id
      INNER JOIN indicators i ON im.indicator_common_id = i.indicator_common_id
      WHERE l.n_records > 0
      ORDER BY im.indicator_common_id
    `.then((results) =>
      results.map<{ value: string; label: string }>((row) => ({
        value: row.indicator_common_id,
        label: row.indicator_common_label,
      }))
    );

    const indicatorLabelReplacements: Record<string, string> = {};
    for (const ind of indicators) {
      indicatorLabelReplacements[ind.value] = ind.label;
    }

    // Get period bounds
    const periodBoundsResult = await mainDb<
      { min_period: number; max_period: number }[]
    >`SELECT
        MIN(period_id) as min_period,
        MAX(period_id) as max_period
      FROM dataset_hmis_import_ledger l
      WHERE l.n_records > 0
        AND EXISTS (
          SELECT 1 FROM indicator_mappings im
          WHERE l.indicator_raw_id = im.indicator_raw_id
        )`;

    const periodBounds: PeriodBounds = {
      min:
        periodBoundsResult[0]?.min_period ??
        _GLOBAL_MIN_YEAR_FOR_PERIODS * 100 + 1,
      max:
        periodBoundsResult[0]?.max_period ??
        _GLOBAL_MAX_YEAR_FOR_PERIODS * 100 + 12,
    };

    const ih: ItemsHolderDatasetHmisDisplay = {
      rawOrCommonIndicators: "common",
      structureSchema: sharedData.structureSchema,
      versionId,
      indicatorMappingsVersion,
      vizItems,
      indicatorLabelReplacements,
      indicators,
      adminArea2s: sharedData.adminArea2s,
      adminArea3s: sharedData.adminArea3s,
      periodBounds,
      facilityTypes: sharedData.facilityTypes,
      facilityOwnership: sharedData.facilityOwnership,
    };

    return { success: true, data: ih };
  });
}


// Reader — running-run versions excluded; see getVersionsForDatasetHmis.
// Never use for minting a version id.
export async function getCurrentDatasetHmisMaxVersionId(
  mainDb: Sql
): Promise<number | undefined> {
  const maxId = (
    await mainDb<{ max_id: number }[]>`
SELECT MAX(id) AS max_id FROM dataset_hmis_versions
WHERE id NOT IN (
  SELECT version_id FROM dataset_hmis_import_runs
  WHERE status = 'running' AND version_id IS NOT NULL
)
`
  ).at(0)?.max_id;
  return typeof maxId === "number" ? maxId : undefined;
}

// Reader — running-run versions excluded; see getVersionsForDatasetHmis.
export async function getCurrentDatasetHmisVersion(
  mainDb: Sql
): Promise<DatasetHmisVersion | undefined> {
  const rawDatasetVersion = (
    await mainDb<DBDatasetHmisVersion[]>`
SELECT * FROM dataset_hmis_versions
WHERE id NOT IN (
  SELECT version_id FROM dataset_hmis_import_runs
  WHERE status = 'running' AND version_id IS NOT NULL
)
ORDER BY id DESC
LIMIT 1
`
  ).at(0);
  if (!rawDatasetVersion) {
    return undefined;
  }
  const datasetVersion: DatasetHmisVersion = {
    id: rawDatasetVersion.id,
    nRowsTotalImported: rawDatasetVersion.n_rows_total_imported,
    nRowsInserted: rawDatasetVersion.n_rows_inserted ?? undefined,
    nRowsUpdated: rawDatasetVersion.n_rows_updated ?? undefined,
    stagingResult: rawDatasetVersion.staging_result
      ? parseJsonOrUndefined<DatasetStagingResult>(
          rawDatasetVersion.staging_result
        )
      : undefined,
  };
  return datasetVersion;
}
