import { Sql } from "postgres";
import {
  APIResponseWithData,
  InstanceDetail,
  OtherUser,
  ProjectSummary,
  StructureUploadAttemptDetail,
  StructureUploadAttemptStatus,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  throwIfErrWithData,
  type DatasetType,
  type GlobalUser,
} from "lib";
import { _INSTANCE_ID, _INSTANCE_NAME } from "../../exposed_env_vars.ts";
import { detectHasAnyRows, tryCatchDatabaseAsync } from "./../utils.ts";
import {
  DBStructureUploadAttempt,
  DBUser,
  type DBProject,
  type DBProjectUserRole,
} from "./_main_database_types.ts";
import { getAssetsForInstance } from "./assets.ts";
import {
  getMaxAdminAreaConfig,
  getFacilityColumnsConfig,
  getCountryIso3Config,
} from "./config.ts";
import { getCurrentDatasetHmisMaxVersionId } from "./dataset_hmis.ts";
import { getCurrentDatasetHfaMaxVersionId } from "./dataset_hfa.ts";

export async function getIndicatorMappingsVersion(mainDb: Sql): Promise<string> {
  const result = await mainDb<{ version: string | null }[]>`
    SELECT MD5(
      COALESCE((SELECT MAX(updated_at) FROM indicators)::text, '') || '|' ||
      COALESCE((SELECT MAX(updated_at) FROM indicators_raw)::text, '') || '|' ||
      COALESCE((SELECT MAX(updated_at) FROM indicator_mappings)::text, '') || '|' ||
      (SELECT COUNT(*) FROM indicators)::text || '|' ||
      (SELECT COUNT(*) FROM indicators_raw)::text || '|' ||
      (SELECT COUNT(*) FROM indicator_mappings)::text
    ) as version
  `;
  return result[0]?.version ?? "none";
}

