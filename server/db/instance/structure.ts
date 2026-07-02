import { Sql } from "postgres";
import { resolveAssetFilePath } from "./assets.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  CsvDetails,
  StructureCsvStep1Result,
  StructureUploadAttemptDetail,
  StructureUploadAttemptStatus,
  StructureDhis2OrgUnitSelection,
  StructureColumnMappings,
  StructureStagingResult,
  parseJsonOrUndefined,
  throwIfErrWithData,
  getEnabledOptionalFacilityColumns,
  Dhis2Credentials,
  type FacilityFamily,
  type StructureFacilityMatch,
  type StructureIntegrateStrategy,
  type StructureIntegrateSummary,
} from "lib";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { getXlsxSheetNamesRaw } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";
import { stageStructureFromCsv } from "../../server_only_funcs_importing/stage_structure_from_csv.ts";
import { stageStructureFromDhis2V2 } from "../../server_only_funcs_importing/stage_structure_from_dhis2.ts";
import {
  cleanupUnusedAdminAreas,
  integrateStructureFromStaging,
} from "../../server_only_funcs_importing/integrate_structure_from_staging.ts";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { DBStructureUploadAttempt } from "./_main_database_types.ts";
import { getMaxAdminAreaConfig, getFacilityColumnsConfig } from "./config.ts";
import { toNum0 } from "@timroberton/panther";

async function getRawUA(
  mainDb: Sql,
  family: FacilityFamily
): Promise<DBStructureUploadAttempt | undefined> {
  return (
    await mainDb<DBStructureUploadAttempt[]>`
      SELECT * FROM structure_upload_attempts WHERE dataset_family = ${family}
    `
  ).at(0);
}

async function getRawUAOrThrow(
  mainDb: Sql,
  family: FacilityFamily
): Promise<DBStructureUploadAttempt> {
  const rawUA = await getRawUA(mainDb, family);
  if (!rawUA) {
    throw new Error("No upload attempt exists");
  }
  return rawUA;
}

// Attempts created before the optional ODK questionnaire stored bare
// CsvDetails in step_1_result; normalize to the { csv, xlsForm? } shape.
function parseCsvStep1Result(raw: string): StructureCsvStep1Result {
  const parsed = JSON.parse(raw) as StructureCsvStep1Result | CsvDetails;
  if ("csv" in parsed) {
    return parsed;
  }
  return { csv: parsed };
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

export function facilitiesTableForFacilityFamily(
  family: FacilityFamily
): string {
  return family === "hmis" ? "facilities_hmis" : "facilities_hfa";
}

export async function getStructureItems(
  mainDb: Sql,
  family: FacilityFamily,
  limit?: number
): Promise<
  APIResponseWithData<{ totalCount: number; items: Record<string, string>[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const facilitiesTable = facilitiesTableForFacilityFamily(family);

    // Get maxAdminArea to determine which columns to return
    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);
    const maxAdminArea = resMaxAdminArea.data.maxAdminArea;

    // Get facility columns config to know which optional columns to include
    const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(resFacilityConfig);
    const facilityConfig = resFacilityConfig.data;

    const counts = await mainDb<{ total_count: number }[]>`
      SELECT count(*) AS total_count FROM ${mainDb(facilitiesTable)}
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
      SELECT ${columns.join(", ")} FROM ${facilitiesTable}${limitClause}
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
      SELECT COUNT(*) as count FROM hfa_data
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

    // Weights would vanish via the ON DELETE CASCADE FK — refuse, like the
    // replace_all integrate strategy does, instead of destroying them silently.
    const weightsCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM hfa_facility_weights
    `;
    if ((weightsCount[0]?.count || 0) > 0) {
      return {
        success: false,
        err: "Cannot delete structure data: HFA sampling weights still reference the facilities. Delete the HFA sampling weights first.",
      };
    }

    // Delete all structure data in a transaction
    await mainDb.begin(async (sql) => {
      // Delete facilities first due to foreign key constraints
      await sql`DELETE FROM facilities_hmis`;
      await sql`DELETE FROM facilities_hfa`;

      // Delete all admin areas tables (in reverse order due to foreign keys)
      for (let i = 4; i >= 1; i--) {
        await sql`DELETE FROM ${sql(`admin_areas_${i}`)}`;
      }

      // Bump the version the client structure-items caches are keyed on
      await sql`
        INSERT INTO instance_config (config_key, config_json_value)
        VALUES ('structure_last_updated', ${JSON.stringify(new Date().toISOString())})
        ON CONFLICT (config_key)
        DO UPDATE SET config_json_value = EXCLUDED.config_json_value
      `;
    });

    return { success: true };
  });
}

