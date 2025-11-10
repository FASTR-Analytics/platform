import { join } from "@std/path";
import { Sql } from "postgres";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  throwIfErrWithData,
  DatasetHfaDetail,
  DatasetHfaVersion,
  ItemsHolderDatasetHfaDisplay,
  DatasetHfaCsvStagingResult,
  DatasetHfaUploadAttemptDetail,
  DatasetHfaUploadAttemptStatus,
  DatasetHfaUploadAttemptStatusLight,
  DatasetHfaUploadAttemptSummary,
  DatasetHfaUploadStatusResponse,
} from "lib";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { instantiateIntegrateHfaDataWorker } from "../../worker_routines/integrate_hfa_data/instantiate_worker.ts";
import { instantiateStageHfaDataCsvWorker } from "../../worker_routines/stage_hfa_data_csv/instantiate_worker.ts";
import {
  getHfaWorker,
  setHfaWorker,
} from "../../worker_routines/worker_store.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type {
  DBDatasetHfaUploadAttempt,
  DBDatasetHfaVersion,
} from "./_main_database_types.ts";

async function getRawUA(
  mainDb: Sql
): Promise<DBDatasetHfaUploadAttempt | undefined> {
  return (
    await mainDb<DBDatasetHfaUploadAttempt[]>`
SELECT * FROM dataset_hfa_upload_attempts
`
  ).at(0);
}

async function getRawUAOrThrow(
  mainDb: Sql
): Promise<DBDatasetHfaUploadAttempt> {
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

export async function getDatasetHfaDetail(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const resUploadAttempt = await getUploadAttemptForDatasetHfa(mainDb);
    if (resUploadAttempt.success === false) {
      return resUploadAttempt;
    }
    const resVersions = await getVersionsForDatasetHfa(mainDb);
    if (resVersions.success === false) {
      return resVersions;
    }
    const dataset: DatasetHfaDetail = {
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
//   $$  /$$/ $$    $$ |$$ |  $$/ $$      \ $$ |$$ |  $$ |$$ |  $$ |$$      \  //
//   $$ $$/  $$$$$$$$/ $$ |       $$$$$$  |$$ |$$ \__$$ |$$ |  $$ | $$$$$$  | //
//    $$$/   $$       |$$ |      /     $$/ $$ |$$    $$/ $$ |  $$ |/     $$/  //
//     $/     $$$$$$$/ $$/       $$$$$$$/  $$/  $$$$$$/  $$/   $$/ $$$$$$$/   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export async function getVersionsForDatasetHfa(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaVersion[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const csvVersions = (
      await mainDb<
        DBDatasetHfaVersion[]
      >`SELECT * FROM dataset_hfa_versions ORDER BY id DESC`
    ).map<DatasetHfaVersion>((rawDatatableVersion) => {
      return {
        id: rawDatatableVersion.id,
        nRowsTotalImported: rawDatatableVersion.n_rows_total_imported,
        nRowsInserted: rawDatatableVersion.n_rows_inserted ?? undefined,
        nRowsUpdated: rawDatatableVersion.n_rows_updated ?? undefined,
        stagingResult: rawDatatableVersion.staging_result
          ? parseJsonOrUndefined<DatasetHfaCsvStagingResult>(
              rawDatatableVersion.staging_result
            )
          : undefined,
      };
    });
    return { success: true, data: csvVersions };
  });
}

