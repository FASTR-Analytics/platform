import { Sql } from "postgres";
import { z } from "zod";
import {
  APIResponseNoData,
  APIResponseWithData,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaIndicatorCategory,
  type HfaIndicatorServiceCategory,
  type HfaIndicatorSubCategory,
  type HfaWorkbookImport,
  type HfaWorkbookImportResult,
  type HfaDictionaryForValidation,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export type DBHfaIndicatorCategory = {
  id: string;
  label: string;
  sort_order: number;
};

export type DBHfaIndicatorSubCategory = {
  id: string;
  category_id: string;
  label: string;
  sort_order: number;
};

export type DBHfaIndicatorServiceCategory = {
  id: string;
  label: string;
  sort_order: number;
};

export type DBHfaIndicator = {
  var_name: string;
  category_id: string | null;
  sub_category_id: string | null;
  service_category_ids: string; // JSON-encoded string[]
  short_label: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sort_order: number;
  updated_at: string;
  has_syntax_error: boolean;
  code_consistent: boolean;
};

type DBHfaIndicatorCode = {
  var_name: string;
  time_point: string;
  r_code: string;
  r_filter_code: string | null;
};

export function dbRowToHfaIndicatorCategory(row: DBHfaIndicatorCategory): HfaIndicatorCategory {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

export function dbRowToHfaIndicatorSubCategory(row: DBHfaIndicatorSubCategory): HfaIndicatorSubCategory {
  return {
    id: row.id,
    categoryId: row.category_id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

export function dbRowToHfaIndicatorServiceCategory(
  row: DBHfaIndicatorServiceCategory,
): HfaIndicatorServiceCategory {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

export function dbRowToHfaIndicator(row: DBHfaIndicator): HfaIndicator {
  return {
    varName: row.var_name,
    categoryId: row.category_id,
    subCategoryId: row.sub_category_id,
    serviceCategoryIds: z
      .array(z.string())
      .parse(JSON.parse(row.service_category_ids ?? "[]")),
    shortLabel: row.short_label,
    definition: row.definition,
    type: row.type,
    aggregation: row.aggregation,
    sortOrder: row.sort_order,
    hasSyntaxError: row.has_syntax_error,
    codeConsistent: row.code_consistent,
  };
}

function dbRowToHfaIndicatorCode(row: DBHfaIndicatorCode): HfaIndicatorCode {
  return {
    varName: row.var_name,
    timePoint: row.time_point,
    rCode: row.r_code,
    rFilterCode: row.r_filter_code ?? undefined,
  };
}

export async function getHfaIndicators(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicator[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicator[]>`
      SELECT * FROM hfa_indicators ORDER BY sort_order, var_name
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicator) };
  });
}

// ============================================================================
// Categories
// ============================================================================

export async function getHfaIndicatorCategories(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicatorCategory[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorCategory[]>`
      SELECT * FROM hfa_indicator_categories ORDER BY sort_order, label
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorCategory) };
  });
}

export async function createHfaIndicatorCategory(
  mainDb: Sql,
  category: HfaIndicatorCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicator_categories (id, label, sort_order)
      VALUES (${category.id}, ${category.label}, ${category.sortOrder})
    `;
    return { success: true };
  });
}

export async function updateHfaIndicatorCategory(
  mainDb: Sql,
  oldId: string,
  category: HfaIndicatorCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicator_categories
      SET id = ${category.id},
          label = ${category.label},
          sort_order = ${category.sortOrder}
      WHERE id = ${oldId}
    `;
    return { success: true };
  });
}

export async function deleteHfaIndicatorCategory(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      DELETE FROM hfa_indicator_categories WHERE id = ${id}
    `;
    return { success: true };
  });
}

export async function reorderHfaIndicatorCategories(
  mainDb: Sql,
  orderedIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await sql`
          UPDATE hfa_indicator_categories
          SET sort_order = ${i}
          WHERE id = ${orderedIds[i]}
        `;
      }
    });
    return { success: true };
  });
}

// ============================================================================
// Sub-Categories
// ============================================================================

export async function getHfaIndicatorSubCategories(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicatorSubCategory[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorSubCategory[]>`
      SELECT * FROM hfa_indicator_sub_categories ORDER BY category_id, sort_order, label
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorSubCategory) };
  });
}

