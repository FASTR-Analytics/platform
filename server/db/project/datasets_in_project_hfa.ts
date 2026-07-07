import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { assertNotUndefined } from "@timroberton/panther";
import { Sql } from "postgres";
import { type HfaSentinelRow } from "../../server_only_funcs/get_script_with_parameters_hfa.ts";
import {
  _SANDBOX_DIR_PATH,
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
} from "../../exposed_env_vars.ts";
import {
  APIResponseWithData,
  composeHfaIndicatorLabel,
  DatasetHfaInfoInProject,
  getHfaIndicatorMeasure,
  hashFacilityColumnsConfig,
  throwIfErrNoData,
  throwIfErrWithData,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaIndicatorCategory,
  type HfaIndicatorServiceCategory,
  type HfaIndicatorSubCategory,
  type HfaTaxonomyForAI,
} from "lib";
import {
  getFacilityColumnsConfig,
  getMaxAdminAreaConfig,
} from "../instance/config.ts";
import { computeHfaCacheHash } from "../instance/dataset_hfa.ts";
import {
  DBHfaIndicator,
  DBHfaIndicatorCategory,
  DBHfaIndicatorServiceCategory,
  DBHfaIndicatorSubCategory,
  dbRowToHfaIndicator,
  dbRowToHfaIndicatorCategory,
  dbRowToHfaIndicatorServiceCategory,
  dbRowToHfaIndicatorSubCategory,
} from "../instance/hfa_indicators.ts";
import { getHfaIndicatorsVersion } from "../instance/instance.ts";
import { escapeSqlString, tryCatchDatabaseAsync } from "./../utils.ts";
import { removeDatasetFromProject } from "./datasets_in_project_hmis.ts";

export async function addDatasetHfaToProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  onProgress?: (progress: number, message: string) => Promise<void>,
  // Service-category ids to include. Empty = include all.
  serviceCategoryScope: string[] = [],
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    // Validate and capture staleness metadata BEFORE removing the existing
    // attachment: a failure after the remove leaves the project detached
    // with modules still clean and clients unnotified, and a hash captured
    // after the export can mask a concurrent instance import (new hash
    // stored against pre-import CSV data).
    if (onProgress) await onProgress(0.1, "Validating configuration...");
    const hasData = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM hfa_data LIMIT 1`)[0].count > 0;
    if (!hasData) {
      throw new Error("No HFA data available to add to project");
    }

    // Get facility columns configuration
    const facilityColumnsRes = await getFacilityColumnsConfig(mainDb);
    if (!facilityColumnsRes.success) {
      return facilityColumnsRes;
    }
    const facilityConfig = facilityColumnsRes.data;

    // Get max admin area configuration
    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);

    // Fetch HFA indicator definitions + per-time-point R code from the instance
    // DB for the project-level snapshot. The module runner reads from the
    // snapshot so indicators and data stay in sync for this project.
    // Project scoping: when a scope is set, only indicators whose service
    // categories overlap it are brought into the project.
    const scopeFilter =
      serviceCategoryScope.length > 0
        ? mainDb`WHERE jsonb_exists_any(service_category_ids::jsonb, ${serviceCategoryScope})`
        : mainDb``;
    const hfaIndicatorRowsForSnapshot = await mainDb<DBHfaIndicator[]>`
      SELECT * FROM hfa_indicators ${scopeFilter} ORDER BY sort_order, var_name
    `;
    if (
      serviceCategoryScope.length > 0 &&
      hfaIndicatorRowsForSnapshot.length === 0
    ) {
      throw new Error("No HFA indicators match the selected service categories.");
    }
    const scopedVarNames = new Set(
      hfaIndicatorRowsForSnapshot.map((ind) => ind.var_name),
    );
    const hfaIndicatorCodeRowsForSnapshot = (
      await mainDb<
        {
          var_name: string;
          time_point: string;
          r_code: string;
          r_filter_code: string | null;
        }[]
      >`
      SELECT var_name, time_point, r_code, r_filter_code
      FROM hfa_indicator_code
      ORDER BY var_name, time_point
    `
    ).filter((c) => scopedVarNames.has(c.var_name));

    // Staleness metadata — stored in datasets.info so the client can detect
    // when the project's export is behind the instance.
    const hfaTimePointRowsForHash = await mainDb<
      { label: string; sort_order: number; imported_at: string | null }[]
    >`
      SELECT label, sort_order, imported_at
      FROM hfa_time_points
      ORDER BY sort_order
    `;
    const hfaCacheHash = computeHfaCacheHash(hfaTimePointRowsForHash);
    const hfaIndicatorsVersion = await getHfaIndicatorsVersion(mainDb);
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

    if (onProgress) await onProgress(0.3, "Removing existing dataset...");
    const res = await removeDatasetFromProject(projectDb, projectId, "hfa");
    throwIfErrNoData(res);

    const datasetDirPath = getDatasetDirPath(projectId);
    await ensureDir(datasetDirPath);
    await Deno.chmod(datasetDirPath, 0o777);

    const datasetFilePathForPostgres = getDatasetFilePathForPostgres(
      projectId,
      "hfa",
    );

    if (onProgress) await onProgress(0.5, "Exporting HFA data to CSV...");

    // Build admin area columns list based on config
    const adminAreaColumns = [];
    for (let i = 1; i <= Math.min(resMaxAdminArea.data.maxAdminArea, 4); i++) {
      adminAreaColumns.push(`admin_area_${i}`);
    }

    // Export hfa_data with facility details. Optional facility attribute
    // columns (ownership/type/custom) are intentionally excluded here: the
    // R script has no computational use for them, and chart disaggregation
    // by these attributes is served entirely by a query-time join against
    // facilities_hfa (see metric_enricher.ts / cte_manager.ts), not by
    // values carried through the module's own dataset export.
    const exportStatement = `
