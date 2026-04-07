import { Sql } from "postgres";
import {
  APIResponseWithData,
  InstanceDetail,
  OtherUser,
  ProjectSummary,
  throwIfErrWithData,
  type DatasetType,
  type GlobalUser,
  type InstanceDatasetsSummary,
  type InstanceIndicatorsSummary,
  type InstanceStructureSummary,
} from "lib";
import { _INSTANCE_ID, _INSTANCE_NAME } from "../../exposed_env_vars.ts";
import { detectHasAnyRows, tryCatchDatabaseAsync } from "./../utils.ts";
import {
  DBUser,
  type DBProject,
  type DBProjectUserRole,
} from "./_main_database_types.ts";
import { getAssetsForInstance } from "./assets.ts";
import { getGeoJsonMapSummaries } from "./geojson_maps.ts";
import {
  getMaxAdminAreaConfig,
  getFacilityColumnsConfig,
  getCountryIso3Config,
} from "./config.ts";
import { getCurrentDatasetHmisMaxVersionId } from "./dataset_hmis.ts";
import { computeHfaCacheHash } from "./dataset_hfa.ts";

export async function getHfaIndicatorsVersion(mainDb: Sql): Promise<string> {
  const result = await mainDb<{ version: string | null }[]>`
    SELECT MD5(
      COALESCE((SELECT MAX(updated_at) FROM hfa_indicators)::text, '') || '|' ||
      (SELECT COUNT(*) FROM hfa_indicators)::text
    ) as version
  `;
  return result[0]?.version ?? "none";
}

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

export async function getInstanceUsers(mainDb: Sql): Promise<OtherUser[]> {
  return (await mainDb<DBUser[]>`SELECT * FROM users`).map<OtherUser>(
    (rawUser) => {
      if (rawUser.is_admin) {
        return {
          email: rawUser.email,
          isGlobalAdmin: true,
          can_configure_users: true,
          can_view_users: true,
          can_view_logs: true,
          can_configure_settings: true,
          can_configure_assets: true,
          can_configure_data: true,
          can_view_data: true,
          can_create_projects: true,
        };
      }
      return {
        email: rawUser.email,
        isGlobalAdmin: false,
        can_configure_users: rawUser.can_configure_users,
        can_view_users: rawUser.can_view_users,
        can_view_logs: rawUser.can_view_logs,
        can_configure_settings: rawUser.can_configure_settings,
        can_configure_assets: rawUser.can_configure_assets,
        can_configure_data: rawUser.can_configure_data,
        can_view_data: rawUser.can_view_data,
        can_create_projects: rawUser.can_create_projects,
      };
    },
  );
}