export async function getInstanceDetail(
  mainDb: Sql,
  globalUser: GlobalUser
): Promise<APIResponseWithData<InstanceDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    // Get maxAdminArea from config
    const maxAdminAreaRes = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(maxAdminAreaRes);
    const maxAdminArea = maxAdminAreaRes.data.maxAdminArea;

    // Get country ISO3 config
    const countryIso3Res = await getCountryIso3Config(mainDb);
    throwIfErrWithData(countryIso3Res);
    const countryIso3 = countryIso3Res.data.countryIso3;

    // Get facility columns config
    const facilityColumnsRes = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(facilityColumnsRes);
    const facilityColumns = facilityColumnsRes.data;

    // Check if admin_areas_1 has any data (determines if structure is set up)
    const adminArea1Count = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM admin_areas_1
    `;
    const hasStructureData = (adminArea1Count[0]?.count ?? 0) > 0;

    // Get structure counts if we have data
    let structure: InstanceDetail["structure"] = undefined;
    if (hasStructureData) {
      // Get counts for all admin area levels
      const adminArea1s = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM admin_areas_1
      `;
      const adminArea2s = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM admin_areas_2
      `;
      const adminArea3s = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM admin_areas_3
      `;
      const adminArea4s = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM admin_areas_4
      `;
      const facilities = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM facilities
      `;

      structure = {
        adminArea1s: adminArea1s[0]?.count ?? 0,
        adminArea2s: adminArea2s[0]?.count ?? 0,
        adminArea3s: adminArea3s[0]?.count ?? 0,
        adminArea4s: adminArea4s[0]?.count ?? 0,
        facilities: facilities[0]?.count ?? 0,
      };
    }

    // Get structure upload attempt if it exists
    const structureUploadAttemptRaw = await mainDb<DBStructureUploadAttempt[]>`
      SELECT * FROM structure_upload_attempts
    `;
    let structureUploadAttempt: StructureUploadAttemptDetail | undefined =
      undefined;
    if (structureUploadAttemptRaw.length > 0) {
      const rawUA = structureUploadAttemptRaw[0];
      const baseData = {
        id: "single_row",
        dateStarted: rawUA.date_started,
        status: parseJsonOrThrow(rawUA.status) as StructureUploadAttemptStatus,
      };

      // Return discriminated union based on step and source_type
      if (rawUA.step === 0) {
        structureUploadAttempt = {
          ...baseData,
          step: 0,
          sourceType: undefined,
          step1Result: undefined,
          step2Result: undefined,
          step3Result: undefined,
        };
      } else if (rawUA.source_type === "dhis2") {
        structureUploadAttempt = {
          ...baseData,
          step: rawUA.step as 1 | 2 | 3 | 4,
          sourceType: "dhis2",
          step1Result: parseJsonOrUndefined(rawUA.step_1_result),
          step2Result: parseJsonOrUndefined(rawUA.step_2_result),
          step3Result: parseJsonOrUndefined(rawUA.step_3_result),
        };
      } else {
        // Default to CSV
        structureUploadAttempt = {
          ...baseData,
          step: rawUA.step as 1 | 2 | 3 | 4,
          sourceType: "csv",
          step1Result: parseJsonOrUndefined(rawUA.step_1_result),
          step2Result: parseJsonOrUndefined(rawUA.step_2_result),
          step3Result: parseJsonOrUndefined(rawUA.step_3_result),
        };
      }
    }

    // Get indicator counts (both common and raw)
    const commonIndicatorsCount =
      (
        await mainDb<{ total_count: number }[]>`
        SELECT count(*) AS total_count 
        FROM indicators
      `
      ).at(0)?.total_count ?? 0;

    const rawIndicatorsCount =
      (
        await mainDb<{ total_count: number }[]>`
        SELECT count(*) AS total_count 
        FROM indicators_raw
      `
      ).at(0)?.total_count ?? 0;

    const resAssets = await getAssetsForInstance();
    if (resAssets.success === false) {
      return resAssets;
    }

    const projectSummaries = globalUser.isGlobalAdmin
      ? (
          await mainDb<
            DBProject[]
          >`SELECT * FROM projects ORDER BY LOWER(label)`
        ).map<ProjectSummary>((p) => {
          return {
            id: p.id,
            label: p.label,
            thisUserRole: "editor",
            isLocked: p.is_locked,
          };
        })
      : (
          await mainDb<
            (DBProject & DBProjectUserRole)[]
          >`SELECT * FROM project_user_roles
JOIN projects ON project_user_roles.project_id = projects.id
WHERE email = ${globalUser.email}
ORDER BY LOWER(label)`
        ).map<ProjectSummary>((p) => {
          return {
            id: p.id,
            label: p.label,
            thisUserRole: p.role === "editor" ? "editor" : "viewer",
            isLocked: p.is_locked,
          };
        });

    const datasetsWithData: DatasetType[] = [];
    if (await detectHasAnyRows(mainDb, "dataset_hmis")) {
      datasetsWithData.push("hmis");
    }
    if (await detectHasAnyRows(mainDb, "dataset_hfa")) {
      datasetsWithData.push("hfa");
    }

    const hmisVersion = await getCurrentDatasetHmisMaxVersionId(mainDb);
    const hfaVersion = await getCurrentDatasetHfaMaxVersionId(mainDb);

    const structureLastUpdatedRow = (
      await mainDb<{ config_json_value: string }[]>`
        SELECT config_json_value
        FROM instance_config
        WHERE config_key = 'structure_last_updated'
      `
    ).at(0);
    const structureLastUpdated = structureLastUpdatedRow
      ? JSON.parse(structureLastUpdatedRow.config_json_value)
      : undefined;

    const users = (await mainDb<DBUser[]>`SELECT * FROM users`).map<OtherUser>(
      (rawUser) => {
        return {
          email: rawUser.email,
          isGlobalAdmin: rawUser.is_admin,
        };
      }
    );

    // Get cache version for indicators (includes counts to detect deletions)
    const indicatorMappingsVersion = await getIndicatorMappingsVersion(mainDb);

    const instanceDetails: InstanceDetail = {
      instanceId: _INSTANCE_ID,
      instanceName: _INSTANCE_NAME,
      maxAdminArea,
      countryIso3,
      facilityColumns,
      structure,
      structureUploadAttempt,
      structureLastUpdated,
      indicators: {
        commonIndicators: commonIndicatorsCount,
        rawIndicators: rawIndicatorsCount,
      },
      assets: resAssets.data,
      datasetsWithData,
      datasetVersions: {
        hmis: hmisVersion,
        hfa: hfaVersion,
      },
      projects: projectSummaries,
      users,
      cacheVersions: {
        indicatorMappings: indicatorMappingsVersion,
        facilities: undefined,
        adminAreas: undefined,
        projects: undefined,
        datasets: undefined,
        modules: undefined,
        users: undefined,
      },
    };
    return { success: true, data: instanceDetails };
  });
}