export async function createHfaIndicatorSubCategory(
  mainDb: Sql,
  subCategory: HfaIndicatorSubCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicator_sub_categories (id, category_id, label, sort_order)
      VALUES (${subCategory.id}, ${subCategory.categoryId}, ${subCategory.label}, ${subCategory.sortOrder})
    `;
    return { success: true };
  });
}

export async function updateHfaIndicatorSubCategory(
  mainDb: Sql,
  oldId: string,
  subCategory: HfaIndicatorSubCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicator_sub_categories
      SET id = ${subCategory.id},
          category_id = ${subCategory.categoryId},
          label = ${subCategory.label},
          sort_order = ${subCategory.sortOrder}
      WHERE id = ${oldId}
    `;
    return { success: true };
  });
}

export async function deleteHfaIndicatorSubCategory(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      DELETE FROM hfa_indicator_sub_categories WHERE id = ${id}
    `;
    return { success: true };
  });
}

export async function reorderHfaIndicatorSubCategories(
  mainDb: Sql,
  categoryId: string,
  orderedIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await sql`
          UPDATE hfa_indicator_sub_categories
          SET sort_order = ${i}
          WHERE id = ${orderedIds[i]} AND category_id = ${categoryId}
        `;
      }
    });
    return { success: true };
  });
}

// ============================================================================
// Service Categories
// ============================================================================

export async function getHfaIndicatorServiceCategories(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicatorServiceCategory[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorServiceCategory[]>`
      SELECT * FROM hfa_indicator_service_categories ORDER BY sort_order, label
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorServiceCategory) };
  });
}

export async function createHfaIndicatorServiceCategory(
  mainDb: Sql,
  serviceCategory: HfaIndicatorServiceCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicator_service_categories (id, label, sort_order)
      VALUES (${serviceCategory.id}, ${serviceCategory.label}, ${serviceCategory.sortOrder})
    `;
    return { success: true };
  });
}

export async function updateHfaIndicatorServiceCategory(
  mainDb: Sql,
  oldId: string,
  serviceCategory: HfaIndicatorServiceCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE hfa_indicator_service_categories
        SET id = ${serviceCategory.id},
            label = ${serviceCategory.label},
            sort_order = ${serviceCategory.sortOrder}
        WHERE id = ${oldId}
      `;
      // No FK on the JSON list; keep indicator tags in sync when the id changes.
      if (serviceCategory.id !== oldId) {
        await sql`
          UPDATE hfa_indicators
          SET service_category_ids = (
                SELECT COALESCE(
                  jsonb_agg(CASE WHEN e = ${oldId} THEN ${serviceCategory.id} ELSE e END),
                  '[]'::jsonb
                )
                FROM jsonb_array_elements_text(service_category_ids::jsonb) AS e
              )::text,
              updated_at = CURRENT_TIMESTAMP
          WHERE jsonb_exists(service_category_ids::jsonb, ${oldId})
        `;
      }
    });
    return { success: true };
  });
}

export async function deleteHfaIndicatorServiceCategory(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      // No FK on the JSON list; scrub the deleted id from indicator tags
      // (replaces the old ON DELETE SET NULL behaviour).
      await sql`
        UPDATE hfa_indicators
        SET service_category_ids = (service_category_ids::jsonb - ${id})::text,
            updated_at = CURRENT_TIMESTAMP
        WHERE jsonb_exists(service_category_ids::jsonb, ${id})
      `;
      await sql`DELETE FROM hfa_indicator_service_categories WHERE id = ${id}`;
    });
    return { success: true };
  });
}