export async function deleteAllDatasetHfaData(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM dataset_hfa`;
    await mainDb`DELETE FROM dataset_hfa_versions`;
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

export async function getDatasetHfaItemsForDisplay(
  mainDb: Sql,
  versionId: number | undefined
): Promise<APIResponseWithData<ItemsHolderDatasetHfaDisplay>> {
  return await tryCatchDatabaseAsync(async () => {
    const datasetTableName = "dataset_hfa";

    // For HFA, group by var_name and time_point
    const vizItems = await mainDb<Record<string, string | number>[]>`
SELECT COUNT(*) AS count, var_name, time_point
FROM ${mainDb(datasetTableName)} d
GROUP BY var_name, time_point
`;

    const variables = (
      await mainDb<{ var_name: string }[]>`
SELECT DISTINCT var_name
FROM ${mainDb(datasetTableName)}
ORDER BY var_name
`
    ).map<{ value: string; label: string }>((v) => {
      return {
        value: v.var_name,
        label: v.var_name,
      };
    });

    const adminArea2s = (
      await mainDb<
        { admin_area_2: string }[]
      >`SELECT admin_area_2 FROM admin_areas_2 ORDER BY LOWER(admin_area_2)`
    ).map<{ value: string; label: string }>((aa) => {
      return {
        value: aa.admin_area_2,
        label: aa.admin_area_2,
      };
    });

    const variableLabels: Record<string, string> = {};
    for (const v of variables) {
      variableLabels[v.value] = v.label;
    }

    const ih: ItemsHolderDatasetHfaDisplay = {
      versionId,
      vizItems,
      variableLabels,
      variables,
      adminArea2s,
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

export async function addDatasetHfaUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const dateStarted = new Date().toISOString();
    // HFA dataset starts at step 1 with CSV source
    const startingStatus: DatasetHfaUploadAttemptStatus = {
      status: "configuring",
    };
    await mainDb`
INSERT INTO dataset_hfa_upload_attempts
  (date_started, step, status, status_type, source_type)
VALUES
  (${dateStarted}, 1, ${JSON.stringify(startingStatus)}, 'configuring', 'csv')
`;
    return { success: true };
  });
}

export async function getUploadAttemptForDatasetHfa(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaUploadAttemptSummary | undefined>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUA(mainDb);
    if (!rawDUA) {
      return { success: true, data: undefined };
    }
    const uploadAttempt: DatasetHfaUploadAttemptSummary = {
      id: "hfa",
      dateStarted: rawDUA.date_started,
      status: parseJsonOrThrow(rawDUA.status),
    };
    return { success: true, data: uploadAttempt };
  });
}

export async function getDatasetHfaUploadAttemptDetail(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaUploadAttemptDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);

    const baseDetails = {
      id: "hfa",
      dateStarted: rawDUA.date_started,
      status: parseJsonOrThrow<DatasetHfaUploadAttemptStatus>(rawDUA.status),
    };

    const uaDetail = {
      ...baseDetails,
      step: rawDUA.step as 1 | 2 | 3 | 4,
      sourceType: "csv" as const,
      step1Result: parseJsonOrUndefined(rawDUA.step_1_result),
      step2Result: parseJsonOrUndefined(rawDUA.step_2_result),
      step3Result: parseJsonOrUndefined(rawDUA.step_3_result),
    } as DatasetHfaUploadAttemptDetail;

    return { success: true, data: uaDetail };
  });
}

export async function getDatasetHfaUploadStatus(
  mainDb: Sql
): Promise<APIResponseWithData<DatasetHfaUploadStatusResponse>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);

    const status = parseJsonOrThrow<DatasetHfaUploadAttemptStatus>(
      rawDUA.status
    );
    const step = rawDUA.step as 1 | 2 | 3 | 4;

    // Convert full status to lightweight version
    const statusLight: DatasetHfaUploadAttemptStatusLight =
      status as DatasetHfaUploadAttemptStatusLight;

    // Determine if polling should continue
    const isActive =
      status.status === "staging" || status.status === "integrating";

    if (isActive) {
      // Return lightweight status for active operations
      return {
        success: true,
        data: {
          id: "hfa",
          step,
          status: statusLight,
          isActive: true as const,
        },
      };
    } else {
      // Return full details for stable states
      const baseDetails = {
        id: "hfa",
        dateStarted: rawDUA.date_started,
        status: parseJsonOrThrow<DatasetHfaUploadAttemptStatus>(rawDUA.status),
      };

      const fullDetail = {
        ...baseDetails,
        step,
        sourceType: "csv" as const,
        step1Result: parseJsonOrUndefined<any>(rawDUA.step_1_result),
        step2Result: parseJsonOrUndefined<any>(rawDUA.step_2_result),
        step3Result: parseJsonOrUndefined<any>(rawDUA.step_3_result),
      } as DatasetHfaUploadAttemptDetail;

      return {
        success: true,
        data: {
          id: "hfa",
          step,
          status: statusLight,
          isActive: false as const,
          fullDetail,
        },
      };
    }
  });
}

export async function deleteDatasetHfaUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = await getRawUA(mainDb);
    if (existing === undefined) {
      return { success: true };
    }

    // Terminate any running HFA worker
    const hfaWorker = getHfaWorker();

    if (hfaWorker) {
      hfaWorker.terminate();
      setHfaWorker(null);
    }

    await mainDb`DELETE FROM dataset_hfa_upload_attempts`;
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

export async function updateDatasetHfaUploadAttempt_Step1CsvUpload(
  mainDb: Sql,
  assetFileName: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await getRawUAOrThrow(mainDb); // Verify exists
    const assetFilePath = join(_ASSETS_DIR_PATH, assetFileName);
    const resCsvDetails = await getCsvDetails(assetFilePath, assetFileName);
    throwIfErrWithData(resCsvDetails);
    await mainDb`
  UPDATE dataset_hfa_upload_attempts
  SET
    step = 2,
    step_1_result = ${JSON.stringify(resCsvDetails.data)},
    step_2_result = NULL,
    step_3_result = NULL
    `;
    return { success: true };
  });
}

export async function updateDatasetHfaUploadAttempt_Step2Mappings(
  mainDb: Sql,
  mappings: Record<string, string>
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }
    await mainDb`
UPDATE dataset_hfa_upload_attempts
SET
  step = 3, 
  step_2_result = ${JSON.stringify(mappings)},
  step_3_result = NULL
`;
    return { success: true };
  });
}

export async function updateDatasetHfaUploadAttempt_Step3Staging(
  mainDb: Sql,
  _signal?: AbortSignal
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (!rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // Check if this upload is already being processed
    const activeOperations = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count 
      FROM dataset_hfa_upload_attempts 
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }

    // Check if an HFA worker is already running
    const existingWorker = getHfaWorker();
    if (existingWorker) {
      throw new Error(
        "An HFA operation is already in progress. Please wait for it to complete."
      );
    }

    // Immediately claim the lock by setting status to staging
    await mainDb`
      UPDATE dataset_hfa_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "staging", progress: 0 })},
        status_type = 'staging'
    `;

    // Use CSV staging worker for HFA
    const worker = instantiateStageHfaDataCsvWorker(rawDUA);

    // Store the worker reference globally
    setHfaWorker(worker);

    // Handle worker crash - clear reference when done
    worker.addEventListener("error", async (e) => {
      console.error("Staging worker crashed:", e);
      e.preventDefault(); // Prevent the error from propagating and crashing the server
      try {
        await mainDb`
          UPDATE dataset_hfa_upload_attempts 
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
      setHfaWorker(null);
    });

    // Handle successful completion
    worker.addEventListener("message", (e) => {
      if (e.data === "COMPLETED") {
        setHfaWorker(null);
      }
    });

    return { success: true };
  });
}

