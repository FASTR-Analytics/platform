import { Sql } from "postgres";
import { z } from "zod";
import {
  APIResponseNoData,
  APIResponseWithData,
  composeHfaVariantColumnName,
  isReservedHfaVarName,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaIndicatorCategory,
  type HfaIndicatorServiceCategory,
  type HfaIndicatorSubCategory,
  type HfaIndicatorVariantCode,
  type HfaIndicatorVariantGroup,
  type HfaIndicatorVariantItem,
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
  variant_group_id: string | null;
};

type DBHfaIndicatorCode = {
  var_name: string;
  time_point: string;
  r_code: string;
  r_filter_code: string | null;
};

export type DBHfaIndicatorVariantGroup = {
  id: string;
  label: string;
  sort_order: number;
};

export type DBHfaIndicatorVariantItem = {
  id: string;
  group_id: string;
  label: string;
  sort_order: number;
};

type DBHfaIndicatorVariantCode = {
  var_name: string;
  time_point: string;
  item_id: string;
  r_code: string;
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
    variantGroupId: row.variant_group_id,
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

export function dbRowToHfaIndicatorVariantGroup(
  row: DBHfaIndicatorVariantGroup,
): HfaIndicatorVariantGroup {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

export function dbRowToHfaIndicatorVariantItem(
  row: DBHfaIndicatorVariantItem,
): HfaIndicatorVariantItem {
  return {
    id: row.id,
    groupId: row.group_id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

function dbRowToHfaIndicatorVariantCode(
  row: DBHfaIndicatorVariantCode,
): HfaIndicatorVariantCode {
  return {
    varName: row.var_name,
    timePoint: row.time_point,
    itemId: row.item_id,
    rCode: row.r_code,
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
    await mainDb.begin(async (sql) => {
      await sql`
        INSERT INTO hfa_indicator_categories (id, label, sort_order)
        VALUES (${category.id}, ${category.label}, ${category.sortOrder})
      `;
      await assertVariantIntegrity(sql);
    });
    return { success: true };
  });
}

export async function updateHfaIndicatorCategory(
  mainDb: Sql,
  oldId: string,
  category: HfaIndicatorCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE hfa_indicator_categories
        SET id = ${category.id},
            label = ${category.label},
            sort_order = ${category.sortOrder}
        WHERE id = ${oldId}
      `;
      await assertVariantIntegrity(sql);
    });
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
    await mainDb.begin(async (sql) => {
      await sql`
        INSERT INTO hfa_indicator_sub_categories (id, category_id, label, sort_order)
        VALUES (${subCategory.id}, ${subCategory.categoryId}, ${subCategory.label}, ${subCategory.sortOrder})
      `;
      await assertVariantIntegrity(sql);
    });
    return { success: true };
  });
}

export async function updateHfaIndicatorSubCategory(
  mainDb: Sql,
  oldId: string,
  subCategory: HfaIndicatorSubCategory,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE hfa_indicator_sub_categories
        SET id = ${subCategory.id},
            category_id = ${subCategory.categoryId},
            label = ${subCategory.label},
            sort_order = ${subCategory.sortOrder}
        WHERE id = ${oldId}
      `;
      await assertVariantIntegrity(sql);
    });
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
    await mainDb.begin(async (sql) => {
      await sql`
        INSERT INTO hfa_indicator_service_categories (id, label, sort_order)
        VALUES (${serviceCategory.id}, ${serviceCategory.label}, ${serviceCategory.sortOrder})
      `;
      await assertVariantIntegrity(sql);
    });
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
      await assertVariantIntegrity(sql);
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
// Variant Groups / Items / Code
// ============================================================================

// Variant integrity invariants, rechecked in full inside every mutating
// transaction that can affect them (data volumes are tiny); throws to roll the
// triggering write back. That includes the category-side CRUD: id-namespace
// uniqueness is bidirectional, so creating a category whose id collides with
// an existing variant item must fail at the category write, not poison every
// later variant write. This is the single authoritative enforcement of:
//   - item ids globally unique across all HFA id namespaces (labels resolve
//     through one flat id→label map, so a collision silently mislabels);
//   - composed per-item column names unique against indicator varNames, survey
//     variables, and each other, and not reserved (notably the `__status`
//     suffix, which would double-route into the response-status pivot);
//   - every variant code row's item belongs to its indicator's current group;
//   - an indicator with variant code has overall code (a variant-only parent
//     would be silently discarded by the script generator's "no code" skip).
async function assertVariantIntegrity(sql: Sql): Promise<void> {
  const itemRows = await sql<{ id: string }[]>`
    SELECT id FROM hfa_indicator_variant_items
  `;
  if (itemRows.length === 0) {
    return;
  }

  const varNameRows = await sql<{ var_name: string }[]>`
    SELECT var_name FROM hfa_indicators
  `;
  const varNames = new Set(varNameRows.map((r) => r.var_name));
  const namespaces: [string, Set<string>][] = [
    ["an indicator varName", varNames],
    [
      "a category id",
      new Set(
        (await sql<{ id: string }[]>`SELECT id FROM hfa_indicator_categories`).map((r) => r.id),
      ),
    ],
    [
      "a sub-category id",
      new Set(
        (await sql<{ id: string }[]>`SELECT id FROM hfa_indicator_sub_categories`).map((r) => r.id),
      ),
    ],
    [
      "a service-category id",
      new Set(
        (await sql<{ id: string }[]>`SELECT id FROM hfa_indicator_service_categories`).map((r) => r.id),
      ),
    ],
  ];
  for (const item of itemRows) {
    for (const [namespace, ids] of namespaces) {
      if (ids.has(item.id)) {
        throw new Error(
          `Variant item id "${item.id}" collides with ${namespace} — item ids must be unique across all HFA id namespaces`,
        );
      }
    }
  }

  const pairs = await sql<{ var_name: string; item_id: string }[]>`
    SELECT i.var_name, it.id AS item_id
    FROM hfa_indicators i
    JOIN hfa_indicator_variant_items it ON it.group_id = i.variant_group_id
  `;
  if (pairs.length > 0) {
    const surveyVarRows = await sql<{ var_name: string }[]>`
      SELECT DISTINCT var_name FROM hfa_variables
    `;
    const surveyVars = new Set(surveyVarRows.map((r) => r.var_name));
    const composed = new Set<string>();
    for (const p of pairs) {
      const name = composeHfaVariantColumnName(p.var_name, p.item_id);
      const source = `indicator "${p.var_name}" × variant item "${p.item_id}"`;
      if (isReservedHfaVarName(name)) {
        throw new Error(
          `Composed column name "${name}" (${source}) is reserved — choose a different item id`,
        );
      }
      if (varNames.has(name)) {
        throw new Error(
          `Composed column name "${name}" (${source}) collides with an indicator varName`,
        );
      }
      if (surveyVars.has(name)) {
        throw new Error(
          `Composed column name "${name}" (${source}) collides with a survey variable`,
        );
      }
      if (composed.has(name)) {
        throw new Error(
          `Composed column name "${name}" (${source}) collides with another composed column name`,
        );
      }
      composed.add(name);
    }
  }

  const orphanCode = await sql<{ var_name: string; item_id: string }[]>`
    SELECT c.var_name, c.item_id
    FROM hfa_indicator_variant_code c
    JOIN hfa_indicators i ON i.var_name = c.var_name
    LEFT JOIN hfa_indicator_variant_items it
      ON it.id = c.item_id AND it.group_id = i.variant_group_id
    WHERE it.id IS NULL
    LIMIT 1
  `;
  if (orphanCode.length > 0) {
    throw new Error(
      `Variant code for indicator "${orphanCode[0].var_name}" references item "${orphanCode[0].item_id}" which is not in the indicator's variant group`,
    );
  }

  const variantOnly = await sql<{ var_name: string }[]>`
    SELECT DISTINCT c.var_name
    FROM hfa_indicator_variant_code c
    WHERE NOT EXISTS (
      SELECT 1 FROM hfa_indicator_code p
      WHERE p.var_name = c.var_name AND TRIM(p.r_code) != ''
    )
    LIMIT 1
  `;
  if (variantOnly.length > 0) {
    throw new Error(
      `Indicator "${variantOnly[0].var_name}" has variant code but no overall R code — an indicator with variant code must have overall code`,
    );
  }
}

// Changing/nulling an indicator's variant_group_id deletes its code rows whose
// item is not in the new group — else stale code silently re-activates when the
// indicator is later reassigned to the old group.
async function deleteOutOfGroupVariantCode(
  sql: Sql,
  varName: string,
  variantGroupId: string | null,
): Promise<void> {
  if (variantGroupId === null) {
    await sql`
      DELETE FROM hfa_indicator_variant_code WHERE var_name = ${varName}
    `;
  } else {
    await sql`
      DELETE FROM hfa_indicator_variant_code
      WHERE var_name = ${varName}
        AND item_id NOT IN (
          SELECT id FROM hfa_indicator_variant_items WHERE group_id = ${variantGroupId}
        )
    `;
  }
}

export async function getHfaIndicatorVariantGroups(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicatorVariantGroup[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorVariantGroup[]>`
      SELECT * FROM hfa_indicator_variant_groups ORDER BY sort_order, label
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorVariantGroup) };
  });
}

export async function createHfaIndicatorVariantGroup(
  mainDb: Sql,
  group: HfaIndicatorVariantGroup,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicator_variant_groups (id, label, sort_order)
      VALUES (${group.id}, ${group.label}, ${group.sortOrder})
    `;
    return { success: true };
  });
}

export async function updateHfaIndicatorVariantGroup(
  mainDb: Sql,
  oldId: string,
  group: HfaIndicatorVariantGroup,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // An id change cascades to items.group_id and indicators.variant_group_id.
    await mainDb`
      UPDATE hfa_indicator_variant_groups
      SET id = ${group.id},
          label = ${group.label},
          sort_order = ${group.sortOrder}
      WHERE id = ${oldId}
    `;
    return { success: true };
  });
}