export async function reorderHfaIndicatorServiceCategories(
  mainDb: Sql,
  orderedIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await sql`
          UPDATE hfa_indicator_service_categories
          SET sort_order = ${i}
          WHERE id = ${orderedIds[i]}
        `;
      }
    });
    return { success: true };
  });
}

// ============================================================================
// Indicators
// ============================================================================

export async function createHfaIndicator(
  mainDb: Sql,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, service_category_ids, short_label, definition, type, aggregation, sort_order, updated_at)
      VALUES (${indicator.varName}, ${indicator.categoryId}, ${indicator.subCategoryId}, ${JSON.stringify(indicator.serviceCategoryIds)}, ${indicator.shortLabel}, ${indicator.definition}, ${indicator.type}, ${indicator.aggregation}, ${indicator.sortOrder}, CURRENT_TIMESTAMP)
    `;
    return { success: true };
  });
}

export async function updateHfaIndicator(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicators
      SET var_name = ${indicator.varName},
          category_id = ${indicator.categoryId},
          sub_category_id = ${indicator.subCategoryId},
          service_category_ids = ${JSON.stringify(indicator.serviceCategoryIds)},
          short_label = ${indicator.shortLabel},
          definition = ${indicator.definition},
          type = ${indicator.type},
          aggregation = ${indicator.aggregation},
          sort_order = ${indicator.sortOrder},
          updated_at = CURRENT_TIMESTAMP
      WHERE var_name = ${oldVarName}
    `;
    return { success: true };
  });
}

export async function updateHfaIndicatorsBulk(
  mainDb: Sql,
  updates: { oldVarName: string; indicator: HfaIndicator }[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (const { oldVarName, indicator } of updates) {
        await sql`
          UPDATE hfa_indicators
          SET var_name = ${indicator.varName},
              category_id = ${indicator.categoryId},
              sub_category_id = ${indicator.subCategoryId},
              service_category_ids = ${JSON.stringify(indicator.serviceCategoryIds)},
              short_label = ${indicator.shortLabel},
              definition = ${indicator.definition},
              type = ${indicator.type},
              aggregation = ${indicator.aggregation},
              sort_order = ${indicator.sortOrder},
              updated_at = CURRENT_TIMESTAMP
          WHERE var_name = ${oldVarName}
        `;
      }
    });
    return { success: true };
  });
}

export async function deleteHfaIndicators(
  mainDb: Sql,
  varNames: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (varNames.length === 0) {
      return { success: true };
    }
    await mainDb`
      DELETE FROM hfa_indicators WHERE var_name = ANY(${varNames})
    `;
    return { success: true };
  });
}