export async function updateDatasetHfaUploadAttempt_Step4Integrate(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawDUA = await getRawUAOrThrow(mainDb);
    if (
      !rawDUA.step_1_result ||
      !rawDUA.step_2_result ||
      !rawDUA.step_3_result
    ) {
      throw new Error("Not yet ready for this step");
    }

    // Check if this upload is already being processed
    const activeOperations = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count 
      FROM dataset_hfa_upload_attempts 
      WHERE status_type IN ('staging', 'integrating')
    `;

    if (activeOperations[0].count > 0) {
      throw new Error(
        "This operation is already in progress. Please wait for it to complete."
      );
    }

    // Check if an HFA worker is already running
    const existingWorker = getHfaWorker();
    if (existingWorker) {
      throw new Error(
        "An HFA operation is already in progress. Please wait for it to complete."
      );
    }

    // Immediately claim the lock by setting status to integrating
    await mainDb`
      UPDATE dataset_hfa_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "integrating", progress: 0 })},
        status_type = 'integrating'
    `;

    const worker = instantiateIntegrateHfaDataWorker(rawDUA);

    // Store the worker reference globally
    setHfaWorker(worker);

    // Handle worker crash
    worker.addEventListener("error", async (e) => {
      console.error("Integration worker crashed:", e);
      e.preventDefault(); // Prevent the error from propagating and crashing the server
      try {
        await mainDb`
          UPDATE dataset_hfa_upload_attempts 
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
      setHfaWorker(null);
    });

    // Handle successful completion
    worker.addEventListener("message", (e) => {
      if (e.data === "COMPLETED") {
        setHfaWorker(null);
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

export async function getCurrentDatasetHfaMaxVersionId(
  mainDb: Sql
): Promise<number | undefined> {
  const maxId = (
    await mainDb<{ max_id: number }[]>`
SELECT MAX(id) AS max_id FROM dataset_hfa_versions
`
  ).at(0)?.max_id;
  return typeof maxId === "number" ? maxId : undefined;
}

export async function getCurrentDatasetHfaVersion(
  mainDb: Sql
): Promise<DatasetHfaVersion | undefined> {
  const rawDatasetVersion = (
    await mainDb<DBDatasetHfaVersion[]>`
SELECT * FROM dataset_hfa_versions
ORDER BY id DESC
LIMIT 1
`
  ).at(0);
  if (!rawDatasetVersion) {
    return undefined;
  }
  const datasetVersion: DatasetHfaVersion = {
    id: rawDatasetVersion.id,
    nRowsTotalImported: rawDatasetVersion.n_rows_total_imported,
    nRowsInserted: rawDatasetVersion.n_rows_inserted ?? undefined,
    nRowsUpdated: rawDatasetVersion.n_rows_updated ?? undefined,
    stagingResult: rawDatasetVersion.staging_result
      ? parseJsonOrUndefined<DatasetHfaCsvStagingResult>(
          rawDatasetVersion.staging_result
        )
      : undefined,
  };
  return datasetVersion;
}
