import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  type BatchIndicator,
  buildExpressionDictionary,
  type CommonIndicator,
  type CommonIndicatorDefinition,
  describeNewIndicatorIdIssue,
  type ExpressionDictionaryEntry,
  getNewIndicatorIdIssue,
  IndicatorExpressionError,
  type InstanceIndicatorDetails,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  populationIngredientId,
  resolveIndicatorExpression,
  type ThresholdsRule,
  thresholdsRuleSchema,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { readCsvFile } from "@timroberton/panther";

// The stored shape of one common indicator. `expression` carries a derived
// indicator's formula and is NULL for a base one (PLAN_1a §1.2). `thresholds`
// is the CF rule as JSON text (every JSON column is text: JSON.parse on read,
// JSON.stringify on write — SYSTEM_02), validated by the lib schema here.
export type DBIndicatorCommon = {
  indicator_common_id: string;
  indicator_common_label: string;
  is_default: boolean;
  definition_type: "base" | "derived";
  expression: string | null;
  format_as: "percent" | "number" | "rate_per_10k";
  thresholds: string | null;
  sort_order: number;
};

const COMMON_INDICATOR_COLUMNS =
  `indicator_common_id, indicator_common_label, is_default, definition_type, expression, format_as, thresholds, sort_order`;

export function dbRowToCommonIndicator(row: DBIndicatorCommon): CommonIndicator {
  return {
    indicator_common_id: row.indicator_common_id,
    indicator_common_label: row.indicator_common_label,
    is_default: row.is_default,
    definition: dbRowToDefinition(row),
    format_as: row.format_as,
    thresholds: row.thresholds === null
      ? null
      : thresholdsRuleSchema.parse(JSON.parse(row.thresholds)),
    sort_order: row.sort_order,
  };
}

function thresholdsToDb(thresholds: ThresholdsRule | null): string | null {
  return thresholds === null ? null : JSON.stringify(thresholds);
}

function dbRowToDefinition(row: DBIndicatorCommon): CommonIndicatorDefinition {
  switch (row.definition_type) {
    case "base":
      return { type: "base" };
    case "derived":
      return { type: "derived", expression: row.expression! };
  }
}

type DefinitionFields = {
  definition_type: CommonIndicatorDefinition["type"];
  expression: string | null;
};

function definitionFields(
  definition: CommonIndicatorDefinition,
): DefinitionFields {
  switch (definition.type) {
    case "base":
      return { definition_type: "base", expression: null };
    case "derived":
      return { definition_type: "derived", expression: definition.expression };
  }
}

// `format_as` is display-only and the sole scale (PLAN_1c ruling 3). A base
// indicator is a count, so it is always a number; a derived one chooses.
function formatRuleError(
  definition: CommonIndicatorDefinition,
  formatAs: CommonIndicator["format_as"],
): string | undefined {
  return definition.type === "base" && formatAs !== "number"
    ? "A base indicator is a count and is always formatted as a number"
    : undefined;
}

// The live expression dictionary: every common indicator, plus every
// population type under its `population:<type>` ingredient id.
async function loadExpressionDictionaryEntries(
  sql: Sql,
): Promise<ExpressionDictionaryEntry[]> {
  const stored = await sql<
    {
      indicator_common_id: string;
      definition_type: "base" | "derived";
      expression: string | null;
    }[]
  >`SELECT indicator_common_id, definition_type, expression FROM indicators`;
  const populationTypes = await sql<{ id: string }[]>`
    SELECT id FROM population_types
  `;
  return [
    ...stored.map((r) => ({
      id: r.indicator_common_id,
      type: r.definition_type,
      expression: r.expression,
    })),
    ...populationTypes.map((r) => ({
      id: populationIngredientId(r.id),
      type: "population" as const,
      expression: null,
    })),
  ];
}

// =============================================================================
// READ OPERATIONS
// =============================================================================

export async function getCommonIndicators(
  mainDb: Sql,
): Promise<CommonIndicator[]> {
  const rows = await mainDb.unsafe<DBIndicatorCommon[]>(
    `SELECT ${COMMON_INDICATOR_COLUMNS} FROM indicators ORDER BY sort_order, indicator_common_id`,
  );
  return rows.map(dbRowToCommonIndicator);
}