export async function deleteHfaIndicatorVariantGroup(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const referencing = await mainDb<{ var_name: string }[]>`
      SELECT var_name FROM hfa_indicators WHERE variant_group_id = ${id} ORDER BY var_name
    `;
    if (referencing.length > 0) {
      return {
        success: false,
        err: `Cannot delete variant group: still assigned to ${referencing.length} indicator(s) (e.g. "${referencing[0].var_name}")`,
      };
    }
    await mainDb`
      DELETE FROM hfa_indicator_variant_groups WHERE id = ${id}
    `;
    return { success: true };
  });
}

export async function reorderHfaIndicatorVariantGroups(
  mainDb: Sql,
  orderedIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await sql`
          UPDATE hfa_indicator_variant_groups
          SET sort_order = ${i}
          WHERE id = ${orderedIds[i]}
        `;
      }
    });
    return { success: true };
  });
}

export async function getHfaIndicatorVariantItems(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaIndicatorVariantItem[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorVariantItem[]>`
      SELECT * FROM hfa_indicator_variant_items ORDER BY group_id, sort_order, label
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorVariantItem) };
  });
}

export async function createHfaIndicatorVariantItem(
  mainDb: Sql,
  item: HfaIndicatorVariantItem,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        INSERT INTO hfa_indicator_variant_items (id, group_id, label, sort_order)
        VALUES (${item.id}, ${item.groupId}, ${item.label}, ${item.sortOrder})
      `;
      await assertVariantIntegrity(sql);
    });
    return { success: true };
  });
}