SELECT
  h.facility_id,
  ${adminAreaColumns.map((col) => `f.${col}`).join(",\n  ")},
  h.time_point,
  w.weight,
  h.var_name,
  h.value
FROM hfa_data h
INNER JOIN facilities_hfa f ON h.facility_id = f.facility_id
LEFT JOIN hfa_facility_weights w ON w.facility_id = h.facility_id AND w.time_point = h.time_point`;

    // Use COPY with optimized settings for better performance
    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${datasetFilePathForPostgres}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

    if (onProgress) await onProgress(0.8, "Updating project database...");
    const lastUpdated = new Date().toISOString();

    // Fetch HFA categories from instance DB for snapshot
    const hfaCategoriesForSnapshot = await mainDb<DBHfaIndicatorCategory[]>`
      SELECT id, label, sort_order FROM hfa_indicator_categories ORDER BY sort_order, label
    `;

    // Fetch HFA sub-categories from instance DB for snapshot
    const hfaSubCategoriesForSnapshot = await mainDb<DBHfaIndicatorSubCategory[]>`
      SELECT id, category_id, label, sort_order FROM hfa_indicator_sub_categories ORDER BY category_id, sort_order, label
    `;

    // Fetch HFA service categories from instance DB for snapshot
    const hfaServiceCategoriesForSnapshot = await mainDb<DBHfaIndicatorServiceCategory[]>`
      SELECT id, label, sort_order FROM hfa_indicator_service_categories ORDER BY sort_order, label
    `;

    const info: DatasetHfaInfoInProject = {
      hfaCacheHash,
      hfaIndicatorsVersion,
      structureLastUpdated,
      facilityColumnsHash: hashFacilityColumnsConfig(facilityConfig),
      serviceCategoryScope:
        serviceCategoryScope.length > 0 ? serviceCategoryScope : undefined,
    };

    // Fetch facilities from main database to populate project database
    const facilities = (await mainDb.unsafe(
      `SELECT * FROM facilities_hfa`,
    )) as Array<{
      facility_id: string;
      admin_area_4: string;
      admin_area_3: string;
      admin_area_2: string;
      admin_area_1: string;
      facility_name: string | null;
      facility_type: string | null;
      facility_ownership: string | null;
      facility_custom_1: string | null;
      facility_custom_2: string | null;
      facility_custom_3: string | null;
      facility_custom_4: string | null;
      facility_custom_5: string | null;
    }>;

    // Fetch unique HFA indicators (var_name) from main database with sample values
    const hfaIndicators = (await mainDb.unsafe(`
      WITH distinct_values AS (
        SELECT
          var_name,
          value,
          ROW_NUMBER() OVER (PARTITION BY var_name ORDER BY value) as rn
        FROM (
          SELECT DISTINCT var_name, value
          FROM hfa_data
          WHERE value IS NOT NULL AND value != ''
        ) AS dv
      )
      SELECT
        var_name,
        STRING_AGG(value, ', ' ORDER BY value) as sample_values
      FROM distinct_values
      WHERE rn <= 20
      GROUP BY var_name
      ORDER BY var_name
    `)) as Array<{ var_name: string; sample_values: string | null }>;
    // NOTE: `hfaIndicators` here are the raw HFA *survey variables* (var_name =
    // fin_01a_a, hr_01, ...) drawn from hfa_data — a DIFFERENT namespace from the
    // hfa_indicators *definition* ids (ind001, ...). The service-category scope
    // filters indicator DEFINITIONS + their code only; the available survey
    // variables must stay complete or indicator R code can't resolve them.

    // Per-variable sentinel classification (layer 3): one row per classified
    // (var_name, value). is_numeric flags a numeric-var don't-know (-999999),
    // which the generator treats as always-missing regardless of DK policy.
    // MAX/bool_or collapse the rare case of a code classified differently across
    // time points to a single deterministic row.
    const hfaSentinelValuesForSnapshot = (await mainDb.unsafe(`
      SELECT
        vv.var_name,
        vv.value,
        MAX(vv.sentinel_class) AS sentinel_class,
        bool_or(v.var_type IN ('integer', 'decimal')) AS is_numeric
      FROM hfa_variable_values vv
      JOIN hfa_variables v
        ON v.time_point = vv.time_point AND v.var_name = vv.var_name
      WHERE vv.sentinel_class <> ''
      GROUP BY vv.var_name, vv.value
    `)) as Array<{
      var_name: string;
      value: string;
      sentinel_class: string;
      is_numeric: boolean;
    }>;

    // Clear existing data and populate with HFA data. Snapshot-code rows FK
    // into snapshot-indicator rows, so the DELETE order matters (code first).
    await projectDb.begin((sql) => [
      sql`