// Get all indicators with their mappings
export async function getIndicatorsWithMappings(
  mainDb: Sql,
): Promise<APIResponseWithData<InstanceIndicatorDetails>> {
  return await tryCatchDatabaseAsync(async () => {
    // Get all common indicators with their raw ID mappings aggregated
    const commonIndicatorsResult = await mainDb.unsafe<
      (DBIndicatorCommon & { raw_indicator_ids: string | null })[]
    >(`
      SELECT
        ${
      COMMON_INDICATOR_COLUMNS.split(", ").map((c) => `i.${c}`).join(", ")
    },
        STRING_AGG(im.indicator_raw_id, ',') as raw_indicator_ids
      FROM indicators i
      LEFT JOIN indicator_mappings im ON i.indicator_common_id = im.indicator_common_id
      GROUP BY ${
      COMMON_INDICATOR_COLUMNS.split(", ").map((c) => `i.${c}`).join(", ")
    }
      ORDER BY i.sort_order, i.indicator_common_id
    `);

    const commonIndicators = commonIndicatorsResult.map((row) => ({
      ...dbRowToCommonIndicator(row),
      raw_indicator_ids: row.raw_indicator_ids
        ? row.raw_indicator_ids.split(",")
        : [],
    }));

    // Get all raw indicators with their common ID mappings aggregated
    const rawIndicatorsResult = await mainDb<
      {
        indicator_raw_id: string;
        indicator_raw_label: string;
        indicator_common_ids: string | null;
      }[]
    >`
      SELECT 
        ir.indicator_raw_id,
        ir.indicator_raw_label,
        STRING_AGG(im.indicator_common_id, ',') as indicator_common_ids
      FROM indicators_raw ir
      LEFT JOIN indicator_mappings im ON ir.indicator_raw_id = im.indicator_raw_id
      GROUP BY ir.indicator_raw_id, ir.indicator_raw_label
      ORDER BY ir.indicator_raw_id
    `;

    const rawIndicators = rawIndicatorsResult.map((row) => ({
      raw_indicator_id: row.indicator_raw_id,
      raw_indicator_label: row.indicator_raw_label,
      indicator_common_ids: row.indicator_common_ids
        ? row.indicator_common_ids.split(",")
        : [],
    }));

    return {
      success: true,
      data: {
        commonIndicators,
        rawIndicators,
      },
    };
  });
}

// =============================================================================
// COMMON INDICATOR OPERATIONS
// =============================================================================

