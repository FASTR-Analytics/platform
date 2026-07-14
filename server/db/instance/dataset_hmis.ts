import {
  _GLOBAL_MAX_YEAR_FOR_PERIODS,
  _GLOBAL_MIN_YEAR_FOR_PERIODS,
} from "@timroberton/panther";
import { Sql } from "postgres";
import { UPLOADED_HMIS_DATA_STAGING_TABLE_NAME } from "../../exposed_env_vars.ts";
import { resolveAssetFilePath } from "./assets.ts";
import type {
  DatasetHmisWindowingRaw,
  InstanceConfigFacilityColumns,
} from "lib";
import {
  APIResponseNoData,
  APIResponseWithData,
  DatasetHmisDetail,
  DatasetUploadAttemptDetail,
  DatasetUploadAttemptStatus,
  DatasetUploadAttemptStatusLight,
  DatasetUploadAttemptSummary,
  DatasetUploadStatusResponse,
  parseAa3CompositeKey,
  PeriodBounds,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  throwIfErrWithData,
  type DatasetHmisVersion,
  type DatasetStagingResult,
  type IndicatorType,
  type ItemsHolderDatasetHmisDisplay,
} from "lib";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { instantiateIntegrateUploadedDataWorker } from "../../worker_routines/integrate_hmis_data/instantiate_worker.ts";
import { instantiateStageHmisDataCsvWorker } from "../../worker_routines/stage_hmis_data_csv/instantiate_worker.ts";
import {
  clearWorker,
  getWorker,
  setWorker,
} from "../../worker_routines/worker_store.ts";
import { escapeSqlString, tryCatchDatabaseAsync } from "../utils.ts";
import { reconcileHmisLedgerPairsAfterDelete } from "./dataset_hmis_import_ledger.ts";
import { assertNoRunningDatasetHmisImportRun } from "./dataset_hmis_import_runs.ts";
import type {
  DBDatasetHmisUploadAttempt,
  DBDatasetHmisVersion,
} from "./_main_database_types.ts";
import { getFacilityColumnsConfig, getMaxAdminAreaConfig } from "./config.ts";

async function getRawUA(
  mainDb: Sql
): Promise<DBDatasetHmisUploadAttempt | undefined> {
  return (
    await mainDb<DBDatasetHmisUploadAttempt[]>`
SELECT * FROM dataset_hmis_upload_attempts
`
  ).at(0);
}

async function getRawUAOrThrow(
  mainDb: Sql
): Promise<DBDatasetHmisUploadAttempt> {
  const rawUA = await getRawUA(mainDb);
  if (!rawUA) {
    throw new Error("No upload attempt with this id");
  }
  return rawUA;
}

