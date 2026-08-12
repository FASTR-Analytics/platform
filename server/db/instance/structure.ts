import { Sql } from "postgres";
import { resolveAssetFilePath } from "./assets.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  CsvDetails,
  StructureCsvStep1Result,
  StructureUploadAttemptDetail,
  StructureUploadAttemptStatus,
  StructureDhis2ConnectionSnapshot,
  StructureDhis2OrgUnitSelection,
  StructureColumnMappings,
  StructureStagingResult,
  StructureRecodes,
  parseJsonOrUndefined,
  throwIfErrWithData,
  getEnabledOptionalFacilityColumns,
  Dhis2Credentials,
  _OPTIONAL_FACILITY_COLUMNS,
  type FacilityFamily,
  type OptionalFacilityColumn,
  type StructureRecodableColumn,
  type StructureStagedColumnValues,
  type StructureStagedRecodeRows,
  type StructureFacilityMatch,
  type StructureIntegrateStrategy,
  type StructureIntegrateSummary,
} from "lib";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { getCsvStreamComponents } from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { getXlsxSheetNamesRaw } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";
import { stageStructureFromCsv } from "../../server_only_funcs_importing/stage_structure_from_csv.ts";
import { stageStructureFromDhis2V2 } from "../../server_only_funcs_importing/stage_structure_from_dhis2.ts";
import {
  buildDedupOrderClause,
  cleanupUnusedAdminAreas,
  getStagedColumns,
  integrateStructureFromStaging,
} from "../../server_only_funcs_importing/integrate_structure_from_staging.ts";
import { escapeSqlString, tryCatchDatabaseAsync } from "./../utils.ts";
import { DBStructureUploadAttempt } from "./_main_database_types.ts";
import { getMaxAdminAreaConfig, getFacilityColumnsConfig } from "./config.ts";
import { resolveDhis2Credentials } from "./instance_dhis2_credentials.ts";
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

export async function listAdminArea2s(
  mainDb: Sql
): Promise<APIResponseWithData<string[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const adminArea2s = (
      await mainDb<
        { admin_area_2: string }[]
      >`SELECT admin_area_2 FROM admin_areas_2 ORDER BY LOWER(admin_area_2)`
    ).map((r) => r.admin_area_2);
    return { success: true, data: adminArea2s };
  });
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
          recodes = NULL,
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
          recodes: undefined,
        },
      };
    }

    const step3Result = await getStep3ResultWithFreshMatch(mainDb, rawUA);

    if (rawUA.source_type === "dhis2") {
      return {
        success: true,
        data: {
          ...baseData,
          step: rawUA.step as 1 | 2 | 3 | 4,
          sourceType: "dhis2",
          step1Result: parseJsonOrUndefined(rawUA.step_1_result) as
            | StructureDhis2ConnectionSnapshot
            | undefined,
          step2Result: parseJsonOrUndefined(rawUA.step_2_result) as
            | StructureDhis2OrgUnitSelection
            | undefined,
          step3Result,
          recodes: parseJsonOrUndefined(rawUA.recodes) as
            | StructureRecodes
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
          step1Result: rawUA.step_1_result
            ? parseCsvStep1Result(rawUA.step_1_result)
            : undefined,
          step2Result: parseJsonOrUndefined(rawUA.step_2_result) as
            | StructureColumnMappings
            | undefined,
          step3Result,
          recodes: parseJsonOrUndefined(rawUA.recodes) as
            | StructureRecodes
            | undefined,
        },
      };
    }
  });
}

// Resolves the stored instance DHIS2 credentials for a structure import in
// progress, guarding against the stored connection being replaced mid-wizard:
// the step-1 snapshot pins the URL that was confirmed, so a later repoint
// fails loudly here rather than silently fetching from a different server.
export async function getStructureDhis2ResolvedCredentials(
  mainDb: Sql,
  family: FacilityFamily
): Promise<APIResponseWithData<Dhis2Credentials>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawUA = await getRawUAOrThrow(mainDb, family);
    if (rawUA.source_type !== "dhis2" || !rawUA.step_1_result) {
      return {
        success: false,
        err: "No DHIS2 connection confirmed. Please confirm the connection first.",
      };
    }
    const snapshot = JSON.parse(
      rawUA.step_1_result
    ) as StructureDhis2ConnectionSnapshot;
    const credentials = await resolveDhis2Credentials(mainDb, { kind: "stored" });
    if (credentials.url !== snapshot.url) {
      return {
        success: false,
        err: "The stored DHIS2 connection changed since this step was confirmed — redo step 1.",
      };
    }
    return { success: true, data: credentials };
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
        recodes = NULL,
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