export async function updateHfaIndicatorVariantItem(
  mainDb: Sql,
  oldId: string,
  item: HfaIndicatorVariantItem,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      const oldRows = await sql<{ group_id: string }[]>`
        SELECT group_id FROM hfa_indicator_variant_items WHERE id = ${oldId}
      `;
      // Moving an item to another group orphans its code rows (their parents
      // are in the old group) — delete them before the move.
      if (oldRows.length > 0 && oldRows[0].group_id !== item.groupId) {
        await sql`
          DELETE FROM hfa_indicator_variant_code WHERE item_id = ${oldId}
        `;
      }
      // An id change cascades to variant code rows.
      await sql`
        UPDATE hfa_indicator_variant_items
        SET id = ${item.id},
            group_id = ${item.groupId},
            label = ${item.label},
            sort_order = ${item.sortOrder}
        WHERE id = ${oldId}
      `;
      await assertVariantIntegrity(sql);
    });
    return { success: true };
  });
}

export async function deleteHfaIndicatorVariantItem(
  mainDb: Sql,
  id: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      DELETE FROM hfa_indicator_variant_items WHERE id = ${id}
    `;
    return { success: true };
  });
}

export async function reorderHfaIndicatorVariantItems(
  mainDb: Sql,
  groupId: string,
  orderedIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await sql`
          UPDATE hfa_indicator_variant_items
          SET sort_order = ${i}
          WHERE id = ${orderedIds[i]} AND group_id = ${groupId}
        `;
      }
    });
    return { success: true };
  });
}

export async function getHfaIndicatorVariantCode(
  mainDb: Sql,
  varName: string,
): Promise<APIResponseWithData<HfaIndicatorVariantCode[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaIndicatorVariantCode[]>`
      SELECT * FROM hfa_indicator_variant_code
      WHERE var_name = ${varName}
      ORDER BY time_point, item_id
    `;
    return { success: true, data: rows.map(dbRowToHfaIndicatorVariantCode) };
  });
}

export async function getAllHfaIndicatorVariantCode(
  mainDb: Sql,
): Promise<HfaIndicatorVariantCode[]> {
  const rows = await mainDb<DBHfaIndicatorVariantCode[]>`
    SELECT * FROM hfa_indicator_variant_code ORDER BY var_name, time_point, item_id
  `;
  return rows.map(dbRowToHfaIndicatorVariantCode);
}

// ============================================================================
// Indicators
// ============================================================================

export async function createHfaIndicator(
  mainDb: Sql,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, service_category_ids, short_label, definition, type, aggregation, sort_order, variant_group_id, updated_at)
        VALUES (${indicator.varName}, ${indicator.categoryId}, ${indicator.subCategoryId}, ${JSON.stringify(indicator.serviceCategoryIds)}, ${indicator.shortLabel}, ${indicator.definition}, ${indicator.type}, ${indicator.aggregation}, ${indicator.sortOrder}, ${indicator.variantGroupId}, CURRENT_TIMESTAMP)
      `;
      await assertVariantIntegrity(sql);
    });
    return { success: true };
  });
}