function throwIfNoRowsUpdatedBecauseActive(count: number) {
  if (count === 0) {
    throw new Error(
      "An operation is currently running on this upload attempt. Please wait for it to complete."
    );
  }
}

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
    const resUploadAttempt = await getUploadAttemptForDatasetHmis(mainDb);
    if (resUploadAttempt.success === false) {
      return resUploadAttempt;
    }
    const resVersions = await getVersionsForDatasetHmis(mainDb);
    if (resVersions.success === false) {
      return resVersions;
    }
    const dataset: DatasetHmisDetail = {
      uploadAttempt: resUploadAttempt.data,
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

export async function getVersionsForDatasetHmis(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHmisVersion[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const csvVersions = (
      await mainDb<
        DBDatasetHmisVersion[]
      >`SELECT * FROM dataset_hmis_versions ORDER BY id DESC`
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
    // merge at the end — refuse while an import operation is running.
    const activeOperations = await mainDb<{ count: string | number }[]>`
      SELECT COUNT(*) as count
      FROM dataset_hmis_upload_attempts
      WHERE status_type IN ('staging', 'integrating')
    `;
    if (Number(activeOperations[0].count) > 0) {
      throw new Error(
        "An import operation is in progress. Please wait for it to complete before deleting data."
      );
    }
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
  facilityColumns: InstanceConfigFacilityColumns;
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
  facilityColumns: InstanceConfigFacilityColumns
): Promise<APIResponseWithData<ItemsHolderDatasetHmisDisplay>> {
  return await tryCatchDatabaseAsync(async () => {
    // Query common data used by both raw and common functions
    const adminArea2s = (
      await mainDb<
        { admin_area_2: string }[]
      >`SELECT admin_area_2 FROM admin_areas_2 ORDER BY LOWER(admin_area_2)`
    ).map<string>((aa) => aa.admin_area_2);

    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);
    let adminArea3s:
      | { admin_area_3: string; admin_area_2: string }[]
      | undefined;
    if (resMaxAdminArea.data.maxAdminArea >= 3) {
      adminArea3s = await mainDb<
        { admin_area_3: string; admin_area_2: string }[]
      >`SELECT admin_area_3, admin_area_2 FROM admin_areas_3
        ORDER BY LOWER(admin_area_2), LOWER(admin_area_3)`;
    }

    // Conditionally query facility types if enabled
    let facilityTypes: string[] | undefined;
    if (facilityColumns.includeTypes) {
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
    if (facilityColumns.includeOwnership) {
      facilityOwnership = (
        await mainDb<
          { facility_ownership: string }[]
        >`SELECT DISTINCT facility_ownership FROM facilities_hmis
          WHERE facility_ownership IS NOT NULL
          ORDER BY facility_ownership`
      ).map<string>((fo) => fo.facility_ownership);
    }

    const sharedData: SharedDataForDisplay = {
      facilityColumns,
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
      facilityColumns: sharedData.facilityColumns,
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
      facilityColumns: sharedData.facilityColumns,
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

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __    __            __                            __                    __      __                                          __               //
// /  |  /  |          /  |                          /  |                  /  |    /  |                                        /  |              //
// $$ |  $$ |  ______  $$ |  ______    ______    ____$$ |        ______   _$$ |_  _$$ |_     ______   _____  ____    ______   _$$ |_    _______  //
// $$ |  $$ | /      \ $$ | /      \  /      \  /    $$ |       /      \ / $$   |/ $$   |   /      \ /     \/    \  /      \ / $$   |  /       | //
// $$ |  $$ |/$$$$$$  |$$ |/$$$$$$  | $$$$$$  |/$$$$$$$ |       $$$$$$  |$$$$$$/ $$$$$$/   /$$$$$$  |$$$$$$ $$$$  |/$$$$$$  |$$$$$$/  /$$$$$$$/  //
// $$ |  $$ |$$ |  $$ |$$ |$$ |  $$ | /    $$ |$$ |  $$ |       /    $$ |  $$ | __ $$ | __ $$    $$ |$$ | $$ | $$ |$$ |  $$ |  $$ | __$$      \  //
// $$ \__$$ |$$ |__$$ |$$ |$$ \__$$ |/$$$$$$$ |$$ \__$$ |      /$$$$$$$ |  $$ |/  |$$ |/  |$$$$$$$$/ $$ | $$ | $$ |$$ |__$$ |  $$ |/  |$$$$$$  | //
// $$    $$/ $$    $$/ $$ |$$    $$/ $$    $$ |$$    $$ |      $$    $$ |  $$  $$/ $$  $$/ $$       |$$ | $$ | $$ |$$    $$/   $$  $$//     $$/  //
//  $$$$$$/  $$$$$$$/  $$/  $$$$$$/   $$$$$$$/  $$$$$$$/        $$$$$$$/    $$$$/   $$$$/   $$$$$$$/ $$/  $$/  $$/ $$$$$$$/     $$$$/ $$$$$$$/   //
//           $$ |                                                                                                  $$ |                          //
//           $$ |                                                                                                  $$ |                          //
//           $$/                                                                                                   $$/                           //
//                                                                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function addDatasetHmisUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const dateStarted = new Date().toISOString();
    // HMIS dataset is always the same structure, no need to look up definition
    const startingStatus: DatasetUploadAttemptStatus = {
      status: "configuring",
    };
    await mainDb`
INSERT INTO dataset_hmis_upload_attempts
  (date_started, step, status, status_type)
VALUES
  (${dateStarted}, 0, ${JSON.stringify(startingStatus)}, 'configuring')
`;
    return { success: true };
  });
}

export async function getUploadAttemptForDatasetHmis(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetUploadAttemptSummary | undefined>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUA(mainDb);
    if (!rawDUA) {
      return { success: true, data: undefined };
    }
    const uploadAttempt: DatasetUploadAttemptSummary = {
      id: "hmis",
      dateStarted: rawDUA.date_started,
      status: parseJsonOrThrow(rawDUA.status),
    };
    return { success: true, data: uploadAttempt };
  });
}

export async function getDatasetHmisUploadAttemptDetail(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetUploadAttemptDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);

    const baseDetails = {
      id: "hmis",
      dateStarted: rawDUA.date_started,
      status: parseJsonOrThrow<DatasetUploadAttemptStatus>(rawDUA.status),
    };

    const sourceType = (rawDUA.source_type as "csv" | null) ?? undefined;

    const step1Result = parseJsonOrUndefined<unknown>(rawDUA.step_1_result);

    const uaDetail = {
      ...baseDetails,
      step: rawDUA.step as 0 | 1 | 2 | 3 | 4,
      sourceType,
      step1Result,
      step2Result: parseJsonOrUndefined<unknown>(rawDUA.step_2_result),
      step3Result: parseJsonOrUndefined<unknown>(rawDUA.step_3_result),
    } as DatasetUploadAttemptDetail;

    return { success: true, data: uaDetail };
  });
}

