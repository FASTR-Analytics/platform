import { Sql } from "postgres";
import { type HfaSentinelRow } from "../../server_only_funcs/get_script_with_parameters_hfa.ts";
import {
  APIResponseWithData,
  composeHfaIndicatorLabel,
  DatasetHfaInfoInProject,
  getHfaIndicatorMeasure,
  hashFacilityColumnsConfig,
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
import { tryCatchDatabaseAsync } from "./../utils.ts";
import {
  ensureDatasetCsvTargetDir,
  PROJECT_FACILITY_COLUMN_NAMES,
  type DatasetCsvTarget,
  type ProjectFacilityRow,
} from "./datasets_in_project_hmis.ts";

// See the HMIS file's header note. computeDatasetHfaRunCapture does the
// instance reads + COPY export and returns every captured row set. Capture
// is always the FULL dataset — every service category's indicator
// definitions and R code ship in the run (PLAN_FULL_CAPTURE_GENERATION
// ruling 2026-08-03).

export type DatasetHfaRunCapture = {
  info: DatasetHfaInfoInProject;
  lastUpdated: string;
  facilities: ProjectFacilityRow[];
  indicatorsHfa: { var_name: string; example_values: string }[];
  sentinelValues: {
    var_name: string;
    value: string;
    sentinel_class: string;
    is_numeric: boolean;
  }[];
  categories: DBHfaIndicatorCategory[];
  subCategories: DBHfaIndicatorSubCategory[];
  serviceCategories: DBHfaIndicatorServiceCategory[];
  indicators: DBHfaIndicator[];
  indicatorCode: {
    var_name: string;
    time_point: string;
    r_code: string;
    r_filter_code: string | null;
  }[];
};

export async function computeDatasetHfaRunCapture(
  mainDb: Sql,
  csvTarget: DatasetCsvTarget,
  onProgress?: (progress: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<DatasetHfaRunCapture>> {
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
    // DB for the run snapshot. The module runner reads from the snapshot so
    // indicators and data stay in sync for this run.
    const hfaIndicatorRowsForSnapshot = await mainDb<DBHfaIndicator[]>`
      SELECT * FROM hfa_indicators ORDER BY sort_order, var_name
    `;
    const indicatorVarNames = new Set(
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
    ).filter((c) => indicatorVarNames.has(c.var_name));

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

    await ensureDatasetCsvTargetDir(csvTarget);

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
LEFT JOIN hfa_facility_weights w ON w.facility_id = h.facility_id AND w.time_point = h.time_point
-- Deterministic row order: the extract's bytes are a module inputKey
-- ingredient (PLAN_RESULTS_RUNS §3.7); unordered COPY output varies run to run.
ORDER BY h.facility_id, h.time_point, h.var_name, h.value`;

    // Use COPY with optimized settings for better performance
    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${csvTarget.postgresPath}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

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
    };

    // Fetch facilities from main database for the project/run capture
    const facilities = (await mainDb.unsafe(
      `SELECT ${PROJECT_FACILITY_COLUMN_NAMES.join(", ")} FROM facilities_hfa`,
    )) as ProjectFacilityRow[];

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

    return {
      success: true,
      data: {
        info,
        lastUpdated: new Date().toISOString(),
        facilities,
        indicatorsHfa: hfaIndicators.map((ind) => ({
          var_name: ind.var_name,
          example_values: ind.sample_values || "",
        })),
        sentinelValues: hfaSentinelValuesForSnapshot,
        categories: hfaCategoriesForSnapshot,
        subCategories: hfaSubCategoriesForSnapshot,
        serviceCategories: hfaServiceCategoriesForSnapshot,
        indicators: hfaIndicatorRowsForSnapshot,
        indicatorCode: hfaIndicatorCodeRowsForSnapshot,
      },
    };
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

