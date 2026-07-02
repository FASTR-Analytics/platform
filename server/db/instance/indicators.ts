import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  type BatchIndicator,
  describeNewIndicatorIdIssue,
  getNewIndicatorIdIssue,
  type InstanceIndicatorDetails,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { resolveAssetFilePath } from "./assets.ts";
import { readCsvFile } from "@timroberton/panther";

// =============================================================================
// READ OPERATIONS
// =============================================================================

// Get all indicators with their mappings
export async function getIndicatorsWithMappings(
  mainDb: Sql,
): Promise<APIResponseWithData<InstanceIndicatorDetails>> {
  return await tryCatchDatabaseAsync(async () => {
    // Get all common indicators with their raw ID mappings aggregated
    const commonIndicatorsResult = await mainDb<
      {
        indicator_common_id: string;
        indicator_common_label: string;
        is_default: boolean;
        raw_indicator_ids: string | null;
      }[]
    >`
      SELECT 
        i.indicator_common_id,
        i.indicator_common_label,
        i.is_default,
        STRING_AGG(im.indicator_raw_id, ',') as raw_indicator_ids
      FROM indicators i
      LEFT JOIN indicator_mappings im ON i.indicator_common_id = im.indicator_common_id
      GROUP BY i.indicator_common_id, i.indicator_common_label, i.is_default
      ORDER BY i.indicator_common_id
    `;

    const commonIndicators = commonIndicatorsResult.map((row) => ({
      indicator_common_id: row.indicator_common_id,
      indicator_common_label: row.indicator_common_label,
      is_default: row.is_default,
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

// Create multiple common indicators with raw indicator mappings
export async function createIndicatorsCommon(
  mainDb: Sql,
  indicators: Array<{
    indicator_common_id: string;
    indicator_common_label: string;
    mapped_raw_ids: string[];
  }>,
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

    // All-or-nothing: one failed item aborts the whole Postgres transaction
    // (every later statement fails with "transaction is aborted"), so
    // per-item catch-and-continue can never deliver partial success. The
    // rethrow decorates the error with the item that caused it.
    await mainDb.begin(async (sql) => {
      for (const indicator of indicators) {
        try {
          await sql`
            INSERT INTO indicators (indicator_common_id, indicator_common_label, is_default, updated_at)
            VALUES (${indicator.indicator_common_id}, ${indicator.indicator_common_label}, FALSE, CURRENT_TIMESTAMP)
          `;
          for (const rawId of indicator.mapped_raw_ids) {
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
  newIndicatorCommonId: string,
  indicatorCommonLabel: string,
  mappedRawIds: string[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (oldIndicatorCommonId !== newIndicatorCommonId) {
      return {
        success: false,
        err:
          "Indicator IDs cannot be changed after creation. Create a new indicator instead.",
      };
    }

    await mainDb.begin(async (sql) => {
      // Update the common indicator
      await sql`
        UPDATE indicators
        SET
          indicator_common_id = ${newIndicatorCommonId},
          indicator_common_label = ${indicatorCommonLabel},
          updated_at = CURRENT_TIMESTAMP
        WHERE indicator_common_id = ${oldIndicatorCommonId}
      `;

      // Delete existing mappings
      await sql`
        DELETE FROM indicator_mappings 
        WHERE indicator_common_id = ${oldIndicatorCommonId}
      `;

      // Create new mappings
      for (const rawId of mappedRawIds) {
        await sql`
          INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
          VALUES (${rawId}, ${newIndicatorCommonId}, CURRENT_TIMESTAMP)
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

    // Friendlier than the ON DELETE RESTRICT foreign-key error
    const blockingCalculated = await mainDb<
      {
        calculated_indicator_id: string;
        num_indicator_id: string;
        denom_indicator_id: string | null;
      }[]
    >`
      SELECT calculated_indicator_id, num_indicator_id, denom_indicator_id
      FROM calculated_indicators
      WHERE num_indicator_id = ANY(${indicatorCommonIds})
         OR denom_indicator_id = ANY(${indicatorCommonIds})
      ORDER BY calculated_indicator_id
    `;
    if (blockingCalculated.length > 0) {
      const requestedIds = new Set(indicatorCommonIds);
      const details = blockingCalculated.map((row) => {
        const usedIds = [
          ...new Set(
            [row.num_indicator_id, row.denom_indicator_id].filter(
              (id): id is string => id !== null && requestedIds.has(id),
            ),
          ),
        ];
        return `${row.calculated_indicator_id} (uses ${usedIds.join(", ")})`;
      });
      return {
        success: false,
        err:
          `Cannot delete common indicators referenced by calculated indicators: ${
            details.join("; ")
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

        // Delete all non-default common indicators
        await sql`
          DELETE FROM indicators
          WHERE is_default = FALSE
        `;
      }

      for (const batch of parsedBatchIndicators) {
        const rawIds = batch.rawIds;

        // Insert or update the common indicator
        await sql`
          INSERT INTO indicators (indicator_common_id, indicator_common_label, is_default, updated_at)
          VALUES (${batch.indicator_common_id}, ${batch.indicator_common_label}, FALSE, CURRENT_TIMESTAMP)
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
    });

    return { success: true };
  });
}