export async function getDatasetHmisUploadStatus(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetUploadStatusResponse>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);

    const status = parseJsonOrThrow<DatasetUploadAttemptStatus>(rawDUA.status);
    const step = rawDUA.step as 0 | 1 | 2 | 3 | 4;

    const statusLight: DatasetUploadAttemptStatusLight = status;

    // Determine if polling should continue
    const isActive =
      status.status === "staging" || status.status === "integrating";

    return {
      success: true,
      data: {
        id: "hmis",
        step,
        status: statusLight,
        isActive,
      },
    };
  });
}

export async function deleteDatasetHmisUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = await getRawUA(mainDb);
    if (existing === undefined) {
      return { success: true };
    }

    // Terminate any running HMIS worker
    const hmisWorker = getWorker("hmis");

    if (hmisWorker) {
      hmisWorker.terminate();
      clearWorker("hmis", hmisWorker);
    }

    await mainDb`DELETE FROM dataset_hmis_upload_attempts`;
    // A terminated worker never reaches its own cleanup, and a staged
    // attempt's table would otherwise outlive the attempt row.
    await mainDb.unsafe(
      `DROP TABLE IF EXISTS ${UPLOADED_HMIS_DATA_STAGING_TABLE_NAME}`
    );
    return { success: true };
  });
}

///////////////////////////////////////////////////////
//   ______    __                                    //
//  /      \  /  |                                   //
// /$$$$$$  |_$$ |_     ______    ______    _______  //
// $$ \__$$// $$   |   /      \  /      \  /       | //
// $$      \$$$$$$/   /$$$$$$  |/$$$$$$  |/$$$$$$$/  //
//  $$$$$$  | $$ | __ $$    $$ |$$ |  $$ |$$      \  //
// /  \__$$ | $$ |/  |$$$$$$$$/ $$ |__$$ | $$$$$$  | //
// $$    $$/  $$  $$/ $$       |$$    $$/ /     $$/  //
//  $$$$$$/    $$$$/   $$$$$$$/ $$$$$$$/  $$$$$$$/   //
//                              $$ |                 //
//                              $$ |                 //
//                              $$/                  //
//                                                   //
///////////////////////////////////////////////////////

