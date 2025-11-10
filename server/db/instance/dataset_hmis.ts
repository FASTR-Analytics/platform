import { join } from "@std/path";
import {
  _GLOBAL_MAX_YEAR_FOR_PERIODS,
  _GLOBAL_MIN_YEAR_FOR_PERIODS,
} from "@timroberton/panther";
import { Sql } from "postgres";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import type {
  DatasetHmisWindowingRaw,
  InstanceConfigFacilityColumns,
} from "lib";
import {
  APIResponseNoData,
  APIResponseWithData,
  DatasetHmisDetail,
  DatasetStagingResult,
  DatasetUploadAttemptDetail,
  DatasetUploadAttemptStatus,
  DatasetUploadAttemptStatusLight,
  DatasetUploadAttemptSummary,
  DatasetUploadStatusResponse,
  Dhis2SelectionParams,
  PeriodBounds,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  throwIfErrWithData,
  type DatasetHmisVersion,
  type Dhis2Credentials,
  type IndicatorType,
  type ItemsHolderDatasetHmisDisplay,
} from "lib";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { instantiateIntegrateUploadedDataWorker } from "../../worker_routines/integrate_hmis_data/instantiate_worker.ts";
import { instantiateStageHmisDataCsvWorker } from "../../worker_routines/stage_hmis_data_csv/instantiate_worker.ts";
import { instantiateStageHmisDataDhis2Worker } from "../../worker_routines/stage_hmis_data_dhis2/instantiate_worker.ts";
import {
  getHmisWorker,
  setHmisWorker,
} from "../../worker_routines/worker_store.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type {
  DBDatasetHmisUploadAttempt,
  DBDatasetHmisVersion,
} from "./_main_database_types.ts";
import { getFacilityColumnsConfig } from "./config.ts";

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
    // Build WHERE conditions based on windowing
    const conditions = [];

    // Period filtering
    conditions.push(`period_id >= ${windowing.start}`);
    conditions.push(`period_id <= ${windowing.end}`);

    // Indicator filtering
    if (
      !windowing.takeAllIndicators &&
      windowing.rawIndicatorsToInclude.length > 0
    ) {
      const indicatorList = windowing.rawIndicatorsToInclude
        .map((ind) => `'${ind}'`)
        .join(", ");
      conditions.push(`indicator_raw_id IN (${indicatorList})`);
    }

    // Count rows that will be deleted
    let countQuery;
    if (
      !windowing.takeAllAdminArea2s &&
      windowing.adminArea2sToInclude.length > 0
    ) {
      const adminAreaList = windowing.adminArea2sToInclude
        .map((aa) => `'${aa}'`)
        .join(", ");
      // Count using facility join for admin area filtering
      countQuery = mainDb.unsafe(`
        SELECT COUNT(*) as count 
        FROM dataset_hmis
        WHERE facility_id IN (
          SELECT facility_id 
          FROM facilities 
          WHERE admin_area_2 IN (${adminAreaList})
        )
        AND ${conditions.join(" AND ")}
      `);
    } else {
      // Count without admin area filtering
      countQuery = mainDb.unsafe(`
        SELECT COUNT(*) as count 
        FROM dataset_hmis
        WHERE ${conditions.join(" AND ")}
      `);
    }

    const rowsToDelete = await countQuery;
    const deleteCount = Number(rowsToDelete[0].count);

    // Only proceed if there are rows to delete
    if (deleteCount === 0) {
      return { success: true };
    }

    // Admin area filtering - need to join with facilities table
    let deleteQuery;
    if (
      !windowing.takeAllAdminArea2s &&
      windowing.adminArea2sToInclude.length > 0
    ) {
      const adminAreaList = windowing.adminArea2sToInclude
        .map((aa) => `'${aa}'`)
        .join(", ");
      // Delete using facility join for admin area filtering
      deleteQuery = mainDb.unsafe(`
        DELETE FROM dataset_hmis
        WHERE facility_id IN (
          SELECT facility_id 
          FROM facilities 
          WHERE admin_area_2 IN (${adminAreaList})
        )
        AND ${conditions.join(" AND ")}
      `);
    } else {
      // Delete without admin area filtering
      deleteQuery = mainDb.unsafe(`
        DELETE FROM dataset_hmis
        WHERE ${conditions.join(" AND ")}
      `);
    }

    await deleteQuery;

    // Create a new version record to track this deletion
    const currentMaxVersionId = await getCurrentDatasetHmisMaxVersionId(mainDb);
    const newVersionId = (currentMaxVersionId ?? 0) + 1;

    // Create version record with negative counts to indicate deletion
    await mainDb`
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
        ${-deleteCount},  -- Negative to indicate deletion
        ${-deleteCount},  -- All were "inserted" as deletions
        0,                -- No updates, just deletions
        ${JSON.stringify({
          sourceType: "deletion",
          windowing: windowing,
          rowsDeleted: deleteCount,
          dateImported: new Date().toISOString(),
        })}
      )
    `;

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
    // Get facility columns configuration
    // const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    // throwIfErrWithData(resFacilityConfig);
    // const facilityConfig = resFacilityConfig.data;

    // Query common data used by both raw and common functions
    const adminArea2s = (
      await mainDb<
        { admin_area_2: string }[]
      >`SELECT admin_area_2 FROM admin_areas_2 ORDER BY LOWER(admin_area_2)`
    ).map<string>((aa) => aa.admin_area_2);

    // Conditionally query facility types if enabled
    let facilityTypes: string[] | undefined;
    if (facilityColumns.includeTypes) {
      facilityTypes = (
        await mainDb<
          { facility_type: string }[]
        >`SELECT DISTINCT facility_type FROM facilities 
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
        >`SELECT DISTINCT facility_ownership FROM facilities 
          WHERE facility_ownership IS NOT NULL 
          ORDER BY facility_ownership`
      ).map<string>((fo) => fo.facility_ownership);
    }

    const sharedData: SharedDataForDisplay = {
      facilityColumns,
      adminArea2s,
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
    const vizItems = await mainDb<Record<string, string>[]>`
  SELECT COUNT(*) AS count, SUM(count) AS sum, indicator_raw_id AS indicator_id, period_id 
  FROM dataset_hmis
  GROUP BY indicator_raw_id, period_id
`;

    const indicators = await mainDb<
      { indicator_raw_id: string; common_ids: string | null }[]
    >`
  SELECT 
    dh.indicator_raw_id,
    STRING_AGG(im.indicator_common_id, ', ' ORDER BY im.indicator_common_id) as common_ids
  FROM (
    SELECT DISTINCT indicator_raw_id 
    FROM dataset_hmis
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
      FROM dataset_hmis`;

    const periodBounds: PeriodBounds = {
      periodOption: "period_id",
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
    const vizItems = await mainDb<Record<string, string>[]>`
      WITH aggregated AS (
        SELECT 
          dh.facility_id,
          im.indicator_common_id,
          dh.period_id,
          SUM(dh.count) as count
        FROM dataset_hmis dh
        INNER JOIN indicator_mappings im ON dh.indicator_raw_id = im.indicator_raw_id
        GROUP BY 
          dh.facility_id,
          im.indicator_common_id,
          dh.period_id
      )
      SELECT COUNT(*) AS count, SUM(count) AS sum, indicator_common_id AS indicator_id, period_id 
      FROM aggregated
      GROUP BY indicator_common_id, period_id
    `;

    const indicators = await mainDb<
      { indicator_common_id: string; indicator_common_label: string }[]
    >`
      SELECT DISTINCT im.indicator_common_id, i.indicator_common_label
      FROM dataset_hmis dh
      INNER JOIN indicator_mappings im ON dh.indicator_raw_id = im.indicator_raw_id
      INNER JOIN indicators i ON im.indicator_common_id = i.indicator_common_id
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
      FROM dataset_hmis dh
      WHERE EXISTS (
        SELECT 1 FROM indicator_mappings im 
        WHERE dh.indicator_raw_id = im.indicator_raw_id
      )`;

    const periodBounds: PeriodBounds = {
      periodOption: "period_id",
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

    const uaDetail = {
      ...baseDetails,
      step: rawDUA.step as 0 | 1 | 2 | 3 | 4,
      sourceType: (rawDUA.source_type as "csv" | "dhis2" | null) ?? undefined,
      step1Result: parseJsonOrUndefined<any>(rawDUA.step_1_result),
      step2Result: parseJsonOrUndefined<any>(rawDUA.step_2_result),
      step3Result: parseJsonOrUndefined<any>(rawDUA.step_3_result),
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

    // Convert full status to lightweight version (remove history array if DHIS2)
    let statusLight: DatasetUploadAttemptStatusLight;
    if (status.status === "staging_dhis2") {
      statusLight = {
        status: "staging_dhis2",
        progress: status.progress,
        totalWorkItems: status.totalWorkItems,
        completedWorkItems: status.completedWorkItems,
        failedWorkItems: status.failedWorkItems,
        activeWorkItems: status.activeWorkItems,
        // Exclude completedWorkItemHistory
      };
    } else {
      statusLight = status as DatasetUploadAttemptStatusLight;
    }

    // Determine if polling should continue
    const isActive =
      status.status === "staging" ||
      status.status === "staging_dhis2" ||
      status.status === "integrating";

    if (isActive) {
      // Return lightweight status for active operations
      return {
        success: true,
        data: {
          id: "hmis",
          step,
          status: statusLight,
          isActive: true as const,
        },
      };
    } else {
      // Return full details for stable states
      const baseDetails = {
        id: "hmis",
        dateStarted: rawDUA.date_started,
        status: parseJsonOrThrow<DatasetUploadAttemptStatus>(rawDUA.status),
      };

      const fullDetail = {
        ...baseDetails,
        step,
        sourceType: (rawDUA.source_type as "csv" | "dhis2" | null) ?? undefined,
        step1Result: parseJsonOrUndefined<any>(rawDUA.step_1_result),
        step2Result: parseJsonOrUndefined<any>(rawDUA.step_2_result),
        step3Result: parseJsonOrUndefined<any>(rawDUA.step_3_result),
      } as DatasetUploadAttemptDetail;

      return {
        success: true,
        data: {
          id: "hmis",
          step,
          status: statusLight,
          isActive: false as const,
          fullDetail,
        },
      };
    }
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
    const hmisWorker = getHmisWorker();

    if (hmisWorker) {
      hmisWorker.terminate();
      setHmisWorker(null);
    }

    await mainDb`DELETE FROM dataset_hmis_upload_attempts`;
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
  sourceType: "csv" | "dhis2"
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await getRawUAOrThrow(mainDb); // Verify exists
    await mainDb`
  UPDATE dataset_hmis_upload_attempts
  SET
    step = 1,
    source_type = ${sourceType},
    step_1_result = NULL,
    step_2_result = NULL,
    step_3_result = NULL
    `;
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
    const assetFilePath = join(_ASSETS_DIR_PATH, assetFileName);
    const resCsvDetails = await getCsvDetails(assetFilePath, assetFileName);
    throwIfErrWithData(resCsvDetails);
    await mainDb`
  UPDATE dataset_hmis_upload_attempts
  SET
    step = 2,
    step_1_result = ${JSON.stringify(resCsvDetails.data)},
    step_2_result = NULL,
    step_3_result = NULL
    `;
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
    await mainDb`
UPDATE dataset_hmis_upload_attempts
SET
  step = 3, 
  step_2_result = ${JSON.stringify(mappings)},
  step_3_result = NULL
`;
    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step3Staging(
  mainDb: Sql,
  failFastMode?: "fail-fast" | "continue-on-error",
  _signal?: AbortSignal
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.source_type || !rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // Check if this upload is already being processed
    const activeOperations = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count 
      FROM dataset_hmis_upload_attempts 
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }

    // Check if an HMIS worker is already running
    const existingWorker = getHmisWorker();
    if (existingWorker) {
      throw new Error(
        "An HMIS operation is already in progress. Please wait for it to complete."
      );
    }

    // Immediately claim the lock by setting status to staging
    await mainDb`
      UPDATE dataset_hmis_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "staging", progress: 0 })},
        status_type = 'staging'
    `;

    // Route to appropriate worker based on source type
    let worker: Worker;
    if (rawDUA.source_type === "dhis2") {
      worker = instantiateStageHmisDataDhis2Worker(rawDUA, failFastMode);
    } else {
      // Default to CSV staging
      worker = instantiateStageHmisDataCsvWorker(rawDUA);
    }

    // Store the worker reference globally
    setHmisWorker(worker);

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
      setHmisWorker(null);
    });

    // Handle successful completion
    worker.addEventListener("message", (e) => {
      if (e.data === "COMPLETED") {
        setHmisWorker(null);
      }
    });

    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step1Dhis2Confirm(
  mainDb: Sql,
  credentials: Dhis2Credentials
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.source_type) {
      throw new Error("Not yet ready for this step");
    }
    await mainDb`
  UPDATE dataset_hmis_upload_attempts
  SET
    step = 2,
    step_1_result = ${JSON.stringify(credentials)},
    step_2_result = NULL,
    step_3_result = NULL
    `;
    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step2Dhis2Selection(
  mainDb: Sql,
  selection: Dhis2SelectionParams
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.source_type || !rawDUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }
    await mainDb`
UPDATE dataset_hmis_upload_attempts
SET
  step = 3, 
  step_2_result = ${JSON.stringify(selection)},
  step_3_result = NULL
`;
    return { success: true };
  });
}

export async function updateDatasetUploadAttempt_Step4Integrate(
  mainDb: Sql
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
      SELECT COUNT(*) as count 
      FROM dataset_hmis_upload_attempts 
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }

    // Check if an HMIS worker is already running
    const existingWorker = getHmisWorker();
    if (existingWorker) {
      throw new Error(
        "An HMIS operation is already in progress. Please wait for it to complete."
      );
    }

    // Immediately claim the lock by setting status to integrating
    await mainDb`
      UPDATE dataset_hmis_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "integrating", progress: 0 })},
        status_type = 'integrating'
    `;

    const worker = instantiateIntegrateUploadedDataWorker(rawDUA);

    // Store the worker reference globally
    setHmisWorker(worker);

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
      setHmisWorker(null);
    });

    // Handle successful completion
    worker.addEventListener("message", (e) => {
      if (e.data === "COMPLETED") {
        setHmisWorker(null);
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