INSERT INTO datasets (dataset_type, info, last_updated)
VALUES (
  'hfa',
  ${JSON.stringify(info)},
  ${lastUpdated}
)
ON CONFLICT (dataset_type) DO UPDATE SET
  info = EXCLUDED.info,
  last_updated = EXCLUDED.last_updated
`,
      sql`DELETE FROM hfa_indicator_code_snapshot`,
      sql`DELETE FROM hfa_indicators_snapshot`,
      sql`DELETE FROM hfa_variable_values_snapshot`,
      sql`DELETE FROM hfa_indicator_sub_categories_snapshot`,
      sql`DELETE FROM hfa_indicator_categories_snapshot`,
      sql`DELETE FROM hfa_indicator_service_categories_snapshot`,
      sql`DELETE FROM facilities_hfa`,
      sql`DELETE FROM indicators_hfa`,
      ...(facilities.length > 0
        ? facilities.map(
            (fac) =>
              sql`INSERT INTO facilities_hfa (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5)
        VALUES (${fac.facility_id}, ${fac.admin_area_4}, ${fac.admin_area_3}, ${fac.admin_area_2}, ${fac.admin_area_1}, ${fac.facility_name}, ${fac.facility_type}, ${fac.facility_ownership}, ${fac.facility_custom_1}, ${fac.facility_custom_2}, ${fac.facility_custom_3}, ${fac.facility_custom_4}, ${fac.facility_custom_5})`,
          )
        : []),
      ...(hfaIndicators.length > 0
        ? [
          sql.unsafe(`
        INSERT INTO indicators_hfa (var_name, example_values)
        VALUES ${
            hfaIndicators
              .map((ind) =>
                `('${escapeSqlString(ind.var_name)}', '${
                  escapeSqlString(ind.sample_values || "")
                }')`
              )
              .join(",\n")
          }
      `),
        ]
        : []),
      ...(hfaSentinelValuesForSnapshot.length > 0
        ? [
          sql.unsafe(`
        INSERT INTO hfa_variable_values_snapshot (var_name, value, sentinel_class, is_numeric)
        VALUES ${
            hfaSentinelValuesForSnapshot
              .map((r) =>
                `('${escapeSqlString(r.var_name)}', '${
                  escapeSqlString(r.value)
                }', '${escapeSqlString(r.sentinel_class)}', ${
                  r.is_numeric ? "TRUE" : "FALSE"
                })`
              )
              .join(",\n")
          }
      `),
        ]
        : []),
      ...hfaCategoriesForSnapshot.map(
        (cat) =>
          sql`INSERT INTO hfa_indicator_categories_snapshot (id, label, sort_order)
            VALUES (${cat.id}, ${cat.label}, ${cat.sort_order})`,
      ),
      ...hfaSubCategoriesForSnapshot.map(
        (subCat) =>
          sql`INSERT INTO hfa_indicator_sub_categories_snapshot (id, category_id, label, sort_order)
            VALUES (${subCat.id}, ${subCat.category_id}, ${subCat.label}, ${subCat.sort_order})`,
      ),
      ...hfaServiceCategoriesForSnapshot.map(
        (svcCat) =>
          sql`INSERT INTO hfa_indicator_service_categories_snapshot (id, label, sort_order)
            VALUES (${svcCat.id}, ${svcCat.label}, ${svcCat.sort_order})`,
      ),
      ...hfaIndicatorRowsForSnapshot.map(
        (ind) =>
          sql`INSERT INTO hfa_indicators_snapshot
            (var_name, category_id, sub_category_id, service_category_ids, short_label, definition, type, aggregation, sort_order)
            VALUES (${ind.var_name}, ${ind.category_id}, ${ind.sub_category_id}, ${ind.service_category_ids}, ${ind.short_label}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${ind.sort_order})`,
      ),
      ...hfaIndicatorCodeRowsForSnapshot.map(
        (c) =>
          sql`INSERT INTO hfa_indicator_code_snapshot
            (var_name, time_point, r_code, r_filter_code)
            VALUES (${c.var_name}, ${c.time_point}, ${c.r_code}, ${c.r_filter_code})`,
      ),
    ]);

    return { success: true, data: { lastUpdated } };
  });
}

// ============================================================================
// Snapshot readers (consumed by run_module_iterator + script preview)
// ============================================================================

type DBHfaIndicatorCodeSnapshot = {
  var_name: string;
  time_point: string;
  r_code: string;
  r_filter_code: string | null;
};

export async function getAllHfaIndicatorCategoriesFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorCategory[]> {
  const rows = await projectDb<DBHfaIndicatorCategory[]>`
    SELECT id, label, sort_order FROM hfa_indicator_categories_snapshot ORDER BY sort_order, label
  `;
  return rows.map(dbRowToHfaIndicatorCategory);
}

export async function getAllHfaIndicatorSubCategoriesFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorSubCategory[]> {
  const rows = await projectDb<DBHfaIndicatorSubCategory[]>`
    SELECT id, category_id, label, sort_order FROM hfa_indicator_sub_categories_snapshot ORDER BY category_id, sort_order, label
  `;
  return rows.map(dbRowToHfaIndicatorSubCategory);
}

export async function getAllHfaIndicatorServiceCategoriesFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorServiceCategory[]> {
  const rows = await projectDb<DBHfaIndicatorServiceCategory[]>`
    SELECT id, label, sort_order FROM hfa_indicator_service_categories_snapshot ORDER BY sort_order, label
  `;
  return rows.map(dbRowToHfaIndicatorServiceCategory);
}

// Per-variable sentinel classification for the module generator (layer 3),
// read back from the project snapshot written at HFA-export time. Empty for
// projects exported before layer 1 shipped → generator falls back to the
// hardcoded set.
export async function getHfaSentinelRowsFromSnapshot(
  projectDb: Sql,
): Promise<HfaSentinelRow[]> {
  const rows = await projectDb<{
    var_name: string;
    value: string;
    sentinel_class: string;
    is_numeric: boolean;
  }[]>`
    SELECT var_name, value, sentinel_class, is_numeric
    FROM hfa_variable_values_snapshot
  `;
  return rows.map((r) => ({
    varName: r.var_name,
    value: r.value,
    sentinelClass: r.sentinel_class,
    isNumeric: r.is_numeric,
  }));
}

export async function getAllHfaIndicatorsFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicator[]> {
  const rows = await projectDb<DBHfaIndicator[]>`
    SELECT
      i.var_name,
      i.category_id,
      i.sub_category_id,
      i.service_category_ids,
      i.short_label,
      i.definition,
      i.type,
      i.aggregation,
      i.sort_order,
      '' as updated_at,
      false as has_syntax_error,
      true as code_consistent
    FROM hfa_indicators_snapshot i
    LEFT JOIN hfa_indicator_categories_snapshot c ON i.category_id = c.id
    LEFT JOIN hfa_indicator_sub_categories_snapshot sc ON i.sub_category_id = sc.id
    ORDER BY COALESCE(c.sort_order, 999999), COALESCE(sc.sort_order, 999999), i.sort_order, i.var_name
  `;
  return rows.map(dbRowToHfaIndicator);
}

// Full HFA indicator taxonomy for the AI. Indicators + categories +
// sub-categories + service categories come from the project snapshot (so they
// respect this project's service-category scoping); time points are
// instance-wide (`hfa_time_points`), restricted to those actually imported.
export async function getHfaTaxonomyForAI(
  mainDb: Sql,
  projectDb: Sql,
): Promise<HfaTaxonomyForAI> {
  const [categories, subCategories, serviceCategories, indicators, timePointRows] =
    await Promise.all([
      getAllHfaIndicatorCategoriesFromSnapshot(projectDb),
      getAllHfaIndicatorSubCategoriesFromSnapshot(projectDb),
      getAllHfaIndicatorServiceCategoriesFromSnapshot(projectDb),
      getAllHfaIndicatorsFromSnapshot(projectDb),
      mainDb<{ label: string; period_id: string }[]>`
        SELECT label, period_id FROM hfa_time_points
        WHERE imported_at IS NOT NULL
        ORDER BY sort_order
      `,
    ]);
  return {
    categories: categories.map((c) => ({ id: c.id, label: c.label })),
    subCategories: subCategories.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      label: s.label,
    })),
    serviceCategories: serviceCategories.map((s) => ({ id: s.id, label: s.label })),
    timePoints: timePointRows.map((t) => ({
      id: t.label,
      label: t.label,
      periodId: t.period_id,
    })),
    indicators: indicators.map((i) => ({
      id: i.varName,
      label: composeHfaIndicatorLabel(i, "full"),
      measure: getHfaIndicatorMeasure(i.type, i.aggregation).label.en,
      categoryId: i.categoryId,
      subCategoryId: i.subCategoryId,
      serviceCategoryIds: i.serviceCategoryIds,
    })),
  };
}

export async function getAllHfaIndicatorCodeFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorCode[]> {
  const rows = await projectDb<DBHfaIndicatorCodeSnapshot[]>`
    SELECT var_name, time_point, r_code, r_filter_code
    FROM hfa_indicator_code_snapshot
    ORDER BY var_name, time_point
  `;
  return rows.map((r) => ({
    varName: r.var_name,
    timePoint: r.time_point,
    rCode: r.r_code,
    rFilterCode: r.r_filter_code ?? undefined,
  }));
}

function getDatasetDirPath(projectId: string): string {
  return join(_SANDBOX_DIR_PATH, projectId, "datasets");
}

function getDatasetFilePathForPostgres(
  projectId: string,
  datasetType: string,
): string {
  return join(
    _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
    projectId,
    "datasets",
    `${datasetType}.csv`,
  );
}