export async function updateDatasetUploadAttempt_Step0SourceType(
  mainDb: Sql,
  sourceType: "csv"
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await getRawUAOrThrow(mainDb); // Verify exists
    // All step-config writes are conditional on no worker phase being active:
    // an unconditional write racing a running worker would let the worker's
    // completion mark data staged under a config it wasn't staged from.
    const updated = await mainDb`
  UPDATE dataset_hmis_upload_attempts
  SET
    step = 1,
    source_type = ${sourceType},
    step_1_result = NULL,
    step_2_result = NULL,
    step_3_result = NULL
  WHERE status_type NOT IN ('staging', 'integrating')
    `;
    throwIfNoRowsUpdatedBecauseActive(updated.count);
    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step1CsvUpload(
  mainDb: Sql,
  assetFileName: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb); // Verify exists
    if (!rawDUA.source_type) {
      throw new Error("Not yet ready for this step");
    }
    const assetFilePath = resolveAssetFilePath(assetFileName);
    const resCsvDetails = await getCsvDetails(assetFilePath, assetFileName);
    throwIfErrWithData(resCsvDetails);
    const updated = await mainDb`
  UPDATE dataset_hmis_upload_attempts
  SET
    step = 2,
    step_1_result = ${JSON.stringify(resCsvDetails.data)},
    step_2_result = NULL,
    step_3_result = NULL
  WHERE status_type NOT IN ('staging', 'integrating')
    `;
    throwIfNoRowsUpdatedBecauseActive(updated.count);
    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step2Mappings(
  mainDb: Sql,
  mappings: Record<string, string>
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.source_type || !rawDUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }
    const updated = await mainDb`
UPDATE dataset_hmis_upload_attempts
SET
  step = 3,
  step_2_result = ${JSON.stringify(mappings)},
  step_3_result = NULL
WHERE status_type NOT IN ('staging', 'integrating')
`;
    throwIfNoRowsUpdatedBecauseActive(updated.count);
    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step3Staging(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.source_type || !rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // Check if this upload is already being processed
    const activeOperations = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM dataset_hmis_upload_attempts
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }
    await assertNoRunningDatasetHmisImportRun(mainDb);

    // Check if an HMIS worker is already running
    const existingWorker = getWorker("hmis");
    if (existingWorker) {
      throw new Error(
        "An HMIS operation is already in progress. Please wait for it to complete."
      );
    }

    // Atomically claim the staging slot: the conditional UPDATE + rowcount
    // check is race-free, unlike the read-then-write guards above (which stay
    // for friendlier errors). Nulling step_3_result here means a staging run
    // that dies mid-flight can never leave a previous run's result armed
    // against a staging table it doesn't describe — integration requires
    // step_3_result, so it stays blocked until staging succeeds again.
    const claimed = await mainDb`
      UPDATE dataset_hmis_upload_attempts
      SET
        status = ${JSON.stringify({ status: "staging", progress: 0 })},
        status_type = 'staging',
        step = 3,
        step_3_result = NULL
      WHERE status_type NOT IN ('staging', 'integrating')
    `;
    if (claimed.count === 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }

    // Re-read after the claim: a concurrent step-2 config write can land
    // between the initial read and the claim, and the worker must stage from
    // the row the claim actually locked in — not the pre-claim snapshot.
    const claimedDUA = await getRawUAOrThrow(mainDb);

    const worker = instantiateStageHmisDataCsvWorker(claimedDUA);

    // Store the worker reference globally
    setWorker("hmis", worker);

    // Handle worker crash - clear reference when done
    worker.addEventListener("error", async (e) => {
      console.error("Staging worker crashed:", e);
      e.preventDefault(); // Prevent the error from propagating and crashing the server
      try {
        await mainDb`
          UPDATE dataset_hmis_upload_attempts 
          SET 
            status = ${JSON.stringify({
              status: "error",
              err: `Worker crashed: ${e.message || "Unknown error"}`,
            })},
            status_type = 'error'
        `;
      } catch (dbError) {
        console.error("Failed to update database after worker crash:", dbError);
      }
      clearWorker("hmis", worker);
      worker.terminate();
    });

    // Handle successful completion
    worker.addEventListener("message", (e) => {
      if (e.data === "COMPLETED") {
        clearWorker("hmis", worker);
        worker.terminate();
      }
    });

    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step4Integrate(
  mainDb: Sql,
  onComplete?: () => void,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (
      !rawDUA.source_type ||
      !rawDUA.step_1_result ||
      !rawDUA.step_2_result ||
      !rawDUA.step_3_result
    ) {
      throw new Error("Not yet ready for this step");
    }

    // Check if this upload is already being processed
    const activeOperations = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM dataset_hmis_upload_attempts
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }
    await assertNoRunningDatasetHmisImportRun(mainDb);

    // Check if an HMIS worker is already running
    const existingWorker = getWorker("hmis");
    if (existingWorker) {
      throw new Error(
        "An HMIS operation is already in progress. Please wait for it to complete."
      );
    }

    // Atomically claim the integration slot (race-free conditional UPDATE;
    // the read-then-write guards above stay for friendlier errors). Excluding
    // 'complete' blocks re-integrating a finished attempt — the staging table
    // is already dropped, so a second run could only fail and flip a
    // successful attempt to 'error'.
    const claimed = await mainDb`
      UPDATE dataset_hmis_upload_attempts
      SET
        status = ${JSON.stringify({ status: "integrating", progress: 0 })},
        status_type = 'integrating'
      WHERE status_type NOT IN ('staging', 'integrating', 'complete')
    `;
    if (claimed.count === 0) {
      throw new Error(
        "This operation is already in progress or already complete."
      );
    }

    // Re-read after the claim: a concurrent config write can land between the
    // initial read and the claim; the worker must run from the claimed row.
    const claimedDUA = await getRawUAOrThrow(mainDb);

    const worker = instantiateIntegrateUploadedDataWorker(claimedDUA);

    // Store the worker reference globally
    setWorker("hmis", worker);

    // Handle worker crash
    worker.addEventListener("error", async (e) => {
      console.error("Integration worker crashed:", e);
      e.preventDefault(); // Prevent the error from propagating and crashing the server
      try {
        await mainDb`
          UPDATE dataset_hmis_upload_attempts 
          SET 
            status = ${JSON.stringify({
              status: "error",
              err: `Worker crashed: ${e.message || "Unknown error"}`,
            })},
            status_type = 'error'
        `;
      } catch (dbError) {
        console.error("Failed to update database after worker crash:", dbError);
      }
      clearWorker("hmis", worker);
      worker.terminate();
    });

    // Handle successful completion
    worker.addEventListener("message", async (e) => {
      if (e.data === "COMPLETED") {
        clearWorker("hmis", worker);
        worker.terminate();
        try {
          await onComplete?.();
        } catch (err) {
          console.error("HMIS integration onComplete callback failed:", err);
        }
      }
    });

    return { success: true };
  });
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export async function getCurrentDatasetHmisMaxVersionId(
  mainDb: Sql
): Promise<number | undefined> {
  const maxId = (
    await mainDb<{ max_id: number }[]>`
SELECT MAX(id) AS max_id FROM dataset_hmis_versions
`
  ).at(0)?.max_id;
  return typeof maxId === "number" ? maxId : undefined;
}

export async function getCurrentDatasetHmisVersion(
  mainDb: Sql
): Promise<DatasetHmisVersion | undefined> {
  const rawDatasetVersion = (
    await mainDb<DBDatasetHmisVersion[]>`
SELECT * FROM dataset_hmis_versions
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