// The authoring validator (PLAN_1a §1.2): an expression may only name commons
// that resolve to `base` or `derived`, may not cycle or nest too deep, and
// must flatten to no more ingredients than a results row can carry. Enforced
// HERE, where the user is; run capture enforces the same rules again where the
// data is. `pendingDefinitions` overrides what the dictionary says about the
// rows being written, so a cycle is judged against the state the write would
// produce.
async function checkDefinitionsResolve(
  mainDb: Sql,
  pendingDefinitions: Map<string, CommonIndicatorDefinition>,
): Promise<string | undefined> {
  // The resolver reports an unknown `population:<type>` term itself, naming
  // the Population page — the store's types are ordinary dictionary entries.
  const entries = new Map<string, ExpressionDictionaryEntry>(
    (await loadExpressionDictionaryEntries(mainDb)).map((e) => [e.id, e]),
  );
  for (const [id, definition] of pendingDefinitions) {
    entries.set(id, {
      id,
      type: definition.type,
      expression: definition.type === "base" ? null : definition.expression,
    });
  }
  const dictionary = buildExpressionDictionary([...entries.values()]);
  for (const [id, definition] of pendingDefinitions) {
    if (definition.type === "base") continue;
    try {
      resolveIndicatorExpression({
        ownId: id,
        source: definition.expression,
        dictionary,
        maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
    } catch (e) {
      if (e instanceof IndicatorExpressionError) return e.message;
      throw e;
    }
  }
  // A write can also break an indicator that is not itself being written —
  // repointing a common at a new expression invalidates every chain that
  // runs through it.
  for (const entry of entries.values()) {
    if (entry.type !== "derived" || pendingDefinitions.has(entry.id)) continue;
    try {
      resolveIndicatorExpression({
        ownId: entry.id,
        source: entry.expression ?? "",
        dictionary,
        maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
    } catch (e) {
      if (e instanceof IndicatorExpressionError) {
        return `This change would break ${
          JSON.stringify(entry.id)
        }: ${e.message}`;
      }
      throw e;
    }
  }
  return undefined;
}

export type NewCommonIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  mapped_raw_ids: string[];
  definition: CommonIndicatorDefinition;
  format_as: CommonIndicator["format_as"];
  thresholds: CommonIndicator["thresholds"];
};

// Create multiple common indicators with raw indicator mappings
export async function createIndicatorsCommon(
  mainDb: Sql,
  indicators: NewCommonIndicator[],
): Promise<
  APIResponseWithData<{ created: number; failed: number; errors: string[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    for (const indicator of indicators) {
      const idIssue = getNewIndicatorIdIssue(indicator.indicator_common_id);
      if (idIssue) {
        return {
          success: false,
          err: `Invalid indicator ID ${
            JSON.stringify(indicator.indicator_common_id)
          }: ${describeNewIndicatorIdIssue(idIssue)}`,
        };
      }
    }

    // Check for duplicate indicator_common_ids in the request
    const ids = indicators.map((i) => i.indicator_common_id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      return {
        success: false,
        err: `Duplicate indicator IDs in request: ${duplicateIds.join(", ")}`,
      };
    }

    // Check if any indicators already exist
    const existingIds = await mainDb`
      SELECT indicator_common_id
      FROM indicators
      WHERE indicator_common_id = ANY(${ids})
    `;

    if (existingIds.length > 0) {
      const existing = existingIds.map((row) => row.indicator_common_id);
      return {
        success: false,
        err: `Indicators already exist: ${existing.join(", ")}`,
      };
    }

    // Check that all mapped raw ids exist (friendlier than the FK error)
    const allRawIds = [...new Set(indicators.flatMap((i) => i.mapped_raw_ids))];
    if (allRawIds.length > 0) {
      const existingRaw = await mainDb<{ indicator_raw_id: string }[]>`
        SELECT indicator_raw_id FROM indicators_raw
        WHERE indicator_raw_id = ANY(${allRawIds})
      `;
      const existingRawSet = new Set(
        existingRaw.map((r) => r.indicator_raw_id),
      );
      const missingRaw = allRawIds.filter((id) => !existingRawSet.has(id));
      if (missingRaw.length > 0) {
        return {
          success: false,
          err: `Mapped raw indicators do not exist: ${missingRaw.join(", ")}`,
        };
      }
    }

    for (const indicator of indicators) {
      const formatErr = formatRuleError(
        indicator.definition,
        indicator.format_as,
      );
      if (formatErr) {
        return {
          success: false,
          err: `${indicator.indicator_common_id}: ${formatErr}`,
        };
      }
    }

    const definitionErr = await checkDefinitionsResolve(
      mainDb,
      new Map(
        indicators.map((i) => [i.indicator_common_id, i.definition]),
      ),
    );
    if (definitionErr) {
      return { success: false, err: definitionErr };
    }

    const nextSortOrder = (
      await mainDb<{ next: number }[]>`
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM indicators
      `
    )[0].next;

    // All-or-nothing: one failed item aborts the whole Postgres transaction
    // (every later statement fails with "transaction is aborted"), so
    // per-item catch-and-continue can never deliver partial success. The
    // rethrow decorates the error with the item that caused it.
    await mainDb.begin(async (sql) => {
      let sortOrder = nextSortOrder;
      for (const indicator of indicators) {
        try {
          const d = definitionFields(indicator.definition);
          await sql`
            INSERT INTO indicators (
              indicator_common_id, indicator_common_label, is_default,
              definition_type, expression,
              format_as, thresholds, sort_order, updated_at
            )
            VALUES (
              ${indicator.indicator_common_id}, ${indicator.indicator_common_label}, FALSE,
              ${d.definition_type}, ${d.expression},
              ${indicator.format_as},
              ${thresholdsToDb(indicator.thresholds)},
              ${sortOrder++}, CURRENT_TIMESTAMP
            )
          `;
          // Only a base indicator is defined by mappings (the same rule
          // updateIndicatorCommon applies on a retype).
          const rawIds = indicator.definition.type === "base"
            ? indicator.mapped_raw_ids
            : [];
          for (const rawId of rawIds) {
            await sql`
              INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
              VALUES (${rawId}, ${indicator.indicator_common_id}, CURRENT_TIMESTAMP)
            `;
          }
        } catch (error) {
          throw new Error(
            `${indicator.indicator_common_id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      }
    });

    return {
      success: true,
      data: { created: indicators.length, failed: 0, errors: [] },
    };
  });
}

// Update a common indicator and replace its raw indicator mappings
export async function updateIndicatorCommon(
  mainDb: Sql,
  oldIndicatorCommonId: string,
  update: {
    indicator_common_id: string;
    indicator_common_label: string;
    mapped_raw_ids: string[];
    definition: CommonIndicatorDefinition;
    format_as: CommonIndicator["format_as"];
    thresholds: CommonIndicator["thresholds"];
  },
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (oldIndicatorCommonId !== update.indicator_common_id) {
      return {
        success: false,
        err:
          "Indicator IDs cannot be changed after creation. Create a new indicator instead.",
      };
    }

    const formatErr = formatRuleError(update.definition, update.format_as);
    if (formatErr) {
      return { success: false, err: formatErr };
    }

    const definitionErr = await checkDefinitionsResolve(
      mainDb,
      new Map([[oldIndicatorCommonId, update.definition]]),
    );
    if (definitionErr) {
      return { success: false, err: definitionErr };
    }

    // Only a base indicator is defined by mappings. A retype to derived
    // drops them rather than leaving orphaned rows that no extract would
    // ever read again.
    const rawIds = update.definition.type === "base"
      ? update.mapped_raw_ids
      : [];

    const d = definitionFields(update.definition);

    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE indicators
        SET
          indicator_common_label = ${update.indicator_common_label},
          definition_type = ${d.definition_type},
          expression = ${d.expression},
          format_as = ${update.format_as},
          thresholds = ${thresholdsToDb(update.thresholds)},
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${oldIndicatorCommonId}
      `;

      // Delete existing mappings
      await sql`
        DELETE FROM indicator_mappings
        WHERE indicator_common_id = ${oldIndicatorCommonId}
      `;

      // Create new mappings
      for (const rawId of rawIds) {
        await sql`
          INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
          VALUES (${rawId}, ${oldIndicatorCommonId}, CURRENT_TIMESTAMP)
        `;
      }
    });

    return { success: true };
  });
}

export async function reorderCommonIndicators(
  mainDb: Sql,
  order: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      for (let i = 0; i < order.length; i++) {
        await sql`
          UPDATE indicators
          SET sort_order = ${i + 1},
              updated_at = CURRENT_TIMESTAMP
          WHERE indicator_common_id = ${order[i]}
        `;
      }
    });
    return { success: true };
  });
}

// Delete common indicators (automatically cascades to mappings)
export async function deleteIndicatorCommon(
  mainDb: Sql,
  indicatorCommonIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (indicatorCommonIds.length === 0) {
      return { success: true };
    }

    const allIndicators = await mainDb<
      { indicator_common_id: string; is_default: boolean }[]
    >`
      SELECT indicator_common_id, is_default
      FROM indicators
      WHERE indicator_common_id = ANY(${indicatorCommonIds})
    `;

    const foundIds = new Set(
      allIndicators.map((row) => row.indicator_common_id),
    );
    const notFoundIds = indicatorCommonIds.filter((id) => !foundIds.has(id));
    if (notFoundIds.length > 0) {
      return {
        success: false,
        err: `Common indicators not found: ${notFoundIds.join(", ")}`,
      };
    }

    const defaultIds = allIndicators
      .filter((row) => row.is_default)
      .map((row) => row.indicator_common_id);
    if (defaultIds.length > 0) {
      return {
        success: false,
        err: `Cannot delete default indicators: ${defaultIds.join(", ")}`,
      };
    }

    // The delete guard, re-expressed over expressions: a common indicator
    // named by another common's formula cannot go. Resolving each surviving
    // definition against the post-delete dictionary is what makes the check
    // exact — an id used only deep inside a chain blocks the delete just as a
    // directly-named one does.
    const requestedIds = new Set(indicatorCommonIds);
    const survivors = (await loadExpressionDictionaryEntries(mainDb)).filter(
      (e) => !requestedIds.has(e.id),
    );
    const dictionary = buildExpressionDictionary(survivors);
    const blocked: string[] = [];
    for (const survivor of survivors) {
      if (survivor.type !== "derived") continue;
      try {
        resolveIndicatorExpression({
          ownId: survivor.id,
          source: survivor.expression ?? "",
          dictionary,
          maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
        });
      } catch (e) {
        if (!(e instanceof IndicatorExpressionError)) throw e;
        blocked.push(`${survivor.id} (${e.message})`);
      }
    }
    if (blocked.length > 0) {
      return {
        success: false,
        err:
          `Cannot delete common indicators that other indicators are defined from: ${
            blocked.join("; ")
          }`,
      };
    }

    // CASCADE foreign key will automatically delete mappings
    await mainDb`
      DELETE FROM indicators
      WHERE indicator_common_id = ANY(${indicatorCommonIds})
    `;

    return { success: true };
  });
}

