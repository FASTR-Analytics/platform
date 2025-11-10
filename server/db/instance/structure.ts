import { join } from "@std/path";
import { Sql } from "postgres";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  CsvDetails,
  StructureUploadAttemptDetail,
  StructureUploadAttemptStatus,
  StructureDhis2OrgUnitSelection,
  StructureColumnMappings,
  StructureStagingResult,
  _DATASET_LIMIT,
  parseJsonOrUndefined,
  throwIfErrWithData,
  getEnabledOptionalFacilityColumns,
  Dhis2Credentials,
  type StructureIntegrateStrategy,
} from "lib";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { stageStructureFromCsv } from "../../server_only_funcs_importing/stage_structure_from_csv.ts";
import { stageStructureFromDhis2V2 } from "../../server_only_funcs_importing/stage_structure_from_dhis2.ts";
import { integrateStructureFromStaging } from "../../server_only_funcs_importing/integrate_structure_from_staging.ts";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { DBStructureUploadAttempt } from "./_main_database_types.ts";
import { getMaxAdminAreaConfig, getFacilityColumnsConfig } from "./config.ts";
import { toNum0 } from "@timroberton/panther";

async function getRawUA(
  mainDb: Sql
): Promise<DBStructureUploadAttempt | undefined> {
  return (
    await mainDb<DBStructureUploadAttempt[]>`
      SELECT * FROM structure_upload_attempts
    `
  ).at(0);
}

async function getRawUAOrThrow(mainDb: Sql): Promise<DBStructureUploadAttempt> {
  const rawUA = await getRawUA(mainDb);
  if (!rawUA) {
    throw new Error("No upload attempt exists");
  }
  return rawUA;
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

export async function getStructureItems(
  mainDb: Sql,
  limit?: number
): Promise<
  APIResponseWithData<{ totalCount: number; items: Record<string, string>[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    // Get maxAdminArea to determine which columns to return
    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);
    const maxAdminArea = resMaxAdminArea.data.maxAdminArea;

    // Get facility columns config to know which optional columns to include
    const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(resFacilityConfig);
    const facilityConfig = resFacilityConfig.data;

    const counts = await mainDb<{ total_count: number }[]>`
      SELECT count(*) AS total_count FROM facilities
    `;

    // Build column list based on maxAdminArea and facility columns config
    const columns = ["facility_id"];
    for (let i = 1; i <= maxAdminArea; i++) {
      columns.push(`admin_area_${i}`);
    }

    // Add enabled optional columns
    columns.push(...getEnabledOptionalFacilityColumns(facilityConfig));

    // Select only the columns we need, with optional limit
    const limitClause = limit ? ` LIMIT ${limit}` : "";
    const items = await mainDb.unsafe<Record<string, string>[]>(`
      SELECT ${columns.join(", ")} FROM facilities${limitClause}
    `);

    return {
      success: true,
      data: {
        totalCount: counts.at(0)?.total_count ?? 0,
        items,
      },
    };
  });
}

export async function deleteAllStructureData(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Check if there are datasets that would prevent structure deletion
    const hmisCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM dataset_hmis
    `;
    const hfaCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM dataset_hfa
    `;

    const hmisRecords = hmisCount[0]?.count || 0;
    const hfaRecords = hfaCount[0]?.count || 0;

    if (hmisRecords > 0 || hfaRecords > 0) {
      const datasetTypes = [];
      if (hmisRecords > 0)
        datasetTypes.push(`HMIS dataset (${toNum0(hmisRecords)} records)`);
      if (hfaRecords > 0)
        datasetTypes.push(`HFA dataset (${toNum0(hfaRecords)} records)`);

      return {
        success: false,
        err: `Cannot delete structure data because it is referenced by existing ${datasetTypes.join(
          " and "
        )}. Please delete all datasets first before clearing the structure.`,
      };
    }

    // Delete all structure data in a transaction
    await mainDb.begin(async (sql) => {
      // Delete facilities first due to foreign key constraints
      await sql`DELETE FROM facilities`;

      // Delete all admin areas tables (in reverse order due to foreign keys)
      for (let i = 4; i >= 1; i--) {
        await sql`DELETE FROM ${sql(`admin_areas_${i}`)}`;
      }
    });

    return { success: true };
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

export async function addStructureUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = await getRawUA(mainDb);
    const currentTime = new Date().toISOString();

    if (existing) {
      // Reset to step 0 if already exists
      await mainDb`
        UPDATE structure_upload_attempts 
        SET 
          date_started = ${currentTime},
          step = 0, 
          source_type = NULL,
          step_1_result = NULL, 
          step_2_result = NULL, 
          status = ${JSON.stringify({ status: "configuring" })},
          status_type = 'configuring'
      `;
    } else {
      await mainDb`
        INSERT INTO structure_upload_attempts (
          date_started, 
          step, 
          status, 
          status_type
        ) 
        VALUES (
          ${currentTime}, 
          0, 
          ${JSON.stringify({ status: "configuring" })}, 
          'configuring'
        )
      `;
    }
    return { success: true };
  });
}