export async function structureStep1Dhis2_ConfirmConnection(
  mainDb: Sql,
  family: FacilityFamily,
  snapshot: StructureDhis2ConnectionSnapshot
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
        step_1_result = ${JSON.stringify(snapshot)},
        step_2_result = NULL,
        step_3_result = NULL,
        recodes = NULL,
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
        recodes = NULL,
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
        recodes = NULL,
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
        recodes = NULL,
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
      recodes = NULL,
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
      err: "DHIS2 connection and selection steps not completed",
    };
  }
  const resCredentials = await getStructureDhis2ResolvedCredentials(mainDb, family);
  if (!resCredentials.success) {
    return resCredentials;
  }
  if (!(await claimImportSlot(mainDb, family, "importing_dhis2"))) {
    return {
      success: false,
      err: "DHIS2 structure staging is already in progress",
    };
  }
  try {
    if (onProgress) await onProgress(0.05, "Connecting to DHIS2 server...");

    const selection = JSON.parse(
      rawUA.step_2_result
    ) as StructureDhis2OrgUnitSelection;

    const resStaging = await stageStructureFromDhis2V2(
      mainDb,
      family,
      resCredentials.data,
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

// The review step's shared read gate: the staged data is only reviewable when
// the attempt is at step 4, no restage is running (the staging table exists
// but is half-populated mid-restage), and the staging table is live. Column
// scope is computed exactly as integrate computes it; raw getStagedColumns
// output (which contains rowid, unordered) is never exposed to the client.
type StagedReviewContext = {
  rawUA: DBStructureUploadAttempt;
  stagingTableName: string;
  stagedOptionalColumns: OptionalFacilityColumn[];
  writeColumns: string[];
  displayColumns: string[];
};

async function getStagedReviewContext(
  mainDb: Sql,
  family: FacilityFamily
): Promise<APIResponseWithData<StagedReviewContext>> {
  const notReady = {
    success: false as const,
    err: "Staging is not ready — complete the staging step first.",
  };
  const rawUA = await getRawUA(mainDb, family);
  if (!rawUA || rawUA.step !== 4 || rawUA.status_type === "importing") {
    return notReady;
  }
  const step3Result = parseJsonOrUndefined(rawUA.step_3_result) as
    | StructureStagingResult
    | undefined;
  if (!step3Result?.stagingTableName) {
    return notReady;
  }
  const reg = await mainDb<{ reg: string | null }[]>`
    SELECT to_regclass(${step3Result.stagingTableName})::text AS reg
  `;
  if (!reg[0]?.reg) {
    return notReady;
  }
  const stagedColumns = await getStagedColumns(
    mainDb,
    step3Result.stagingTableName
  );
  const stagedAdminAreas = stagedColumns.includes("admin_area_1");
  const stagedOptionalColumns = _OPTIONAL_FACILITY_COLUMNS.filter((c) =>
    stagedColumns.includes(c)
  );
  const writeColumns = [
    ...(stagedAdminAreas
      ? ["admin_area_1", "admin_area_2", "admin_area_3", "admin_area_4"]
      : []),
    ...stagedOptionalColumns,
  ];
  return {
    success: true,
    data: {
      rawUA,
      stagingTableName: step3Result.stagingTableName,
      stagedOptionalColumns,
      writeColumns,
      displayColumns: ["facility_id", ...writeColumns],
    },
  };
}

// Both review reads run over the DEDUPED view — identical to the ROW_NUMBER
// subquery integrate uses — so the user reviews exactly the rows integration
// will write. Ranking runs on original staged values (see integrate's overlay).
function dedupedStagingFromClause(
  stagingTableName: string,
  writeColumns: string[]
): string {
  return `FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY facility_id
        ORDER BY ${buildDedupOrderClause(writeColumns)}
      ) AS rn
      FROM ${stagingTableName}
    ) t
    WHERE rn = 1`;
}

export async function getStructureStagedColumnValues(
  mainDb: Sql,
  family: FacilityFamily,
  column: StructureRecodableColumn
): Promise<APIResponseWithData<StructureStagedColumnValues>> {
  return await tryCatchDatabaseAsync(async () => {
    const resCtx = await getStagedReviewContext(mainDb, family);
    if (!resCtx.success) {
      return resCtx;
    }
    const ctx = resCtx.data;
    if (!ctx.stagedOptionalColumns.includes(column)) {
      return { success: false, err: "This column was not staged" };
    }
    // COALESCE: staging never writes NULL today, but the columns are nullable.
    // Table name is trusted-internal from stored step_3_result; column is a
    // closed union post-Zod.
    const rows = await mainDb.unsafe<{ value: string; count: number }[]>(`
      SELECT COALESCE(${column},'') AS value, COUNT(*)::int AS count
      ${dedupedStagingFromClause(ctx.stagingTableName, ctx.writeColumns)}
      GROUP BY 1
      ORDER BY count DESC, value
      LIMIT 201
    `);
    return {
      success: true,
      data: {
        values: rows
          .slice(0, 200)
          .map((r) => ({ value: r.value, count: r.count })),
        truncated: rows.length > 200,
      },
    };
  });
}

export async function getStructureStagedRecodeRows(
  mainDb: Sql,
  family: FacilityFamily,
  column: StructureRecodableColumn,
  values: string[],
  offset: number,
  limit: number,
  csvContextColumns: string[] | undefined
): Promise<APIResponseWithData<StructureStagedRecodeRows>> {
  return await tryCatchDatabaseAsync(async () => {
    const resCtx = await getStagedReviewContext(mainDb, family);
    if (!resCtx.success) {
      return resCtx;
    }
    const ctx = resCtx.data;
    if (!ctx.stagedOptionalColumns.includes(column)) {
      return { success: false, err: "This column was not staged" };
    }
    if (values.length === 0) {
      return {
        success: true,
        data: { columns: ctx.displayColumns, rows: [], total: 0 },
      };
    }
    const inList = values.map((v) => `'${escapeSqlString(v)}'`).join(",");
    const fromClause = `${dedupedStagingFromClause(
      ctx.stagingTableName,
      ctx.writeColumns
    )} AND COALESCE(${column},'') IN (${inList})`;
    const countRows = await mainDb.unsafe<{ total: number }[]>(`
      SELECT COUNT(*)::int AS total
      ${fromClause}
    `);
    const total = countRows[0]?.total ?? 0;
    const selectList = ctx.displayColumns
      .map((c) => (c === "facility_id" ? c : `COALESCE(${c},'') AS ${c}`))
      .join(", ");
    const rows = await mainDb.unsafe<Record<string, string>[]>(`
      SELECT ${selectList}
      ${fromClause}
      ORDER BY facility_id
      LIMIT ${limit} OFFSET ${offset}
    `);
    if (csvContextColumns && csvContextColumns.length > 0 && rows.length > 0) {
      const resContext = await joinCsvContextColumns(
        ctx.rawUA,
        rows,
        csvContextColumns
      );
      if (!resContext.success) {
        return resContext;
      }
    }
    return {
      success: true,
      data: { columns: ctx.displayColumns, rows, total },
    };
  });
}

// Display-only context for the review table: unmapped CSV columns are never
// staged, so their values are joined in from the stored file at read time,
// keyed by facility id. Duplicate file rows contribute all their distinct
// non-empty values ("; "-joined) — richer for decision-making than the one
// dedup-winner row. Keys on the returned rows are the encoded header refs.
async function joinCsvContextColumns(
  rawUA: DBStructureUploadAttempt,
  rows: Record<string, string>[],
  csvContextColumns: string[]
): Promise<APIResponseNoData> {
  if (rawUA.source_type !== "csv" || !rawUA.step_1_result || !rawUA.step_2_result) {
    return {
      success: false,
      err: "Extra file columns are only available for CSV imports",
    };
  }
  const step1Result = parseCsvStep1Result(rawUA.step_1_result);
  const columnMappings = JSON.parse(
    rawUA.step_2_result
  ) as StructureColumnMappings;
  const resComponents = await getCsvStreamComponents(step1Result.csv.filePath);
  if (!resComponents.success) {
    return resComponents;
  }
  const { encodedHeaderToIndexMap, processRows } = resComponents.data;
  const facilityIdIndex = encodedHeaderToIndexMap.get(
    columnMappings.facility_id
  );
  if (facilityIdIndex === undefined) {
    return {
      success: false,
      err: "The facility ID column was not found in the uploaded file",
    };
  }
  const contextIndexes: { ref: string; index: number }[] = [];
  for (const ref of csvContextColumns) {
    const index = encodedHeaderToIndexMap.get(ref);
    if (index === undefined) {
      return {
        success: false,
        err: `Column not found in the uploaded file: ${ref}`,
      };
    }
    contextIndexes.push({ ref, index });
  }
  const valuesByFacility = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    valuesByFacility.set(row.facility_id, new Map());
  }
  await processRows((csvRow) => {
    const facilityId = csvRow[facilityIdIndex]?.trim() ?? "";
    const perFacility = valuesByFacility.get(facilityId);
    if (!perFacility) {
      return;
    }
    for (const c of contextIndexes) {
      const value = csvRow[c.index]?.trim() ?? "";
      if (!value) {
        continue;
      }
      let set = perFacility.get(c.ref);
      if (!set) {
        set = new Set<string>();
        perFacility.set(c.ref, set);
      }
      set.add(value);
    }
  });
  for (const row of rows) {
    const perFacility = valuesByFacility.get(row.facility_id);
    for (const c of contextIndexes) {
      const set = perFacility?.get(c.ref);
      row[c.ref] = set ? [...set].join("; ") : "";
    }
  }
  return { success: true };
}

export async function setStructureRecodes(
  mainDb: Sql,
  family: FacilityFamily,
  recodes: StructureRecodes,
  stagingNonce: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Drop empty per-column maps: { facility_type: {} } must not reach
    // storage — it would render VALUES () at integrate.
    const normalized: StructureRecodes = {};
    let totalAssignments = 0;
    for (const [col, map] of Object.entries(recodes)) {
      if (!map || Object.keys(map).length === 0) {
        continue;
      }
      normalized[col as StructureRecodableColumn] = map;
      totalAssignments += Object.keys(map).length;
    }
    if (totalAssignments > 5000) {
      return { success: false, err: "Too many assignments" };
    }
    // Validation-only read; the conditional UPDATE below re-checks state
    // atomically (a read-then-write guard passes mid-restage and would
    // attach stale facility_ids to a new row set).
    const resCtx = await getStagedReviewContext(mainDb, family);
    if (!resCtx.success) {
      return resCtx;
    }
    const badColumn = Object.keys(normalized).find(
      (col) =>
        !resCtx.data.stagedOptionalColumns.includes(
          col as OptionalFacilityColumn
        )
    );
    if (badColumn) {
      return {
        success: false,
        err: "Staging has changed since this page was loaded — refresh and review again.",
      };
    }
    const updated = await mainDb`
      UPDATE structure_upload_attempts
      SET recodes = ${JSON.stringify(normalized)}
      WHERE dataset_family = ${family}
        AND step = 4
        AND status_type <> 'importing'
        AND (step_3_result::jsonb->>'stagingNonce') = ${stagingNonce}
    `;
    if (updated.count === 0) {
      return {
        success: false,
        err: "Staging has changed since this page was loaded — refresh and review again.",
      };
    }
    return { success: true };
  });
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

  // Atomically claim the import slot, exactly like the step-3 stagers. The
  // step = 4 condition re-checks under the row lock that no re-staging or
  // re-configuration invalidated the staged data since we read it. RETURNING
  // gives the staging result and recodes as they stand AT CLAIM TIME — the
  // pre-claim rawUA snapshot could be stale.
  const claimed = await mainDb<
    { step_3_result: string | null; recodes: string | null }[]
  >`
    UPDATE structure_upload_attempts
    SET
      status = ${JSON.stringify({ status: "importing" })},
      status_type = 'importing'
    WHERE dataset_family = ${family}
      AND status_type <> 'importing'
      AND step = 4
      AND step_3_result IS NOT NULL
    RETURNING step_3_result, recodes
  `;
  const claimedRow = claimed.at(0);
  if (!claimedRow?.step_3_result) {
    return {
      success: false,
      err: "A structure import for this registry is already in progress.",
    };
  }

  const stagingResult = JSON.parse(
    claimedRow.step_3_result
  ) as StructureStagingResult;
  const recodes =
    (parseJsonOrUndefined(claimedRow.recodes) as StructureRecodes | undefined) ??
    {};

  try {
    // Integrate the staged data. Column scope is the staging table's own
    // columns (= what was mapped), discovered inside the integration.
    const integrationResult = await integrateStructureFromStaging(
      mainDb,
      stagingResult.stagingTableName,
      strategy,
      rawUA.dataset_family,
      recodes
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