export async function batchUploadHfaIndicators(
  mainDb: Sql,
  indicators: HfaIndicator[],
  code: HfaIndicatorCode[],
  replaceAll: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      if (replaceAll) {
        await sql`DELETE FROM hfa_indicators`;
      }

      let existingVarNames = new Set<string>();
      let nextSortOrder = 0;
      if (!replaceAll) {
        const existingRows = await sql<{ var_name: string }[]>`
          SELECT var_name FROM hfa_indicators
        `;
        existingVarNames = new Set(existingRows.map((r) => r.var_name));
        const maxResult = await sql<{ max_order: number | null }[]>`
          SELECT MAX(sort_order) as max_order FROM hfa_indicators
        `;
        nextSortOrder = (maxResult[0]?.max_order ?? -1) + 1;
      }

      const insertedVarNames = new Set<string>();
      for (let i = 0; i < indicators.length; i++) {
        const ind = indicators[i];
        if (!replaceAll && existingVarNames.has(ind.varName)) {
          continue;
        }
        const sortOrder = replaceAll ? i : nextSortOrder++;
        await sql`
          INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, service_category_ids, short_label, definition, type, aggregation, sort_order, has_syntax_error, code_consistent, updated_at)
          VALUES (${ind.varName}, ${ind.categoryId}, ${ind.subCategoryId}, ${JSON.stringify(ind.serviceCategoryIds)}, ${ind.shortLabel}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${sortOrder}, ${ind.hasSyntaxError}, ${ind.codeConsistent}, CURRENT_TIMESTAMP)
          ON CONFLICT (var_name) DO NOTHING
        `;
        insertedVarNames.add(ind.varName);
      }

      for (const varName of insertedVarNames) {
        await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${varName}`;
      }
      for (const c of code) {
        if (!c.rCode.trim()) continue;
        if (!insertedVarNames.has(c.varName)) continue;
        await sql`
          INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
          VALUES (${c.varName}, ${c.timePoint}, ${c.rCode}, ${c.rFilterCode ?? null})
        `;
      }
    });
    return { success: true };
  });
}

// Imports an entire HFA indicator workbook (categories + sub-categories +
// indicators + per-time-point code) in one transaction. Row order in each
// list defines sort_order, so reordering rows in the source spreadsheet
// reorders them in the app. Categories/sub-categories are written before
// indicators so the foreign keys always resolve.
export async function importHfaIndicatorsWorkbook(
  mainDb: Sql,
  data: HfaWorkbookImport,
): Promise<APIResponseWithData<HfaWorkbookImportResult>> {
  return await tryCatchDatabaseAsync(async () => {
    const skippedExisting: string[] = [];
    let imported = 0;
    await mainDb.begin(async (sql) => {
      const { categories, subCategories, serviceCategories, indicators, code, replaceAll } = data;

      if (replaceAll) {
        // Deleting indicators cascades to hfa_indicator_code; delete in
        // FK-safe order (indicators -> sub-categories -> categories).
        await sql`DELETE FROM hfa_indicators`;
        await sql`DELETE FROM hfa_indicator_sub_categories`;
        await sql`DELETE FROM hfa_indicator_categories`;
        await sql`DELETE FROM hfa_indicator_service_categories`;

        for (let i = 0; i < categories.length; i++) {
          const cat = categories[i];
          await sql`
            INSERT INTO hfa_indicator_categories (id, label, sort_order)
            VALUES (${cat.id}, ${cat.label}, ${i})
          `;
        }

        for (let i = 0; i < serviceCategories.length; i++) {
          const svcCat = serviceCategories[i];
          await sql`
            INSERT INTO hfa_indicator_service_categories (id, label, sort_order)
            VALUES (${svcCat.id}, ${svcCat.label}, ${i})
          `;
        }

        const subOrderByCat = new Map<string, number>();
        for (const sc of subCategories) {
          const order = subOrderByCat.get(sc.categoryId) ?? 0;
          subOrderByCat.set(sc.categoryId, order + 1);
          await sql`
            INSERT INTO hfa_indicator_sub_categories (id, category_id, label, sort_order)
            VALUES (${sc.id}, ${sc.categoryId}, ${sc.label}, ${order})
          `;
        }
      } else {
        // Upsert categories, preserving existing order; new ones appended.
        const existingCatRows = await sql<{ id: string }[]>`
          SELECT id FROM hfa_indicator_categories
        `;
        const existingCatIds = new Set(existingCatRows.map((r) => r.id));
        const maxCatRow = await sql<{ m: number | null }[]>`
          SELECT MAX(sort_order) as m FROM hfa_indicator_categories
        `;
        let nextCatOrder = (maxCatRow[0]?.m ?? -1) + 1;
        for (const cat of categories) {
          if (existingCatIds.has(cat.id)) {
            await sql`
              UPDATE hfa_indicator_categories SET label = ${cat.label} WHERE id = ${cat.id}
            `;
          } else {
            await sql`
              INSERT INTO hfa_indicator_categories (id, label, sort_order)
              VALUES (${cat.id}, ${cat.label}, ${nextCatOrder++})
            `;
          }
        }

        // Upsert sub-categories, preserving existing order; new ones appended
        // within their category.
        const existingSubRows = await sql<
          { id: string; category_id: string; sort_order: number }[]
        >`
          SELECT id, category_id, sort_order FROM hfa_indicator_sub_categories
        `;
        const existingSubIds = new Set(existingSubRows.map((r) => r.id));
        const maxSubOrderByCat = new Map<string, number>();
        for (const r of existingSubRows) {
          maxSubOrderByCat.set(
            r.category_id,
            Math.max(maxSubOrderByCat.get(r.category_id) ?? -1, r.sort_order),
          );
        }
        for (const sc of subCategories) {
          if (existingSubIds.has(sc.id)) {
            await sql`
              UPDATE hfa_indicator_sub_categories
              SET category_id = ${sc.categoryId}, label = ${sc.label}
              WHERE id = ${sc.id}
            `;
          } else {
            const order = (maxSubOrderByCat.get(sc.categoryId) ?? -1) + 1;
            maxSubOrderByCat.set(sc.categoryId, order);
            await sql`
              INSERT INTO hfa_indicator_sub_categories (id, category_id, label, sort_order)
              VALUES (${sc.id}, ${sc.categoryId}, ${sc.label}, ${order})
            `;
          }
        }

        // Upsert service categories, preserving existing order; new ones appended.
        const existingSvcCatRows = await sql<{ id: string }[]>`
          SELECT id FROM hfa_indicator_service_categories
        `;
        const existingSvcCatIds = new Set(existingSvcCatRows.map((r) => r.id));
        const maxSvcCatRow = await sql<{ m: number | null }[]>`
          SELECT MAX(sort_order) as m FROM hfa_indicator_service_categories
        `;
        let nextSvcCatOrder = (maxSvcCatRow[0]?.m ?? -1) + 1;
        for (const svcCat of serviceCategories) {
          if (existingSvcCatIds.has(svcCat.id)) {
            await sql`
              UPDATE hfa_indicator_service_categories SET label = ${svcCat.label} WHERE id = ${svcCat.id}
            `;
          } else {
            await sql`
              INSERT INTO hfa_indicator_service_categories (id, label, sort_order)
              VALUES (${svcCat.id}, ${svcCat.label}, ${nextSvcCatOrder++})
            `;
          }
        }
      }

      // Indicators
      let existingVarNames = new Set<string>();
      let nextSortOrder = 0;
      if (!replaceAll) {
        const existingRows = await sql<{ var_name: string }[]>`
          SELECT var_name FROM hfa_indicators
        `;
        existingVarNames = new Set(existingRows.map((r) => r.var_name));
        const maxResult = await sql<{ max_order: number | null }[]>`
          SELECT MAX(sort_order) as max_order FROM hfa_indicators
        `;
        nextSortOrder = (maxResult[0]?.max_order ?? -1) + 1;
      }

      const insertedVarNames = new Set<string>();
      for (let i = 0; i < indicators.length; i++) {
        const ind = indicators[i];
        if (!replaceAll && existingVarNames.has(ind.varName)) {
          skippedExisting.push(ind.varName);
          continue;
        }
        const sortOrder = replaceAll ? i : nextSortOrder++;
        await sql`
          INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, service_category_ids, short_label, definition, type, aggregation, sort_order, updated_at)
          VALUES (${ind.varName}, ${ind.categoryId}, ${ind.subCategoryId}, ${JSON.stringify(ind.serviceCategoryIds)}, ${ind.shortLabel}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${sortOrder}, CURRENT_TIMESTAMP)
          ON CONFLICT (var_name) DO NOTHING
        `;
        insertedVarNames.add(ind.varName);
      }
      imported = insertedVarNames.size;

      for (const varName of insertedVarNames) {
        await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${varName}`;
      }
      for (const c of code) {
        if (!c.rCode.trim()) continue;
        if (!insertedVarNames.has(c.varName)) continue;
        await sql`
          INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
          VALUES (${c.varName}, ${c.timePoint}, ${c.rCode}, ${c.rFilterCode ?? null})
        `;
      }
    });
    return { success: true, data: { imported, skippedExisting } };
  });
}