export async function deleteFamilyFacilities(
  mainDb: Sql,
  family: FacilityFamily
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const datasetCount =
      family === "hmis"
        ? await mainDb<{ count: number }[]>`
            SELECT COUNT(*) as count FROM dataset_hmis
          `
        : await mainDb<{ count: number }[]>`
            SELECT COUNT(*) as count FROM hfa_data
          `;

    if ((datasetCount[0]?.count || 0) > 0) {
      return {
        success: false,
        err: `Cannot delete ${family.toUpperCase()} facilities because they are referenced by an existing ${family.toUpperCase()} dataset (${toNum0(
          datasetCount[0].count
        )} records). Please delete the dataset first.`,
      };
    }

    if (family === "hfa") {
      // Weights would vanish via the ON DELETE CASCADE FK — refuse, like the
      // replace_all integrate strategy does, instead of destroying them silently.
      const weightsCount = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM hfa_facility_weights
      `;
      if ((weightsCount[0]?.count || 0) > 0) {
        return {
          success: false,
          err: "Cannot delete HFA facilities: sampling weights still reference them. Delete the HFA sampling weights first.",
        };
      }
    }

    await mainDb.begin(async (sql) => {
      await sql`DELETE FROM ${sql(facilitiesTableForFacilityFamily(family))}`;
      // Admin areas referenced only by this family's facilities are now orphans
      await cleanupUnusedAdminAreas(sql);
      // Bump the version the client structure-items caches are keyed on
      await sql`
        INSERT INTO instance_config (config_key, config_json_value)
        VALUES ('structure_last_updated', ${JSON.stringify(new Date().toISOString())})
        ON CONFLICT (config_key)
        DO UPDATE SET config_json_value = EXCLUDED.config_json_value
      `;
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
  mainDb: Sql,
  datasetFamily: FacilityFamily
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const existing = await getRawUA(mainDb, datasetFamily);
    const currentTime = new Date().toISOString();

    // Only this family's own in-progress import blocks a restart; the other
    // registry's import is a separate row and is never touched.
    if (existing && existing.status_type === "importing") {
      return {
        success: false,
        err: "A facility import is currently running for this registry. Wait for it to finish before starting another.",
      };
    }

    // HFA facilities only come from CSV, so the source-type step is skipped
    const initialStep = datasetFamily === "hfa" ? 1 : 0;
    const initialSourceType = datasetFamily === "hfa" ? "csv" : null;

    if (existing) {
      // Reset if already exists. The importing guard above means no stager is
      // using the staging table, so drop the previous stage's leftover copy.
      await mainDb.unsafe(
        `DROP TABLE IF EXISTS temp_structure_staging_${datasetFamily}`
      );
      await mainDb`
        UPDATE structure_upload_attempts
        SET
          date_started = ${currentTime},
          step = ${initialStep},
          source_type = ${initialSourceType},
          step_1_result = NULL,
          step_2_result = NULL,
          step_3_result = NULL,
          status = ${JSON.stringify({ status: "configuring" })},
          status_type = 'configuring'
        WHERE dataset_family = ${datasetFamily}
      `;
    } else {
      await mainDb`
        INSERT INTO structure_upload_attempts (
          date_started,
          step,
          dataset_family,
          source_type,
          status,
          status_type
        )
        VALUES (
          ${currentTime},
          ${initialStep},
          ${datasetFamily},
          ${initialSourceType},
          ${JSON.stringify({ status: "configuring" })},
          'configuring'
        )
      `;
    }
    return { success: true };
  });
}

export async function getStructureUploadAttempt(
  mainDb: Sql,
  family: FacilityFamily
): Promise<APIResponseWithData<StructureUploadAttemptDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    const baseData = {
      id: family,
      dateStarted: rawUA.date_started,
      status: JSON.parse(rawUA.status) as StructureUploadAttemptStatus,
      datasetFamily: rawUA.dataset_family,
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

    const step3Result = await getStep3ResultWithFreshMatch(mainDb, rawUA);

    if (rawUA.source_type === "dhis2") {
      const rawCredentials = parseJsonOrUndefined(rawUA.step_1_result) as
        | Dhis2Credentials
        | undefined;
      return {
        success: true,
        data: {
          ...baseData,
          step: rawUA.step as 1 | 2 | 3 | 4,
          sourceType: "dhis2",
          step1Result: rawCredentials
            ? {
                url: rawCredentials.url,
                username: rawCredentials.username,
                hasPassword: true as const,
              }
            : undefined,
          step2Result: parseJsonOrUndefined(rawUA.step_2_result) as
            | StructureDhis2OrgUnitSelection
            | undefined,
          step3Result,
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
          step1Result: rawUA.step_1_result
            ? parseCsvStep1Result(rawUA.step_1_result)
            : undefined,
          step2Result: parseJsonOrUndefined(rawUA.step_2_result) as
            | StructureColumnMappings
            | undefined,
          step3Result,
        },
      };
    }
  });
}

// Server-side only: the unredacted credentials for talking to DHIS2. Never
// return these through a route response.
export async function getStructureDhis2Credentials(
  mainDb: Sql,
  family: FacilityFamily
): Promise<APIResponseWithData<Dhis2Credentials>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    if (rawUA.source_type !== "dhis2" || !rawUA.step_1_result) {
      return {
        success: false,
        err: "No DHIS2 credentials found. Please confirm credentials first.",
      };
    }
    return {
      success: true,
      data: JSON.parse(rawUA.step_1_result) as Dhis2Credentials,
    };
  });
}

export async function deleteStructureUploadAttempt(
  mainDb: Sql,
  family: FacilityFamily
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Deliberately allowed while importing: it is the universal recovery for a
    // wedged attempt. A still-running stager then fails its (conditional)
    // status writes and errors out against the dropped staging table.
    await mainDb`DELETE FROM structure_upload_attempts WHERE dataset_family = ${family}`;
    await mainDb.unsafe(
      `DROP TABLE IF EXISTS temp_structure_staging_${family}`
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

export async function structureStep0_SetSourceType(
  mainDb: Sql,
  family: FacilityFamily,
  sourceType: "csv" | "dhis2"
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    if (rawUA.dataset_family === "hfa" && sourceType === "dhis2") {
      return {
        success: false,
        err: "HFA facilities can only be imported from CSV",
      };
    }
    // Conditional on not importing: an unconditional write here would release
    // a staging run's claim (and un-invalidate its state) out from under it.
    const updated = await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 1,
        source_type = ${sourceType},
        step_1_result = NULL,
        step_2_result = NULL,
        step_3_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
      WHERE dataset_family = ${family} AND status_type <> 'importing'
    `;
    if (updated.count === 0) {
      throw new Error(
        "A structure import for this registry is already in progress."
      );
    }
    return { success: true };
  });
}