export async function updateHfaIndicator(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await deleteOutOfGroupVariantCode(sql, oldVarName, indicator.variantGroupId);
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
            variant_group_id = ${indicator.variantGroupId},
            updated_at = CURRENT_TIMESTAMP
        WHERE var_name = ${oldVarName}
      `;
      await assertVariantIntegrity(sql);
    });
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
        await deleteOutOfGroupVariantCode(sql, oldVarName, indicator.variantGroupId);
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
              variant_group_id = ${indicator.variantGroupId},
              updated_at = CURRENT_TIMESTAMP
          WHERE var_name = ${oldVarName}
        `;
      }
      await assertVariantIntegrity(sql);
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
          INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, service_category_ids, short_label, definition, type, aggregation, sort_order, has_syntax_error, code_consistent, variant_group_id, updated_at)
          VALUES (${ind.varName}, ${ind.categoryId}, ${ind.subCategoryId}, ${JSON.stringify(ind.serviceCategoryIds)}, ${ind.shortLabel}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${sortOrder}, ${ind.hasSyntaxError}, ${ind.codeConsistent}, ${ind.variantGroupId}, CURRENT_TIMESTAMP)
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
      await assertVariantIntegrity(sql);
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
      const { categories, subCategories, serviceCategories, variantGroups, variantItems, indicators, code, variantCode, replaceAll } = data;

      if (replaceAll) {
        // Deleting indicators cascades to hfa_indicator_code and
        // hfa_indicator_variant_code; delete in FK-safe order (indicators ->
        // sub-categories -> categories; variant groups only after indicators
        // no longer reference them, items cascade from groups).
        await sql`DELETE FROM hfa_indicators`;
        await sql`DELETE FROM hfa_indicator_sub_categories`;
        await sql`DELETE FROM hfa_indicator_categories`;
        await sql`DELETE FROM hfa_indicator_service_categories`;
        await sql`DELETE FROM hfa_indicator_variant_groups`;

        for (let i = 0; i < categories.length; i++) {
          const cat = categories[i];
          await sql`
            INSERT INTO hfa_indicator_categories (id, label, sort_order)
            VALUES (${cat.id}, ${cat.label}, ${i})
          `;
        }

        for (let i = 0; i < variantGroups.length; i++) {
          const vg = variantGroups[i];
          await sql`
            INSERT INTO hfa_indicator_variant_groups (id, label, sort_order)
            VALUES (${vg.id}, ${vg.label}, ${i})
          `;
        }

        const itemOrderByGroup = new Map<string, number>();
        for (const vi of variantItems) {
          const order = itemOrderByGroup.get(vi.groupId) ?? 0;
          itemOrderByGroup.set(vi.groupId, order + 1);
          await sql`
            INSERT INTO hfa_indicator_variant_items (id, group_id, label, sort_order)
            VALUES (${vi.id}, ${vi.groupId}, ${vi.label}, ${order})
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

        // Upsert variant groups, preserving existing order; new ones appended.
        const existingVgRows = await sql<{ id: string }[]>`
          SELECT id FROM hfa_indicator_variant_groups
        `;
        const existingVgIds = new Set(existingVgRows.map((r) => r.id));
        const maxVgRow = await sql<{ m: number | null }[]>`
          SELECT MAX(sort_order) as m FROM hfa_indicator_variant_groups
        `;
        let nextVgOrder = (maxVgRow[0]?.m ?? -1) + 1;
        for (const vg of variantGroups) {
          if (existingVgIds.has(vg.id)) {
            await sql`
              UPDATE hfa_indicator_variant_groups SET label = ${vg.label} WHERE id = ${vg.id}
            `;
          } else {
            await sql`
              INSERT INTO hfa_indicator_variant_groups (id, label, sort_order)
              VALUES (${vg.id}, ${vg.label}, ${nextVgOrder++})
            `;
          }
        }

        // Upsert variant items, preserving existing order; new ones appended
        // within their group. Moving an item to another group orphans its code
        // rows (their parents are in the old group) — delete them first.
        const existingViRows = await sql<
          { id: string; group_id: string; sort_order: number }[]
        >`
          SELECT id, group_id, sort_order FROM hfa_indicator_variant_items
        `;
        const existingViById = new Map(existingViRows.map((r) => [r.id, r]));
        const maxViOrderByGroup = new Map<string, number>();
        for (const r of existingViRows) {
          maxViOrderByGroup.set(
            r.group_id,
            Math.max(maxViOrderByGroup.get(r.group_id) ?? -1, r.sort_order),
          );
        }
        for (const vi of variantItems) {
          const existing = existingViById.get(vi.id);
          if (existing) {
            if (existing.group_id !== vi.groupId) {
              await sql`
                DELETE FROM hfa_indicator_variant_code WHERE item_id = ${vi.id}
              `;
            }
            await sql`
              UPDATE hfa_indicator_variant_items
              SET group_id = ${vi.groupId}, label = ${vi.label}
              WHERE id = ${vi.id}
            `;
          } else {
            const order = (maxViOrderByGroup.get(vi.groupId) ?? -1) + 1;
            maxViOrderByGroup.set(vi.groupId, order);
            await sql`
              INSERT INTO hfa_indicator_variant_items (id, group_id, label, sort_order)
              VALUES (${vi.id}, ${vi.groupId}, ${vi.label}, ${order})
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
          INSERT INTO hfa_indicators (var_name, category_id, sub_category_id, service_category_ids, short_label, definition, type, aggregation, sort_order, variant_group_id, updated_at)
          VALUES (${ind.varName}, ${ind.categoryId}, ${ind.subCategoryId}, ${JSON.stringify(ind.serviceCategoryIds)}, ${ind.shortLabel}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${sortOrder}, ${ind.variantGroupId}, CURRENT_TIMESTAMP)
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
      for (const varName of insertedVarNames) {
        await sql`DELETE FROM hfa_indicator_variant_code WHERE var_name = ${varName}`;
      }
      for (const vc of variantCode) {
        if (!vc.rCode.trim()) continue;
        if (!insertedVarNames.has(vc.varName)) continue;
        await sql`
          INSERT INTO hfa_indicator_variant_code (var_name, time_point, item_id, r_code)
          VALUES (${vc.varName}, ${vc.timePoint}, ${vc.itemId}, ${vc.rCode})
        `;
      }
      await assertVariantIntegrity(sql);
    });
    return { success: true, data: { imported, skippedExisting } };
  });
}

export async function saveHfaIndicatorFull(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
  code: { timePoint: string; rCode: string; rFilterCode?: string | undefined }[],
  variantCode: { timePoint: string; itemId: string; rCode: string }[],
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
    const nonEmptyVariantCode = variantCode.filter((c) => c.rCode.trim() !== "");
    if (nonEmptyVariantCode.length > 0 && indicator.variantGroupId === null) {
      return {
        success: false,
        err: "Variant code requires the indicator to be assigned a variant group",
      };
    }
    await mainDb.begin(async (sql) => {
      await deleteOutOfGroupVariantCode(sql, oldVarName, indicator.variantGroupId);
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
            variant_group_id = ${indicator.variantGroupId},
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
      await sql`DELETE FROM hfa_indicator_variant_code WHERE var_name = ${oldVarName}`;
      for (const c of nonEmptyVariantCode) {
        await sql`
          INSERT INTO hfa_indicator_variant_code (var_name, time_point, item_id, r_code)
          VALUES (${indicator.varName}, ${c.timePoint}, ${c.itemId}, ${c.rCode})
        `;
      }
      await assertVariantIntegrity(sql);
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