export async function getStructureUploadAttempt(
  mainDb: Sql
): Promise<APIResponseWithData<StructureUploadAttemptDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb);
    const baseData = {
      id: "single_row",
      dateStarted: rawUA.date_started,
      status: JSON.parse(rawUA.status) as StructureUploadAttemptStatus,
    };

    // Return discriminated union based on step and source_type
    if (rawUA.step === 0) {
      return {
        success: true,
        data: {
          ...baseData,
          step: 0,
          sourceType: undefined,
          step1Result: undefined,
          step2Result: undefined,
          step3Result: undefined,
        },
      };
    }

    if (rawUA.source_type === "dhis2") {
      return {
        success: true,
        data: {
          ...baseData,
          step: rawUA.step as 1 | 2 | 3 | 4,
          sourceType: "dhis2",
          step1Result: parseJsonOrUndefined(rawUA.step_1_result) as
            | Dhis2Credentials
            | undefined,
          step2Result: parseJsonOrUndefined(rawUA.step_2_result) as
            | StructureDhis2OrgUnitSelection
            | undefined,
          step3Result: parseJsonOrUndefined(rawUA.step_3_result) as
            | StructureStagingResult
            | undefined,
        },
      };
    } else {
      // Default to CSV
      return {
        success: true,
        data: {
          ...baseData,
          step: rawUA.step as 1 | 2 | 3 | 4,
          sourceType: "csv",
          step1Result: parseJsonOrUndefined(rawUA.step_1_result) as
            | CsvDetails
            | undefined,
          step2Result: parseJsonOrUndefined(rawUA.step_2_result) as
            | StructureColumnMappings
            | undefined,
          step3Result: parseJsonOrUndefined(rawUA.step_3_result) as
            | StructureStagingResult
            | undefined,
        },
      };
    }
  });
}

export async function deleteStructureUploadAttempt(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM structure_upload_attempts`;
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

export async function structureStep0_SetSourceType(
  mainDb: Sql,
  sourceType: "csv" | "dhis2"
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await getRawUAOrThrow(mainDb); // Verify exists
    await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 1,
        source_type = ${sourceType},
        step_1_result = NULL,
        step_2_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
    `;
    return { success: true };
  });
}

export async function structureStep1Dhis2_SetCredentials(
  mainDb: Sql,
  credentials: Dhis2Credentials
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (!rawUA.source_type) {
      throw new Error("Not yet ready for this step");
    }
    await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 2,
        step_1_result = ${JSON.stringify(credentials)},
        step_2_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
    `;
    return { success: true };
  });
}

export async function structureStep2Dhis2_SetOrgUnitSelection(
  mainDb: Sql,
  selection: StructureDhis2OrgUnitSelection
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (!rawUA.source_type || !rawUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }
    await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 3,
        step_2_result = ${JSON.stringify(selection)},
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
    `;
    return { success: true };
  });
}

export async function structureStep1Csv_UploadFile(
  mainDb: Sql,
  assetFileName: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (!rawUA.source_type) {
      throw new Error("Not yet ready for this step");
    }
    const assetFilePath = join(_ASSETS_DIR_PATH, assetFileName);
    const resCsvDetails = await getCsvDetails(assetFilePath, assetFileName);
    throwIfErrWithData(resCsvDetails);

    await mainDb`
      UPDATE structure_upload_attempts
      SET 
        step = 2, 
        step_1_result = ${JSON.stringify(resCsvDetails.data)}, 
        step_2_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
    `;
    return { success: true };
  });
}