export async function structureStep1Dhis2_SetCredentials(
  mainDb: Sql,
  family: FacilityFamily,
  credentials: Dhis2Credentials
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    if (!rawUA.source_type) {
      throw new Error("Not yet ready for this step");
    }
    const updated = await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 2,
        step_1_result = ${JSON.stringify(credentials)},
        step_2_result = NULL,
        step_3_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
      WHERE dataset_family = ${family} AND status_type <> 'importing'
    `;
    if (updated.count === 0) {
      throw new Error(
        "A structure import for this registry is already in progress."
      );
    }
    return { success: true };
  });
}

export async function structureStep2Dhis2_SetOrgUnitSelection(
  mainDb: Sql,
  family: FacilityFamily,
  selection: StructureDhis2OrgUnitSelection
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    if (!rawUA.source_type || !rawUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }
    const updated = await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 3,
        step_2_result = ${JSON.stringify(selection)},
        step_3_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
      WHERE dataset_family = ${family} AND status_type <> 'importing'
    `;
    if (updated.count === 0) {
      throw new Error(
        "A structure import for this registry is already in progress."
      );
    }
    return { success: true };
  });
}

export async function structureStep1Csv_UploadFile(
  mainDb: Sql,
  family: FacilityFamily,
  assetFileName: string,
  xlsFormAssetFileName: string | undefined
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    if (!rawUA.source_type) {
      throw new Error("Not yet ready for this step");
    }
    const assetFilePath = resolveAssetFilePath(assetFileName);
    const resCsvDetails = await getCsvDetails(assetFilePath, assetFileName);
    throwIfErrWithData(resCsvDetails);

    const step1Result: StructureCsvStep1Result = { csv: resCsvDetails.data };
    if (xlsFormAssetFileName) {
      const xlsFormFilePath = resolveAssetFilePath(xlsFormAssetFileName);
      const sheetNames = getXlsxSheetNamesRaw(xlsFormFilePath);
      if (!sheetNames.includes("survey") || !sheetNames.includes("choices")) {
        throw new Error(
          "XLSForm file must contain both 'survey' and 'choices' sheets"
        );
      }
      step1Result.xlsForm = {
        fileName: xlsFormAssetFileName,
        filePath: xlsFormFilePath,
      };
    }

    const updated = await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 2,
        step_1_result = ${JSON.stringify(step1Result)},
        step_2_result = NULL,
        step_3_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
      WHERE dataset_family = ${family} AND status_type <> 'importing'
    `;
    if (updated.count === 0) {
      throw new Error(
        "A structure import for this registry is already in progress."
      );
    }
    return { success: true };
  });
}

export async function structureStep2Csv_SetColumnMappings(
  mainDb: Sql,
  family: FacilityFamily,
  columnMappings: StructureColumnMappings
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    if (!rawUA.source_type || !rawUA.step_1_result) {
      throw new Error("Not yet ready for this step");
    }

    // Get maxAdminArea from config to validate mappings
    const maxAdminAreaResult = await getMaxAdminAreaConfig(mainDb);
    if (!maxAdminAreaResult.success) {
      throw new Error(maxAdminAreaResult.err);
    }
    const maxAdminArea = maxAdminAreaResult.data.maxAdminArea;

    // facility_id is the only always-required column. Admin areas are optional
    // as a group: map all levels (to place facilities) or none (a tag-only
    // update). Each intent's requirements are enforced at step 4.
    if (!columnMappings.facility_id) {
      throw new Error("Facility ID mapping is required");
    }
    const mappedAdminLevels: number[] = [];
    for (let i = 1; i <= maxAdminArea; i++) {
      const key = `admin_area_${i}` as keyof StructureColumnMappings;
      if (columnMappings[key]) {
        mappedAdminLevels.push(i);
      }
    }
    if (
      mappedAdminLevels.length > 0 &&
      mappedAdminLevels.length < maxAdminArea
    ) {
      throw new Error(
        "Map all administrative area levels, or leave them all unmapped."
      );
    }

    // Store the mappings and advance to step 3
    const updated = await mainDb`
      UPDATE structure_upload_attempts
      SET
        step = 3,
        step_2_result = ${JSON.stringify(columnMappings)},
        step_3_result = NULL,
        status = ${JSON.stringify({ status: "configuring" })},
        status_type = 'configuring'
      WHERE dataset_family = ${family} AND status_type <> 'importing'
    `;
    if (updated.count === 0) {
      throw new Error(
        "A structure import for this registry is already in progress."
      );
    }

    return { success: true };
  });
}

// Atomically claim the import slot: the conditional UPDATE + rowcount check
// is race-free, unlike a separate read-then-write guard.
async function claimImportSlot(
  mainDb: Sql,
  family: FacilityFamily,
  statusLabel: "importing" | "importing_dhis2"
): Promise<boolean> {
  const claimed = await mainDb`
    UPDATE structure_upload_attempts
    SET
      status = ${JSON.stringify({ status: statusLabel })},
      status_type = 'importing'
    WHERE dataset_family = ${family} AND status_type <> 'importing'
  `;
  return claimed.count > 0;
}

// Both handlers write conditionally on still holding the claim, so a run whose
// attempt was deleted mid-flight cannot resurrect or overwrite anything.
// Pre-commit match preview against the target family's backbone: how many of
// the staged distinct facility_ids already exist. Shown at step 4 so an
// ID-system mismatch (0 existing) is visible before committing.
async function computeFacilityMatch(
  mainDb: Sql,
  stagingTableName: string,
  family: FacilityFamily
): Promise<StructureFacilityMatch> {
  const facilitiesTable = facilitiesTableForFacilityFamily(family);
  const matchRows = await mainDb.unsafe(`
    SELECT
      COUNT(*)::int AS total_staged,
      COUNT(f.facility_id)::int AS existing
    FROM (SELECT DISTINCT facility_id FROM ${stagingTableName}) s
    LEFT JOIN ${facilitiesTable} f ON f.facility_id = s.facility_id
  `);
  const totalStaged = matchRows[0]?.total_staged ?? 0;
  const existing = matchRows[0]?.existing ?? 0;
  return { totalStaged, existing, newCount: totalStaged - existing };
}

// facilityMatch is computed once at staging success, but facilities can change
// between staging and finalize. For step-4 attempts whose staging table still
// exists, recompute against the live backbone at read time (never written
// back); if the table is gone, fall back to the stored value.
async function getStep3ResultWithFreshMatch(
  mainDb: Sql,
  rawUA: DBStructureUploadAttempt
): Promise<StructureStagingResult | undefined> {
  const stored = parseJsonOrUndefined(rawUA.step_3_result) as
    | StructureStagingResult
    | undefined;
  if (rawUA.step !== 4 || !stored?.stagingTableName) {
    return stored;
  }
  const reg = await mainDb<{ reg: string | null }[]>`
    SELECT to_regclass(${stored.stagingTableName})::text AS reg
  `;
  if (!reg[0]?.reg) {
    return stored;
  }
  return {
    ...stored,
    facilityMatch: await computeFacilityMatch(
      mainDb,
      stored.stagingTableName,
      rawUA.dataset_family
    ),
  };
}

async function handleStagingSuccess(
  mainDb: Sql,
  stagingData: StructureStagingResult,
  family: FacilityFamily
): Promise<APIResponseNoData> {
  const stagingWithMatch: StructureStagingResult = {
    ...stagingData,
    facilityMatch: await computeFacilityMatch(
      mainDb,
      stagingData.stagingTableName,
      family
    ),
  };

  // Store staging result and advance to step 4
  const updated = await mainDb`
    UPDATE structure_upload_attempts
    SET
      step = 4,
      step_3_result = ${JSON.stringify(stagingWithMatch)},
      status = ${JSON.stringify({ status: "configuring" })},
      status_type = 'configuring'
    WHERE dataset_family = ${family} AND status_type = 'importing'
  `;
  if (updated.count === 0) {
    return {
      success: false,
      err: "The upload attempt was deleted while staging was running. The staged data was discarded.",
    };
  }
  return { success: true };
}

async function handleStagingError(
  mainDb: Sql,
  family: FacilityFamily,
  error: string
): Promise<APIResponseNoData> {
  await mainDb`
    UPDATE structure_upload_attempts
    SET
      status = ${JSON.stringify({ status: "error", error })},
      status_type = 'error'
    WHERE dataset_family = ${family} AND status_type = 'importing'
  `;
  return { success: false, err: error };
}

// Validation and the claim run BEFORE the try/catch in each step-3 function:
// a failure there (including losing the claim race) must return directly and
// never reach handleStagingError, which would release the claim a concurrent
// staging run is holding.

export async function structureStep3Csv_StageDataStreaming(
  mainDb: Sql,
  family: FacilityFamily,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseNoData> {
  const rawUA = await getRawUA(mainDb, family);
  if (!rawUA) {
    return { success: false, err: "No upload attempt exists" };
  }
  if (
    rawUA.source_type !== "csv" ||
    !rawUA.step_1_result ||
    !rawUA.step_2_result
  ) {
    return {
      success: false,
      err: "CSV upload and configuration steps not completed",
    };
  }
  if (!(await claimImportSlot(mainDb, family, "importing"))) {
    return {
      success: false,
      err: "A structure import for this registry is already in progress.",
    };
  }
  try {
    const step1Result = parseCsvStep1Result(rawUA.step_1_result);
    const columnMappings = JSON.parse(
      rawUA.step_2_result
    ) as StructureColumnMappings;

    const resStaging = await stageStructureFromCsv(
      mainDb,
      family,
      step1Result.csv.filePath,
      columnMappings,
      step1Result.xlsForm?.filePath,
      onProgress
    );

    if (!resStaging.success) {
      return await handleStagingError(mainDb, family, resStaging.err);
    }

    return await handleStagingSuccess(
      mainDb,
      resStaging.data,
      rawUA.dataset_family
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during CSV staging";
    return await handleStagingError(mainDb, family, errorMessage);
  }
}

export async function structureStep3Dhis2_StageData(
  mainDb: Sql,
  family: FacilityFamily,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseNoData> {
  const rawUA = await getRawUA(mainDb, family);
  if (!rawUA) {
    return { success: false, err: "No upload attempt exists" };
  }
  if (
    rawUA.source_type !== "dhis2" ||
    !rawUA.step_1_result ||
    !rawUA.step_2_result
  ) {
    return {
      success: false,
      err: "DHIS2 credentials and selection steps not completed",
    };
  }
  if (!(await claimImportSlot(mainDb, family, "importing_dhis2"))) {
    return {
      success: false,
      err: "DHIS2 structure staging is already in progress",
    };
  }
  try {
    if (onProgress) await onProgress(0.05, "Connecting to DHIS2 server...");

    const credentials = JSON.parse(rawUA.step_1_result) as Dhis2Credentials;
    const selection = JSON.parse(
      rawUA.step_2_result
    ) as StructureDhis2OrgUnitSelection;

    const resStaging = await stageStructureFromDhis2V2(
      mainDb,
      family,
      credentials,
      selection,
      onProgress
    );

    if (!resStaging.success) {
      return await handleStagingError(mainDb, family, resStaging.err);
    }

    return await handleStagingSuccess(
      mainDb,
      resStaging.data,
      rawUA.dataset_family
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during DHIS2 staging";
    return await handleStagingError(mainDb, family, errorMessage);
  }
}

export async function structureStep4_ImportData(
  mainDb: Sql,
  family: FacilityFamily,
  strategy: StructureIntegrateStrategy
): Promise<APIResponseWithData<StructureIntegrateSummary>> {
  const rawUA = await getRawUA(mainDb, family);
  if (!rawUA) {
    return { success: false, err: "No upload attempt exists" };
  }
  if (rawUA.step !== 4 || !rawUA.step_3_result) {
    return { success: false, err: "Staging step not completed" };
  }

  const stagingResult = JSON.parse(
    rawUA.step_3_result
  ) as StructureStagingResult;

  // Atomically claim the import slot, exactly like the step-3 stagers. The
  // step = 4 condition re-checks under the row lock that no re-staging or
  // re-configuration invalidated the staged data since we read it.
  const claimed = await mainDb`
    UPDATE structure_upload_attempts
    SET
      status = ${JSON.stringify({ status: "importing" })},
      status_type = 'importing'
    WHERE dataset_family = ${family}
      AND status_type <> 'importing'
      AND step = 4
      AND step_3_result IS NOT NULL
  `;
  if (claimed.count === 0) {
    return {
      success: false,
      err: "A structure import for this registry is already in progress.",
    };
  }

  try {
    // Integrate the staged data. Column scope is the staging table's own
    // columns (= what was mapped), discovered inside the integration.
    const integrationResult = await integrateStructureFromStaging(
      mainDb,
      stagingResult.stagingTableName,
      strategy,
      rawUA.dataset_family
    );

    if (!integrationResult.success) {
      // Update status with error (only if we still hold the claim)
      await mainDb`
        UPDATE structure_upload_attempts
        SET
          status = ${JSON.stringify({
            status: "error",
            error: integrationResult.error || "Integration failed",
          })},
          status_type = 'error'
        WHERE dataset_family = ${family} AND status_type = 'importing'
      `;
      return {
        success: false,
        err: integrationResult.error || "Integration failed",
      };
    }

    // Clean up staging table. The structure_last_updated stamp is written
    // inside the integrate transaction, so a crash from here on only leaves
    // idempotent cleanup undone (recovered by the startup wedge reset).
    try {
      await mainDb.unsafe(
        `DROP TABLE IF EXISTS ${stagingResult.stagingTableName}`
      );
    } catch {
      // Ignore cleanup errors
    }

    // Delete this family's upload attempt on success
    await mainDb`DELETE FROM structure_upload_attempts WHERE dataset_family = ${family}`;

    return {
      success: true,
      data: {
        inserted: integrationResult.inserted,
        updated: integrationResult.updated,
        deleted: integrationResult.deleted,
      },
    };
  } catch (error) {
    // Update status with error (only if we still hold the claim)
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
        WHERE dataset_family = ${family} AND status_type = 'importing'
      `;
    } catch {
      // Ignore errors updating status
    }
    return { success: false, err: errorMessage };
  }
}

export async function getStructureUploadStatus(
  mainDb: Sql,
  family: FacilityFamily
): Promise<
  APIResponseWithData<{
    isActive: boolean;
    status: StructureUploadAttemptStatus;
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUA(mainDb, family);
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