// =============================================================================
// RAW INDICATOR OPERATIONS
// =============================================================================

// Create multiple raw indicators with common indicator mappings
export async function createIndicatorsRaw(
  mainDb: Sql,
  indicators: Array<{
    indicator_raw_id: string;
    indicator_raw_label: string;
    mapped_common_ids: string[];
  }>,
): Promise<
  APIResponseWithData<{ created: number; failed: number; errors: string[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    for (const indicator of indicators) {
      const idIssue = getNewIndicatorIdIssue(indicator.indicator_raw_id);
      if (idIssue) {
        return {
          success: false,
          err: `Invalid indicator ID ${
            JSON.stringify(indicator.indicator_raw_id)
          }: ${describeNewIndicatorIdIssue(idIssue)}`,
        };
      }
    }

    // Check that all mapped common ids exist (friendlier than the FK error)
    const allCommonIds = [
      ...new Set(indicators.flatMap((i) => i.mapped_common_ids)),
    ];
    if (allCommonIds.length > 0) {
      const existingCommon = await mainDb<{ indicator_common_id: string }[]>`
        SELECT indicator_common_id FROM indicators
        WHERE indicator_common_id = ANY(${allCommonIds})
      `;
      const existingCommonSet = new Set(
        existingCommon.map((r) => r.indicator_common_id),
      );
      const missingCommon = allCommonIds.filter(
        (id) => !existingCommonSet.has(id),
      );
      if (missingCommon.length > 0) {
        return {
          success: false,
          err: `Mapped common indicators do not exist: ${
            missingCommon.join(", ")
          }`,
        };
      }
    }

    // All-or-nothing: one failed item aborts the whole Postgres transaction
    // (every later statement fails with "transaction is aborted"), so
    // per-item catch-and-continue can never deliver partial success. The
    // rethrow decorates the error with the item that caused it.
    await mainDb.begin(async (sql) => {
      for (const indicator of indicators) {
        try {
          await sql`
            INSERT INTO indicators_raw (indicator_raw_id, indicator_raw_label, updated_at)
            VALUES (${indicator.indicator_raw_id}, ${indicator.indicator_raw_label}, CURRENT_TIMESTAMP)
            ON CONFLICT (indicator_raw_id)
            DO UPDATE SET
              indicator_raw_label = EXCLUDED.indicator_raw_label,
              updated_at = CURRENT_TIMESTAMP
          `;
          for (const commonId of indicator.mapped_common_ids) {
            await sql`
              INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
              VALUES (${indicator.indicator_raw_id}, ${commonId}, CURRENT_TIMESTAMP)
              ON CONFLICT (indicator_raw_id, indicator_common_id)
              DO UPDATE SET updated_at = CURRENT_TIMESTAMP
            `;
          }
        } catch (error) {
          throw new Error(
            `${indicator.indicator_raw_id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      }
    });

    return {
      success: true,
      data: { created: indicators.length, failed: 0, errors: [] },
    };
  });
}

// Update a raw indicator and replace its common indicator mappings
export async function updateIndicatorRaw(
  mainDb: Sql,
  oldIndicatorRawId: string,
  newIndicatorRawId: string,
  indicatorRawLabel: string,
  mappedCommonIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (oldIndicatorRawId !== newIndicatorRawId) {
      return {
        success: false,
        err:
          "Indicator IDs cannot be changed after creation. Create a new indicator instead.",
      };
    }

    await mainDb.begin(async (sql) => {
      // Update the raw indicator
      await sql`
        UPDATE indicators_raw 
        SET 
          indicator_raw_id = ${newIndicatorRawId},
          indicator_raw_label = ${indicatorRawLabel},
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_raw_id = ${oldIndicatorRawId}
      `;

      // Delete existing mappings for this raw indicator
      await sql`
        DELETE FROM indicator_mappings 
        WHERE indicator_raw_id = ${oldIndicatorRawId}
      `;

      // Create new mappings
      for (const commonId of mappedCommonIds) {
        await sql`
          INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
          VALUES (${newIndicatorRawId}, ${commonId}, CURRENT_TIMESTAMP)
        `;
      }
    });

    return { success: true };
  });
}

// Delete raw indicators (checks for usage in dataset_hmis first)
export async function deleteIndicatorRaw(
  mainDb: Sql,
  indicatorRawIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (indicatorRawIds.length === 0) {
      return { success: true };
    }

    // Check if any raw indicators are used in dataset_hmis
    const usageCheck = await mainDb<
      { indicator_raw_id: string; count: number }[]
    >`
      SELECT indicator_raw_id, COUNT(*) as count 
      FROM dataset_hmis 
      WHERE indicator_raw_id = ANY(${indicatorRawIds})
      GROUP BY indicator_raw_id
    `;

    const usedIndicators = usageCheck.filter((row) => row.count > 0);
    if (usedIndicators.length > 0) {
      const usageDetails = usedIndicators
        .map((u) => `${u.indicator_raw_id} (${u.count} records)`)
        .join(", ");
      return {
        success: false,
        err:
          `Cannot delete raw indicators with data in dataset_hmis: ${usageDetails}`,
      };
    }

    // Check if all indicators exist
    const existingIndicators = await mainDb<{ indicator_raw_id: string }[]>`
      SELECT indicator_raw_id
      FROM indicators_raw
      WHERE indicator_raw_id = ANY(${indicatorRawIds})
    `;

    const existingIds = existingIndicators.map((row) => row.indicator_raw_id);
    const notFoundIds = indicatorRawIds.filter(
      (id) => !existingIds.includes(id),
    );
    if (notFoundIds.length > 0) {
      return {
        success: false,
        err: `Raw indicators not found: ${notFoundIds.join(", ")}`,
      };
    }

    // CASCADE foreign key will automatically delete mappings
    await mainDb`
      DELETE FROM indicators_raw 
      WHERE indicator_raw_id = ANY(${indicatorRawIds})
    `;

    return { success: true };
  });
}

// =============================================================================
// BULK OPERATIONS
// =============================================================================

// Batch upload raw indicators from CSV file (ID and label only, no mappings)
export async function batchUploadRawIndicators(
  mainDb: Sql,
  assetFileName: string,
  replaceAllExisting: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const filePath = resolveAssetFilePath(assetFileName);
    let csvData: Record<string, string>[];
    try {
      csvData = (
        await readCsvFile(filePath, {
          rowHeaders: "none",
        })
      ).toObjects();
    } catch (error) {
      return {
        success: false,
        err: `Failed to read CSV file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    const batchIndicators = csvData.map((row: Record<string, string>) => ({
      raw_indicator_id: row.raw_indicator_id || "",
      raw_indicator_label: row.raw_indicator_label || "",
    }));

    for (const batch of batchIndicators) {
      if (!batch.raw_indicator_id || !batch.raw_indicator_label) {
        return {
          success: false,
          err: "Each row must have raw_indicator_id and raw_indicator_label",
        };
      }
    }

    // Row numbers are 1-based and count the CSV header row
    const invalidIdRows = batchIndicators.flatMap((batch, index) => {
      const idIssue = getNewIndicatorIdIssue(batch.raw_indicator_id);
      return idIssue
        ? [
          `row ${index + 2} (${batch.raw_indicator_id}): ${
            describeNewIndicatorIdIssue(idIssue)
          }`,
        ]
        : [];
    });
    if (invalidIdRows.length > 0) {
      return {
        success: false,
        err: `Invalid indicator IDs in CSV: ${invalidIdRows.join("; ")}`,
      };
    }

    await mainDb.begin(async (sql) => {
      if (replaceAllExisting) {
        await sql`DELETE FROM indicators_raw`;
      }

      for (const batch of batchIndicators) {
        await sql`
          INSERT INTO indicators_raw (indicator_raw_id, indicator_raw_label, updated_at)
          VALUES (${batch.raw_indicator_id}, ${batch.raw_indicator_label}, CURRENT_TIMESTAMP)
          ON CONFLICT (indicator_raw_id)
          DO UPDATE SET
            indicator_raw_label = EXCLUDED.indicator_raw_label,
            updated_at = CURRENT_TIMESTAMP
        `;
      }
    });

    return { success: true };
  });
}

// Batch upload indicators from CSV file
export async function batchUploadIndicators(
  mainDb: Sql,
  assetFileName: string,
  replaceAllExisting: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Read and parse the CSV file
    const filePath = resolveAssetFilePath(assetFileName);
    let csvData: Record<string, string>[];
    try {
      csvData = (
        await readCsvFile(filePath, {
          rowHeaders: "none",
        })
      ).toObjects();
    } catch (error) {
      return {
        success: false,
        err: `Failed to read CSV file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    // Parse batch indicators from CSV
    const batchIndicators: BatchIndicator[] = csvData.map(
      (row: Record<string, string>) => ({
        indicator_common_id: row.indicator_common_id || "",
        indicator_common_label: row.indicator_common_label || "",
        mapped_raw_indicator_ids: row.mapped_raw_indicator_ids || "",
      }),
    );

    // Validate required fields
    for (const batch of batchIndicators) {
      if (!batch.indicator_common_id || !batch.indicator_common_label) {
        return {
          success: false,
          err:
            "Each row must have indicator_common_id and indicator_common_label",
        };
      }
    }

    // Parse the mapped_raw_indicator_ids (comma, colon, or semicolon separated)
    const parsedBatchIndicators = batchIndicators.map((batch) => ({
      ...batch,
      rawIds: batch.mapped_raw_indicator_ids
        .split(/[,:;]/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    }));

    // Row numbers are 1-based and count the CSV header row
    const invalidIdRows = parsedBatchIndicators.flatMap((batch, index) => {
      const rowErrors: string[] = [];
      const commonIdIssue = getNewIndicatorIdIssue(batch.indicator_common_id);
      if (commonIdIssue) {
        rowErrors.push(
          `row ${index + 2} (${batch.indicator_common_id}): ${
            describeNewIndicatorIdIssue(commonIdIssue)
          }`,
        );
      }
      for (const rawId of batch.rawIds) {
        const rawIdIssue = getNewIndicatorIdIssue(rawId);
        if (rawIdIssue) {
          rowErrors.push(
            `row ${index + 2} (${rawId}): ${
              describeNewIndicatorIdIssue(rawIdIssue)
            }`,
          );
        }
      }
      return rowErrors;
    });
    if (invalidIdRows.length > 0) {
      return {
        success: false,
        err: `Invalid indicator IDs in CSV: ${invalidIdRows.join("; ")}`,
      };
    }

    // A CSV row defines a BASE common (id, label, raw mappings). An id that is
    // currently derived cannot take that definition — the upsert would attach
    // mappings to a formula (updateIndicatorCommon's rule, enforced here
    // too). Checked against the live table in BOTH modes: the replace-all
    // wipe deliberately keeps derived rows.
    const csvIds = parsedBatchIndicators.map((b) => b.indicator_common_id);
    const nonBase = await mainDb<{ indicator_common_id: string }[]>`
      SELECT indicator_common_id FROM indicators
      WHERE indicator_common_id = ANY(${csvIds})
        AND definition_type <> 'base'
    `;
    if (nonBase.length > 0) {
      return {
        success: false,
        err: `These ids are derived indicators, which are defined by an expression, not by raw mappings: ${
          nonBase.map((r) => r.indicator_common_id).join(", ")
        }. Edit or delete them in the indicator manager first.`,
      };
    }

    // Process the batch indicators in a transaction
    await mainDb.begin(async (sql) => {
      // If replaceAllExisting is true, delete all existing indicators and mappings first
      if (replaceAllExisting) {
        // Delete all mappings
        await sql`
          DELETE FROM indicator_mappings
        `;

        // Delete all raw indicators
        await sql`
          DELETE FROM indicators_raw
        `;

        // Delete all non-default BASE common indicators. Derived rows are
        // definitions, not data mappings, and a CSV of ids and raw mappings
        // has nothing to say about them.
        await sql`
          DELETE FROM indicators
          WHERE is_default = FALSE AND definition_type = 'base'
        `;
      }

      // New rows sort after everything that exists (CSV order preserved);
      // an update keeps the row's place. Without this the column DEFAULT 0
      // would put every uploaded common ahead of the seeded ones.
      let sortOrder = (
        await sql<{ next: number }[]>`
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM indicators
        `
      )[0].next;

      for (const batch of parsedBatchIndicators) {
        const rawIds = batch.rawIds;

        // Insert or update the common indicator
        await sql`
          INSERT INTO indicators (indicator_common_id, indicator_common_label, is_default, sort_order, updated_at)
          VALUES (${batch.indicator_common_id}, ${batch.indicator_common_label}, FALSE, ${sortOrder++}, CURRENT_TIMESTAMP)
          ON CONFLICT (indicator_common_id)
          DO UPDATE SET
            indicator_common_label = EXCLUDED.indicator_common_label,
            updated_at = CURRENT_TIMESTAMP
        `;

        // First, ensure all raw indicators exist in indicators_raw
        for (const rawId of rawIds) {
          // Note: Using rawId as label since batch upload CSV doesn't provide raw indicator labels
          // Users should use updateIndicatorRaw to set proper labels after batch upload
          await sql`
            INSERT INTO indicators_raw (indicator_raw_id, indicator_raw_label, updated_at)
            VALUES (${rawId}, ${rawId}, CURRENT_TIMESTAMP)
            ON CONFLICT (indicator_raw_id)
            DO UPDATE SET
              updated_at = CURRENT_TIMESTAMP
          `;
        }

        // Then insert mappings for each raw indicator ID
        for (const rawId of rawIds) {
          await sql`
            INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
            VALUES (${rawId}, ${batch.indicator_common_id}, CURRENT_TIMESTAMP)
            ON CONFLICT (indicator_raw_id, indicator_common_id)
            DO UPDATE SET
              updated_at = CURRENT_TIMESTAMP
          `;
        }
      }

      // A wipe can strip a base common that some derived indicator's formula
      // still names. That used to surface as a foreign-key error from the
      // retired calculated_indicators table; it stays a loud abort.
      const survivors = await loadExpressionDictionaryEntries(sql);
      const dictionary = buildExpressionDictionary(survivors);
      for (const survivor of survivors) {
        if (survivor.type !== "derived") continue;
        resolveIndicatorExpression({
          ownId: survivor.id,
          source: survivor.expression ?? "",
          dictionary,
          maxIngredients: MAX_INDICATOR_EXPRESSION_INGREDIENTS,
        });
      }
    });

    return { success: true };
  });
}