export async function structureStep2Csv_SetColumnMappings(
  mainDb: Sql,
  columnMappings: StructureColumnMappings
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (!rawUA.source_type || !rawUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }

    // Get maxAdminArea from config to validate mappings
    const maxAdminAreaResult = await getMaxAdminAreaConfig(mainDb);
    if (!maxAdminAreaResult.success) {
      throw new Error(maxAdminAreaResult.err);
    }
    const maxAdminArea = maxAdminAreaResult.data.maxAdminArea;

    // Validate that all required admin area mappings are provided
    for (let i = 1; i <= maxAdminArea; i++) {
      const key = `admin_area_${i}` as keyof StructureColumnMappings;
      if (!columnMappings[key]) {
        throw new Error(`Missing mapping for admin_area_${i}`);
      }
    }

    // Store the mappings and advance to step 3
    await mainDb`
      UPDATE structure_upload_attempts
      SET 
        step = 3,
        step_2_result = ${JSON.stringify(columnMappings)},
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
    `;

    return { success: true };
  });
}

async function handleStagingSuccess(
  mainDb: Sql,
  stagingData: StructureStagingResult
): Promise<APIResponseNoData> {
  // Store staging result and advance to step 4
  await mainDb`
    UPDATE structure_upload_attempts
    SET 
      step = 4,
      step_3_result = ${JSON.stringify(stagingData)},
      status = ${JSON.stringify({ status: "configuring" })},
      status_type = 'configuring'
  `;
  return { success: true };
}

async function handleStagingError(
  mainDb: Sql,
  error: string
): Promise<APIResponseNoData> {
  await mainDb`
    UPDATE structure_upload_attempts
    SET 
      status = ${JSON.stringify({ status: "error", error })},
      status_type = 'error'
  `;
  return { success: false, err: error };
}

export async function structureStep3Csv_StageData(
  mainDb: Sql
): Promise<APIResponseNoData> {
  try {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (
      rawUA.source_type !== "csv" ||
      !rawUA.step_1_result ||
      !rawUA.step_2_result
    ) {
      throw new Error("CSV upload and configuration steps not completed");
    }

    // Update status to staging
    await mainDb`
      UPDATE structure_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "importing" })},
        status_type = 'importing'
    `;

    // Parse CSV data
    const csvDetails = JSON.parse(rawUA.step_1_result) as CsvDetails;
    const columnMappings = JSON.parse(
      rawUA.step_2_result
    ) as StructureColumnMappings;

    // Run CSV staging
    const resStaging = await stageStructureFromCsv(
      mainDb,
      csvDetails.filePath,
      columnMappings
    );

    if (!resStaging.success) {
      return await handleStagingError(mainDb, resStaging.err);
    }

    return await handleStagingSuccess(mainDb, resStaging.data);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during CSV staging";
    return await handleStagingError(mainDb, errorMessage);
  }
}