export async function saveHfaIndicatorFull(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
  code: { timePoint: string; rCode: string; rFilterCode?: string | undefined }[],
  hasSyntaxError: boolean,
  codeConsistent: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const filterOnly = code.find(
      (c) => (c.rFilterCode?.trim() ?? "") !== "" && !c.rCode.trim(),
    );
    if (filterOnly) {
      return {
        success: false,
        err: `Filter code requires R code for time point "${filterOnly.timePoint}"`,
      };
    }
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE hfa_indicators
        SET var_name = ${indicator.varName},
            category_id = ${indicator.categoryId},
            sub_category_id = ${indicator.subCategoryId},
            service_category_ids = ${JSON.stringify(indicator.serviceCategoryIds)},
            short_label = ${indicator.shortLabel},
            definition = ${indicator.definition},
            type = ${indicator.type},
            aggregation = ${indicator.aggregation},
            sort_order = ${indicator.sortOrder},
            has_syntax_error = ${hasSyntaxError},
            code_consistent = ${codeConsistent},
            updated_at = CURRENT_TIMESTAMP
        WHERE var_name = ${oldVarName}
      `;
      await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${oldVarName}`;
      for (const c of code) {
        if (!c.rCode.trim()) continue;
        await sql`
          INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
          VALUES (${indicator.varName}, ${c.timePoint}, ${c.rCode}, ${c.rFilterCode ?? null})
        `;
      }
    });
    return { success: true };
  });
}

