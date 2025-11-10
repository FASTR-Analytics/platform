import { Sql } from "postgres";
import { join } from "@std/path";
import {
  APIResponseNoData,
  APIResponseWithData,
  type InstanceIndicatorDetails,
  type BatchIndicator,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { _ASSETS_DIR_PATH } from "../../exposed_env_vars.ts";
import { readCsvFile } from "@timroberton/panther";

// =============================================================================
// READ OPERATIONS
// =============================================================================

// Get all indicators with their mappings
export async function getIndicatorsWithMappings(
  mainDb: Sql
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
  }>
): Promise<
  APIResponseWithData<{ created: number; failed: number; errors: string[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const results = { created: 0, failed: 0, errors: [] as string[] };

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

    await mainDb.begin(async (sql) => {
      for (const indicator of indicators) {
        try {
          // Create the common indicator
          await sql`
            INSERT INTO indicators (indicator_common_id, indicator_common_label, is_default, updated_at)
            VALUES (${indicator.indicator_common_id}, ${indicator.indicator_common_label}, FALSE, CURRENT_TIMESTAMP)
          `;

          // Create mappings
          for (const rawId of indicator.mapped_raw_ids) {
            await sql`
              INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
              VALUES (${rawId}, ${indicator.indicator_common_id}, CURRENT_TIMESTAMP)
            `;
          }

          results.created++;
        } catch (error) {
          results.failed++;
          results.errors.push(
            `${indicator.indicator_common_id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    });

    return { success: true, data: results };
  });
}

// // Create a single common indicator (backwards compatibility)
// export async function createIndicator(
//   mainDb: Sql,
//   indicatorCommonId: string,
//   indicatorCommonLabel: string,
//   mappedRawIds: string[]
// ): Promise<APIResponseNoData> {
//   const result = await createIndicators(mainDb, [
//     {
//       indicator_common_id: indicatorCommonId,
//       indicator_common_label: indicatorCommonLabel,
//       mapped_raw_ids: mappedRawIds,
//     },
//   ]);

//   if (!result.success) {
//     return { success: false, err: result.err };
//   }

//   if (result.data.failed > 0) {
//     return { success: false, err: result.data.errors[0] };
//   }

//   return { success: true };
// }

// Update a common indicator and replace its raw indicator mappings
export async function updateIndicatorCommon(
  mainDb: Sql,
  oldIndicatorCommonId: string,
  newIndicatorCommonId: string,
  indicatorCommonLabel: string,
  mappedRawIds: string[]
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
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
  indicatorCommonIds: string[]
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    if (indicatorCommonIds.length === 0) {
      return { success: true };
    }

    // Filter out default indicators and non-existent indicators
    const allIndicators = await mainDb<
      { indicator_common_id: string; is_default: boolean }[]
    >`
      SELECT indicator_common_id, is_default
      FROM indicators
      WHERE indicator_common_id = ANY(${indicatorCommonIds})
    `;

    // Check for error conditions
    const defaultIndicators = allIndicators.filter((row) => row.is_default);
    const nonDefaultIndicators = allIndicators.filter((row) => !row.is_default);

    // Error: if only one indicator and it's default, or all indicators are default
    if (indicatorCommonIds.length === 1 && defaultIndicators.length === 1) {
      return { success: false, err: "Cannot delete default indicator" };
    }
    if (
      defaultIndicators.length === allIndicators.length &&
      allIndicators.length > 0
    ) {
      return { success: false, err: "Cannot delete default indicators" };
    }

    const indicatorsToDelete = nonDefaultIndicators.map(
      (row) => row.indicator_common_id
    );

    if (indicatorsToDelete.length === 0) {
      return { success: true };
    }

    // CASCADE foreign key will automatically delete mappings
    await mainDb`
      DELETE FROM indicators 
      WHERE indicator_common_id = ANY(${indicatorsToDelete})
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
  }>
): Promise<
  APIResponseWithData<{ created: number; failed: number; errors: string[] }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const results = { created: 0, failed: 0, errors: [] as string[] };

    await mainDb.begin(async (sql) => {
      for (const indicator of indicators) {
        try {
          // Create the raw indicator
          await sql`
            INSERT INTO indicators_raw (indicator_raw_id, indicator_raw_label, updated_at)
            VALUES (${indicator.indicator_raw_id}, ${indicator.indicator_raw_label}, CURRENT_TIMESTAMP)
            ON CONFLICT (indicator_raw_id) 
            DO UPDATE SET 
              indicator_raw_label = EXCLUDED.indicator_raw_label,
              updated_at = CURRENT_TIMESTAMP
          `;

          // Create mappings
          for (const commonId of indicator.mapped_common_ids) {
            await sql`
              INSERT INTO indicator_mappings (indicator_raw_id, indicator_common_id, updated_at)
              VALUES (${indicator.indicator_raw_id}, ${commonId}, CURRENT_TIMESTAMP)
              ON CONFLICT (indicator_raw_id, indicator_common_id) 
              DO UPDATE SET updated_at = CURRENT_TIMESTAMP
            `;
          }

          results.created++;
        } catch (error) {
          results.failed++;
          results.errors.push(
            `${indicator.indicator_raw_id}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    });

    return { success: true, data: results };
  });
}

// // Create a single raw indicator (backwards compatibility)
// export async function createIndicatorRaw(
//   mainDb: Sql,
//   indicatorRawId: string,
//   indicatorRawLabel: string,
//   mappedCommonIds: string[]
// ): Promise<APIResponseNoData> {
//   const result = await createIndicatorsRaw(mainDb, [{
//     indicator_raw_id: indicatorRawId,
//     indicator_raw_label: indicatorRawLabel,
//     mapped_common_ids: mappedCommonIds
//   }]);

//   if (!result.success) {
//     return { success: false, err: result.err };
//   }

//   if (result.data.failed > 0) {
//     return { success: false, err: result.data.errors[0] };
//   }

//   return { success: true };
// }

// Update a raw indicator and replace its common indicator mappings
export async function updateIndicatorRaw(
  mainDb: Sql,
  oldIndicatorRawId: string,
  newIndicatorRawId: string,
  indicatorRawLabel: string,
  mappedCommonIds: string[]
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      // If changing the ID, check if it's used in dataset_hmis
      if (oldIndicatorRawId !== newIndicatorRawId) {
        const usageCheck = await sql<{ count: number }[]>`
          SELECT COUNT(*) as count 
          FROM dataset_hmis 
          WHERE indicator_raw_id = ${oldIndicatorRawId}
        `;
        if ((usageCheck[0]?.count ?? 0) > 0) {
          return {
            success: false,
            err: `Cannot change indicator_raw_id for ${oldIndicatorRawId}: It has ${usageCheck[0].count} records in dataset_hmis`,
          };
        }
      }

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
  indicatorRawIds: string[]
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
        err: `Cannot delete raw indicators with data in dataset_hmis: ${usageDetails}`,
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
      (id) => !existingIds.includes(id)
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

// Delete all non-default indicators and raw indicators (automatically cascades to mappings)
export async function deleteAllIndicators(
  mainDb: Sql
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      // Delete all raw indicators (CASCADE will delete their mappings)
      await sql`
        DELETE FROM indicators_raw
      `;

      // Delete all non-default common indicators (CASCADE will delete remaining mappings)
      await sql`
        DELETE FROM indicators
        WHERE is_default = FALSE
      `;
    });

    return { success: true };
  });
}

// Batch upload indicators from CSV file
export async function batchUploadIndicators(
  mainDb: Sql,
  assetFileName: string,
  replaceAllExisting = false
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Read and parse the CSV file
    const filePath = join(_ASSETS_DIR_PATH, assetFileName);
    let csvData: Record<string, string>[];
    try {
      csvData = (
        await readCsvFile(filePath, {
          rowHeaders: "none",
        })
      ).getAsObjectArray();
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
      })
    );

    // Validate required fields
    for (const batch of batchIndicators) {
      if (!batch.indicator_common_id || !batch.indicator_common_label) {
        return {
          success: false,
          err: "Each row must have indicator_common_id and indicator_common_label",
        };
      }
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

      for (const batch of batchIndicators) {
        // Parse the mapped_raw_indicator_ids (comma, colon, or semicolon separated)
        const rawIds = batch.mapped_raw_indicator_ids
          .split(/[,:;]/)
          .map((id) => id.trim())
          .filter((id) => id.length > 0);

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
