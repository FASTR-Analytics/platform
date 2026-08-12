import { Sql } from "postgres";
import {
  APIResponseWithData,
  H_USERS,
  InstanceDetail,
  OtherUser,
  ProjectSummary,
  throwIfErrWithData,
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  buildUserPermissionsFromRow,
  type DatasetType,
  type FacilityFamily,
  type GlobalUser,
  type InstanceDatasetsSummary,
  type InstanceIndicatorsSummary,
  type InstanceStructureSummary,
  type StructureFamilyCounts,
} from "lib";
import {
  _INSTANCE_COUNTRY_ISO3,
  _INSTANCE_ID,
  _INSTANCE_NAME,
} from "../../exposed_env_vars.ts";
import { detectHasAnyRows, tryCatchDatabaseAsync } from "./../utils.ts";
import {
  DBUser,
  type DBProject,
  type DBProjectUserRole,
} from "./_main_database_types.ts";
import { getAssetsForInstance } from "./assets.ts";
import { getGeoJsonMapSummaries } from "./geojson_maps.ts";
import { getAdminAreaLabelsConfig, getStructureSchema } from "./config.ts";
import { getCurrentDatasetHmisMaxVersionId } from "./dataset_hmis.ts";
import {
  countQueuedDatasetHmisImportRuns,
  hasRunningDatasetHmisImportRun,
} from "./dataset_hmis_import_runs.ts";
import { hasScheduledImportAttention } from "./dataset_hmis_scheduled_imports.ts";
import { computeHfaCacheHash } from "./dataset_hfa.ts";
import { getHfaWeightsCoverage } from "./hfa_facility_weights.ts";
import { getIcehCacheHash } from "./dataset_iceh.ts";