export async function bulkUpdateHfaIndicatorValidation(
  mainDb: Sql,
  updates: { varName: string; hasSyntaxError: boolean; codeConsistent: boolean }[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (const u of updates) {
        // Deliberately no updated_at bump: these flags are display-only editor
        // metadata (never copied into project snapshots), and bumping would
        // spuriously flag every project's HFA dataset as stale.
        await sql`
          UPDATE hfa_indicators
          SET has_syntax_error = ${u.hasSyntaxError},
              code_consistent = ${u.codeConsistent}
          WHERE var_name = ${u.varName}
        `;
      }
    });
    return { success: true };
  });
}

// ============================================================================
// Indicator Code (per time_point)
// ============================================================================

export async function getHfaIndicatorCode(
  mainDb: Sql,
  varName: string,
): Promise<APIResponseWithData<HfaIndicatorCode[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorCode[]>`
      SELECT * FROM hfa_indicator_code WHERE var_name = ${varName} ORDER BY time_point
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorCode) };
  });
}

export async function getAllHfaIndicatorCode(
  mainDb: Sql,
): Promise<HfaIndicatorCode[]> {
  const rows = await mainDb<DBHfaIndicatorCode[]>`
    SELECT * FROM hfa_indicator_code ORDER BY var_name, time_point
  `;
  return rows.map(dbRowToHfaIndicatorCode);
}

// ============================================================================
// Dictionary for Validation
// ============================================================================

export async function getHfaDictionaryForValidation(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaDictionaryForValidation>> {
  return await tryCatchDatabaseAsync(async () => {
    const tpRows = await mainDb<{ label: string }[]>`
      SELECT label FROM hfa_time_points ORDER BY sort_order
    `;
    const varRows = await mainDb<{ time_point: string; var_name: string; var_label: string; var_type: string }[]>`
      SELECT time_point, var_name, var_label, var_type FROM hfa_variables ORDER BY time_point, var_name
    `;
    const valRows = await mainDb<{ time_point: string; var_name: string; value: string; value_label: string }[]>`
      SELECT time_point, var_name, value, value_label FROM hfa_variable_values ORDER BY time_point, var_name, value
    `;

    const timePoints = tpRows.map((tp) => {
      return {
        timePoint: tp.label,
        vars: varRows
          .filter((v) => v.time_point === tp.label)
          .map((v) => ({ varName: v.var_name, varLabel: v.var_label, varType: v.var_type })),
        values: valRows
          .filter((v) => v.time_point === tp.label)
          .map((v) => ({ varName: v.var_name, value: v.value, valueLabel: v.value_label })),
      };
    });

    return { success: true, data: { timePoints } };
  });
}