export async function structureStep3Csv_StageDataStreaming(
  mainDb: Sql,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseNoData> {
  try {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (
      rawUA.source_type !== "csv" ||
      !rawUA.step_1_result ||
      !rawUA.step_2_result
    ) {
      throw new Error("CSV upload and configuration steps not completed");
    }

    // Update status to staging
    await mainDb`
      UPDATE structure_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "importing" })},
        status_type = 'importing'
    `;

    // Parse CSV data
    const csvDetails = JSON.parse(rawUA.step_1_result) as CsvDetails;
    const columnMappings = JSON.parse(
      rawUA.step_2_result
    ) as StructureColumnMappings;

    // Run CSV staging with progress callback
    const resStaging = await stageStructureFromCsv(
      mainDb,
      csvDetails.filePath,
      columnMappings,
      onProgress
    );

    if (!resStaging.success) {
      return await handleStagingError(mainDb, resStaging.err);
    }

    return await handleStagingSuccess(mainDb, resStaging.data);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during CSV staging";
    return await handleStagingError(mainDb, errorMessage);
  }
}

export async function structureStep3Dhis2_StageData(
  mainDb: Sql,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseNoData> {
  try {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (
      rawUA.source_type !== "dhis2" ||
      !rawUA.step_1_result ||
      !rawUA.step_2_result
    ) {
      throw new Error("DHIS2 credentials and selection steps not completed");
    }

    // Check if an import is already in progress
    if (rawUA.status_type === "importing") {
      throw new Error("DHIS2 structure staging is already in progress");
    }

    if (onProgress) await onProgress(0.05, "Connecting to DHIS2 server...");

    // Update status to staging
    await mainDb`
      UPDATE structure_upload_attempts
      SET
        status = ${JSON.stringify({ status: "importing_dhis2" })},
        status_type = 'importing'
    `;

    // Parse DHIS2 data
    const credentials = JSON.parse(rawUA.step_1_result) as Dhis2Credentials;
    const selection = JSON.parse(
      rawUA.step_2_result
    ) as StructureDhis2OrgUnitSelection;

    // Run DHIS2 staging
    const resStaging = await stageStructureFromDhis2V2(
      mainDb,
      credentials,
      selection,
      onProgress
    );

    if (!resStaging.success) {
      return resStaging;
      // return await handleStagingError(mainDb, resStaging.err);
    }

    return await handleStagingSuccess(mainDb, resStaging.data);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during DHIS2 staging";
    return await handleStagingError(mainDb, errorMessage);
  }
}

export async function structureStep4_ImportData(
  mainDb: Sql,
  strategy: StructureIntegrateStrategy
): Promise<APIResponseNoData> {
  try {
    const rawUA = await getRawUAOrThrow(mainDb);
    if (!rawUA.step_3_result) {
      throw new Error("Staging step not completed");
    }

    const stagingResult = JSON.parse(
      rawUA.step_3_result
    ) as StructureStagingResult;

    // Update status to integrating
    await mainDb`
      UPDATE structure_upload_attempts
      SET 
        status = ${JSON.stringify({ status: "importing" })},
        status_type = 'importing'
    `;

    // Get enabled optional columns for integration
    const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(resFacilityConfig);
    const enabledOptionalColumns = getEnabledOptionalFacilityColumns(
      resFacilityConfig.data
    );

    // Integrate the staged data
    const integrationResult = await integrateStructureFromStaging(
      mainDb,
      stagingResult.stagingTableName,
      strategy,
      enabledOptionalColumns
    );

    if (!integrationResult.success) {
      // Update status with error
      await mainDb`
        UPDATE structure_upload_attempts
        SET 
          status = ${JSON.stringify({
            status: "error",
            error: integrationResult.error || "Integration failed",
          })},
          status_type = 'error'
      `;
      return {
        success: false,
        err: integrationResult.error || "Integration failed",
      };
    }

    // Clean up staging table
    try {
      await mainDb.unsafe(
        `DROP TABLE IF EXISTS ${stagingResult.stagingTableName}`
      );
    } catch {
      // Ignore cleanup errors
    }

    // Store timestamp of structure completion
    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('structure_last_updated', ${JSON.stringify(new Date().toISOString())})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = EXCLUDED.config_json_value
    `;

    // Delete upload attempt on success
    await mainDb`DELETE FROM structure_upload_attempts`;

    return { success: true };
  } catch (error) {
    // Update status with error
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during integration";
    try {
      await mainDb`
        UPDATE structure_upload_attempts
        SET 
          status = ${JSON.stringify({ status: "error", error: errorMessage })},
          status_type = 'error'
      `;
    } catch {
      // Ignore errors updating status
    }
    return { success: false, err: errorMessage };
  }
}

export async function getStructureUploadStatus(mainDb: Sql): Promise<
  APIResponseWithData<{
    isActive: boolean;
    status: StructureUploadAttemptStatus;
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUA(mainDb);
    if (!rawUA) {
      return {
        success: true,
        data: {
          isActive: false,
          status: { status: "configuring" },
        },
      };
    }

    const status = JSON.parse(rawUA.status) as StructureUploadAttemptStatus;
    const isActive = rawUA.status_type === "importing";

    return {
      success: true,
      data: {
        isActive,
        status,
      },
    };
  });
}
