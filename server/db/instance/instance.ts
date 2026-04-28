import { Sql } from "postgres";
import {
  APIResponseWithData,
  InstanceDetail,
  OtherUser,
  ProjectSummary,
  throwIfErrWithData,
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  buildUserPermissionsFromRow,
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
  getAdminAreaLabelsConfig,
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

export async function getCalculatedIndicatorsVersion(
  mainDb: Sql,
): Promise<string> {
  const result = await mainDb<{ version: string | null }[]>`
    SELECT MD5(
      COALESCE((SELECT MAX(updated_at) FROM calculated_indicators)::text, '') || '|' ||
      (SELECT COUNT(*) FROM calculated_indicators)::text
    ) as version
  `;
  return result[0]?.version ?? "none";
}

export async function getIndicatorMappingsVersion(
  mainDb: Sql,
): Promise<string> {
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
    (rawUser) => ({
      email: rawUser.email,
      isGlobalAdmin: rawUser.is_admin,
      firstName: rawUser.first_name ?? undefined,
      lastName: rawUser.last_name ?? undefined,
      ...(rawUser.is_admin
        ? _USER_PERMISSIONS_DEFAULT_FULL_ACCESS
        : buildUserPermissionsFromRow(rawUser)),
    }),
  );
}

export async function getInstanceIndicatorsSummary(
  mainDb: Sql,
): Promise<InstanceIndicatorsSummary> {
  const commonIndicators =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM indicators`
    )[0]?.count ?? 0;
  const rawIndicators =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM indicators_raw`
    )[0]?.count ?? 0;
  const hfaIndicators =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM hfa_indicators`
    )[0]?.count ?? 0;
  const calculatedIndicators =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM calculated_indicators`
    )[0]?.count ?? 0;
  const indicatorMappingsVersion = await getIndicatorMappingsVersion(mainDb);
  const hfaIndicatorsVersion = await getHfaIndicatorsVersion(mainDb);
  const calculatedIndicatorsVersion =
    await getCalculatedIndicatorsVersion(mainDb);
  return {
    indicators: {
      commonIndicators,
      rawIndicators,
      hfaIndicators,
      calculatedIndicators,
    },
    indicatorMappingsVersion,
    hfaIndicatorsVersion,
    calculatedIndicatorsVersion,
  };
}

export async function getInstanceStructureSummary(
  mainDb: Sql,
): Promise<InstanceStructureSummary> {
  const adminArea1s =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM admin_areas_1`
    )[0]?.count ?? 0;
  const hasData = adminArea1s > 0;
  if (!hasData) {
    return { structure: undefined, structureLastUpdated: undefined };
  }
  const adminArea2s =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM admin_areas_2`
    )[0]?.count ?? 0;
  const adminArea3s =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM admin_areas_3`
    )[0]?.count ?? 0;
  const adminArea4s =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM admin_areas_4`
    )[0]?.count ?? 0;
  const facilities =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM facilities`
    )[0]?.count ?? 0;
  const lastUpdatedRow = (
    await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config WHERE config_key = 'structure_last_updated'
    `
  ).at(0);
  return {
    structure: {
      adminArea1s,
      adminArea2s,
      adminArea3s,
      adminArea4s,
      facilities,
    },
    structureLastUpdated: lastUpdatedRow
      ? JSON.parse(lastUpdatedRow.config_json_value)
      : "legacy",
  };
}