export async function getHfaIndicatorsVersion(mainDb: Sql): Promise<string> {
  const result = await mainDb<{ version: string | null }[]>`
    SELECT MD5(
      COALESCE((SELECT MAX(updated_at) FROM hfa_indicators)::text, '') || '|' ||
      (SELECT COUNT(*) FROM hfa_indicators)::text || '|' ||
      COALESCE((
        SELECT string_agg(id || ':' || label || ':' || sort_order, ',' ORDER BY id)
        FROM hfa_indicator_categories
      ), '') || '|' ||
      COALESCE((
        SELECT string_agg(id || ':' || category_id || ':' || label || ':' || sort_order, ',' ORDER BY id)
        FROM hfa_indicator_sub_categories
      ), '') || '|' ||
      COALESCE((
        SELECT string_agg(id || ':' || label || ':' || sort_order, ',' ORDER BY id)
        FROM hfa_indicator_service_categories
      ), '') || '|' ||
      -- Variant group/item edits don't touch hfa_indicators.updated_at, so
      -- they must feed the hash directly (same reason as the label tables
      -- above). Variant CODE needs no term: every code write rides a write
      -- that bumps the parent's updated_at (saveHfaIndicatorFull, imports,
      -- group reassignment) or cascades from an item/group row change that
      -- alters these aggregates.
      COALESCE((
        SELECT string_agg(id || ':' || label || ':' || sort_order, ',' ORDER BY id)
        FROM hfa_indicator_variant_groups
      ), '') || '|' ||
      COALESCE((
        SELECT string_agg(id || ':' || group_id || ':' || label || ':' || sort_order, ',' ORDER BY id)
        FROM hfa_indicator_variant_items
      ), '')
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
      unlimitedAi: rawUser.unlimited_ai,
      isContactPerson: rawUser.is_contact_person,
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

async function getStructureFamilyCounts(
  mainDb: Sql,
  family: FacilityFamily,
): Promise<StructureFamilyCounts> {
  const row = (
    await mainDb.unsafe<
      {
        admin_area_1s: number;
        admin_area_2s: number;
        admin_area_3s: number;
        admin_area_4s: number;
        facilities: number;
      }[]
    >(`
      SELECT
        (SELECT COUNT(*) FROM admin_areas_${family}_1)::int AS admin_area_1s,
        (SELECT COUNT(*) FROM admin_areas_${family}_2)::int AS admin_area_2s,
        (SELECT COUNT(*) FROM admin_areas_${family}_3)::int AS admin_area_3s,
        (SELECT COUNT(*) FROM admin_areas_${family}_4)::int AS admin_area_4s,
        (SELECT COUNT(*) FROM facilities_${family})::int AS facilities
    `)
  )[0];
  return {
    adminArea1s: row?.admin_area_1s ?? 0,
    adminArea2s: row?.admin_area_2s ?? 0,
    adminArea3s: row?.admin_area_3s ?? 0,
    adminArea4s: row?.admin_area_4s ?? 0,
    facilities: row?.facilities ?? 0,
  };
}

export async function getInstanceStructureSummary(
  mainDb: Sql,
): Promise<InstanceStructureSummary> {
  const hmis = await getStructureFamilyCounts(mainDb, "hmis");
  const hfa = await getStructureFamilyCounts(mainDb, "hfa");
  // "Structure set up" = either family's tree is non-empty
  const hasData = hmis.adminArea1s > 0 || hfa.adminArea1s > 0;
  if (!hasData) {
    return {
      structure: undefined,
      structureLastUpdated: undefined,
      hfaWeights: [],
    };
  }
  const lastUpdatedRow = (
    await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config WHERE config_key = 'structure_last_updated'
    `
  ).at(0);
  return {
    structure: { hmis, hfa },
    structureLastUpdated: lastUpdatedRow
      ? JSON.parse(lastUpdatedRow.config_json_value)
      : "legacy",
    hfaWeights: await getHfaWeightsCoverage(mainDb),
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
  if (await detectHasAnyRows(mainDb, "iceh_data")) {
    datasetsWithData.push("iceh");
  }
  const hmis = await getCurrentDatasetHmisMaxVersionId(mainDb);
  // Running-run versions excluded, same as every version reader — see
  // getVersionsForDatasetHmis.
  const hmisNVersions =
    (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM dataset_hmis_versions
        WHERE id NOT IN (
          SELECT version_id FROM dataset_hmis_import_runs
          WHERE status = 'running' AND version_id IS NOT NULL
        )`
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
  const icehCacheHash = await getIcehCacheHash(mainDb);
  return {
    datasetsWithData,
    datasetVersions: {
      hmis,
      hfa: hfaTimePointRows.length > 0 ? hfaTimePointRows.length : undefined,
    },
    hmisNVersions,
    hmisImportRunActive: await hasRunningDatasetHmisImportRun(mainDb),
    hmisImportRunsQueued: await countQueuedDatasetHmisImportRuns(mainDb),
    hmisScheduledImportAttention: await hasScheduledImportAttention(mainDb),
    hfaTimePoints: hfaTimePointRows.map((r) => ({
      label: r.label,
      periodId: r.period_id,
      sortOrder: r.sort_order,
      importedAt: r.imported_at ?? undefined,
    })),
    hfaCacheHash,
    icehCacheHash,
  };
}

export async function getProjectsForUser(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<ProjectSummary[]> {
  if (globalUser.isGlobalAdmin || H_USERS.includes(globalUser.email)) {
    return (
      await mainDb<(DBProject & { last_activity_at: Date | null })[]>`
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
      isCentralReporting: p.is_central_reporting,
      adminArea2: p.admin_area_2,
      status: p.status as ProjectSummary["status"],
      lastActivityAt: p.last_activity_at?.toISOString() ?? undefined,
      deletionScheduledAt: p.deletion_scheduled_at?.toISOString() ?? undefined,
    }));
  }

  return (
    await mainDb<(DBProject & DBProjectUserRole & { last_activity_at: Date | null })[]>`
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
      AND p.is_central_reporting = FALSE
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
    isCentralReporting: false,
    adminArea2: p.admin_area_2,
    status: p.status as ProjectSummary["status"],
    lastActivityAt: p.last_activity_at?.toISOString() ?? undefined,
    deletionScheduledAt: p.deletion_scheduled_at?.toISOString() ?? undefined,
  }));
}

export async function getInstanceDetail(
  mainDb: Sql,
  globalUser: GlobalUser,
): Promise<APIResponseWithData<InstanceDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    // The per-family structure schemas. A missing row (near-zero probability,
    // guarded by the pre-deploy check) renders as null rather than failing the
    // whole instance detail.
    const hmisSchemaRes = await getStructureSchema(mainDb, "hmis");
    const hfaSchemaRes = await getStructureSchema(mainDb, "hfa");
    const structureSchemaHmis = hmisSchemaRes.success ? hmisSchemaRes.data : null;
    const structureSchemaHfa = hfaSchemaRes.success ? hfaSchemaRes.data : null;

    // Get admin area labels config
    const adminAreaLabelsRes = await getAdminAreaLabelsConfig(mainDb);
    throwIfErrWithData(adminAreaLabelsRes);
    const adminAreaLabels = adminAreaLabelsRes.data;

    // Per-family counts + last-updated, shared with the SSE structure summary
    const structureSummary = await getInstanceStructureSummary(mainDb);
    const structure = structureSummary.structure;

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

    const resAssets = await getAssetsForInstance(mainDb);
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
    if (await detectHasAnyRows(mainDb, "iceh_data")) {
      datasetsWithData.push("iceh");
    }

    const hmisVersion = await getCurrentDatasetHmisMaxVersionId(mainDb);
    const hfaTimePointCount = (
      await mainDb<
        { count: number }[]
      >`SELECT COUNT(*) as count FROM hfa_time_points`
    )[0].count;

    const users = await getInstanceUsers(mainDb);

    // Get cache version for indicators (includes counts to detect deletions)
    const indicatorMappingsVersion = await getIndicatorMappingsVersion(mainDb);

    const instanceDetails: InstanceDetail = {
      instanceId: _INSTANCE_ID,
      instanceName: _INSTANCE_NAME,
      countryIso3: _INSTANCE_COUNTRY_ISO3,
      structureSchemaHmis,
      structureSchemaHfa,
      adminAreaLabels,
      structure,
      structureLastUpdated: structureSummary.structureLastUpdated,
      hfaWeights: structureSummary.hfaWeights,
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