export async function getInstanceIndicatorsSummary(
  mainDb: Sql,
): Promise<InstanceIndicatorsSummary> {
  const commonIndicators =
    (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM indicators`)[0]?.count ?? 0;
  const rawIndicators =
    (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM indicators_raw`)[0]?.count ?? 0;
  const hfaIndicators =
    (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM hfa_indicators`)[0]?.count ?? 0;
  const indicatorMappingsVersion = await getIndicatorMappingsVersion(mainDb);
  const hfaIndicatorsVersion = await getHfaIndicatorsVersion(mainDb);
  return {
    indicators: { commonIndicators, rawIndicators, hfaIndicators },
    indicatorMappingsVersion,
    hfaIndicatorsVersion,
  };
}

export async function getInstanceStructureSummary(
  mainDb: Sql,
): Promise<InstanceStructureSummary> {
  const adminArea1s = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM admin_areas_1`)[0]?.count ?? 0;
  const hasData = adminArea1s > 0;
  if (!hasData) {
    return { structure: undefined, structureLastUpdated: undefined };
  }
  const adminArea2s = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM admin_areas_2`)[0]?.count ?? 0;
  const adminArea3s = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM admin_areas_3`)[0]?.count ?? 0;
  const adminArea4s = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM admin_areas_4`)[0]?.count ?? 0;
  const facilities = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM facilities`)[0]?.count ?? 0;
  const lastUpdatedRow = (
    await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config WHERE config_key = 'structure_last_updated'
    `
  ).at(0);
  return {
    structure: { adminArea1s, adminArea2s, adminArea3s, adminArea4s, facilities },
    structureLastUpdated: lastUpdatedRow ? JSON.parse(lastUpdatedRow.config_json_value) : undefined,
  };
}

export async function getInstanceDatasetsSummary(
  mainDb: Sql,
): Promise<InstanceDatasetsSummary> {
  const datasetsWithData: DatasetType[] = [];
  if (await detectHasAnyRows(mainDb, "dataset_hmis")) {
    datasetsWithData.push("hmis");
  }
  if (await detectHasAnyRows(mainDb, "dataset_hfa")) {
    datasetsWithData.push("hfa");
  }
  const hmis = await getCurrentDatasetHmisMaxVersionId(mainDb);
  const hmisNVersions = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM dataset_hmis_versions`)[0]?.count ?? 0;
  const hfaTimePointRows = await mainDb<{ time_point: string; time_point_label: string; date_imported: string | null }[]>`
    SELECT time_point, time_point_label, date_imported FROM dataset_hfa_dictionary_time_points ORDER BY time_point
  `;
  const hfaCacheHash = computeHfaCacheHash(hfaTimePointRows);
  return {
    datasetsWithData,
    datasetVersions: { hmis, hfa: hfaTimePointRows.length > 0 ? hfaTimePointRows.length : undefined },
    hmisNVersions,
    hfaTimePoints: hfaTimePointRows.map((r) => ({
      timePoint: r.time_point,
      timePointLabel: r.time_point_label,
      dateImported: r.date_imported ?? undefined,
    })),
    hfaCacheHash,
  };
}

export async function getAllProjectSummaries(mainDb: Sql): Promise<ProjectSummary[]> {
  return (
    await mainDb<DBProject[]>`SELECT * FROM projects ORDER BY LOWER(label)`
  ).map<ProjectSummary>((p) => ({
    id: p.id,
    label: p.label,
    thisUserRole: "editor",
    isLocked: p.is_locked,
    status: p.status as ProjectSummary["status"],
  }));
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

    const hfaIndicatorsCount =
      (
        await mainDb<{ total_count: number }[]>`
        SELECT count(*) AS total_count
        FROM hfa_indicators
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
            status: p.status as ProjectSummary["status"],
          };
        })
      : (
          await mainDb<
            (DBProject & DBProjectUserRole)[]
          >`SELECT * FROM project_user_roles
JOIN projects ON project_user_roles.project_id = projects.id
WHERE email = ${globalUser.email}
AND (
  can_configure_settings OR can_create_backups OR can_restore_backups OR
  can_configure_modules OR can_run_modules OR can_configure_users OR
  can_configure_visualizations OR can_view_visualizations OR
  can_configure_reports OR can_view_reports OR
  can_configure_slide_decks OR can_view_slide_decks OR
  can_configure_data OR can_view_data OR can_view_metrics OR can_view_logs
)
ORDER BY LOWER(label)`
        ).map<ProjectSummary>((p) => {
          return {
            id: p.id,
            label: p.label,
            thisUserRole: p.role === "editor" ? "editor" : "viewer",
            isLocked: p.is_locked,
            status: p.status as ProjectSummary["status"],
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
    const hfaTimePointCount = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM dataset_hfa_dictionary_time_points`)[0].count;

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

    const users = await getInstanceUsers(mainDb);

    const instanceDetails: InstanceDetail = {
      instanceId: _INSTANCE_ID,
      instanceName: _INSTANCE_NAME,
      maxAdminArea,
      countryIso3,
      facilityColumns,
      structure,
      structureLastUpdated,
      indicators: {
        commonIndicators: commonIndicatorsCount,
        rawIndicators: rawIndicatorsCount,
        hfaIndicators: hfaIndicatorsCount,
      },
      assets: resAssets.data,
      geojsonMaps: await getGeoJsonMapSummaries(mainDb),
      datasetsWithData,
      datasetVersions: {
        hmis: hmisVersion,
        hfa: hfaTimePointCount > 0 ? hfaTimePointCount : undefined,
      },
      projects: projectSummaries,
      users,
    };
    return { success: true, data: instanceDetails };
  });
}