export async function getInstanceDatasetsSummary(
  mainDb: Sql,
): Promise<InstanceDatasetsSummary> {
  const datasetsWithData: DatasetType[] = [];
  if (await detectHasAnyRows(mainDb, "dataset_hmis")) {
    datasetsWithData.push("hmis");
  }
  if (await detectHasAnyRows(mainDb, "hfa_data")) {
    datasetsWithData.push("hfa");
  }
  const hmis = await getCurrentDatasetHmisMaxVersionId(mainDb);
  const hmisNVersions =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM dataset_hmis_versions`
    )[0]?.count ?? 0;
  const hfaTimePointRows = await mainDb<
    {
      label: string;
      period_id: string;
      sort_order: number;
      imported_at: string | null;
    }[]
  >`
    SELECT label, period_id, sort_order, imported_at FROM hfa_time_points ORDER BY sort_order
  `;
  const hfaCacheHash = computeHfaCacheHash(hfaTimePointRows);
  return {
    datasetsWithData,
    datasetVersions: {
      hmis,
      hfa: hfaTimePointRows.length > 0 ? hfaTimePointRows.length : undefined,
    },
    hmisNVersions,
    hfaTimePoints: hfaTimePointRows.map((r) => ({
      label: r.label,
      periodId: r.period_id,
      sortOrder: r.sort_order,
      importedAt: r.imported_at ?? undefined,
    })),
    hfaCacheHash,
  };
}

export async function getProjectsForUser(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<ProjectSummary[]> {
  if (globalUser.isGlobalAdmin) {
    return (
      await mainDb<(DBProject & { last_activity_at: string | null })[]>`
        SELECT p.*, la.last_activity_at
        FROM projects p
        LEFT JOIN (
          SELECT project_id, MAX(timestamp) as last_activity_at
          FROM user_logs
          WHERE project_id IS NOT NULL
          GROUP BY project_id
        ) la ON la.project_id = p.id
        ORDER BY LOWER(p.label)
      `
    ).map<ProjectSummary>((p) => ({
      id: p.id,
      label: p.label,
      thisUserRole: "editor",
      isLocked: p.is_locked,
      status: p.status as ProjectSummary["status"],
      lastActivityAt: p.last_activity_at ?? undefined,
      deletionScheduledAt: p.deletion_scheduled_at?.toISOString() ?? undefined,
    }));
  }

  return (
    await mainDb<(DBProject & DBProjectUserRole & { last_activity_at: string | null })[]>`
      SELECT pur.*, p.*, la.last_activity_at
      FROM project_user_roles pur
      JOIN projects p ON pur.project_id = p.id
      LEFT JOIN (
        SELECT project_id, MAX(timestamp) as last_activity_at
        FROM user_logs
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) la ON la.project_id = p.id
      WHERE pur.email = ${globalUser.email}
      AND (
        pur.can_configure_settings OR pur.can_create_backups OR pur.can_restore_backups OR
        pur.can_configure_modules OR pur.can_run_modules OR pur.can_configure_users OR
        pur.can_configure_visualizations OR pur.can_view_visualizations OR
        pur.can_configure_reports OR pur.can_view_reports OR
        pur.can_configure_slide_decks OR pur.can_view_slide_decks OR
        pur.can_configure_data OR pur.can_view_data OR pur.can_view_metrics OR pur.can_view_logs
      )
      ORDER BY LOWER(p.label)
    `
  ).map<ProjectSummary>((p) => ({
    id: p.id,
    label: p.label,
    thisUserRole: p.role === "editor" ? "editor" : "viewer",
    isLocked: p.is_locked,
    status: p.status as ProjectSummary["status"],
    lastActivityAt: p.last_activity_at ?? undefined,
    deletionScheduledAt: p.deletion_scheduled_at?.toISOString() ?? undefined,
  }));
}

export async function getInstanceDetail(
  mainDb: Sql,
  globalUser: GlobalUser,
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

    // Get admin area labels config
    const adminAreaLabelsRes = await getAdminAreaLabelsConfig(mainDb);
    throwIfErrWithData(adminAreaLabelsRes);
    const adminAreaLabels = adminAreaLabelsRes.data;

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

const projectSummaries = await getProjectsForUser(mainDb, globalUser);

    const datasetsWithData: DatasetType[] = [];
    if (await detectHasAnyRows(mainDb, "dataset_hmis")) {
      datasetsWithData.push("hmis");
    }
    if (await detectHasAnyRows(mainDb, "hfa_data")) {
      datasetsWithData.push("hfa");
    }

    const hmisVersion = await getCurrentDatasetHmisMaxVersionId(mainDb);
    const hfaTimePointCount = (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM hfa_time_points`
    )[0].count;

    const structureLastUpdatedRow = (
      await mainDb<{ config_json_value: string }[]>`
        SELECT config_json_value
        FROM instance_config
        WHERE config_key = 'structure_last_updated'
      `
    ).at(0);
    const structureLastUpdated = structureLastUpdatedRow
      ? JSON.parse(structureLastUpdatedRow.config_json_value)
      : hasStructureData
        ? "legacy"
        : undefined;

    const users = await getInstanceUsers(mainDb);

    // Get cache version for indicators (includes counts to detect deletions)
    const indicatorMappingsVersion = await getIndicatorMappingsVersion(mainDb);

    const instanceDetails: InstanceDetail = {
      instanceId: _INSTANCE_ID,
      instanceName: _INSTANCE_NAME,
      maxAdminArea,
      countryIso3,
      facilityColumns,
      adminAreaLabels,
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
