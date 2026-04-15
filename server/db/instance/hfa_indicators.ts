import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaDictionaryForValidation,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export type DBHfaIndicator = {
  var_name: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sort_order: number;
  updated_at: string;
};

type DBHfaIndicatorCode = {
  var_name: string;
  time_point: string;
  r_code: string;
  r_filter_code: string | null;
};

export function dbRowToHfaIndicator(row: DBHfaIndicator): HfaIndicator {
  return {
    varName: row.var_name,
    category: row.category,
    definition: row.definition,
    type: row.type,
    aggregation: row.aggregation,
    sortOrder: row.sort_order,
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

export async function createHfaIndicator(
  mainDb: Sql,
  indicator: HfaIndicator,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicators (var_name, category, definition, type, aggregation, sort_order, updated_at)
      VALUES (${indicator.varName}, ${indicator.category}, ${indicator.definition}, ${indicator.type}, ${indicator.aggregation}, ${indicator.sortOrder}, CURRENT_TIMESTAMP)
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
          category = ${indicator.category},
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
      for (let i = 0; i < indicators.length; i++) {
        const ind = indicators[i];
        await sql`
          INSERT INTO hfa_indicators (var_name, category, definition, type, aggregation, sort_order, updated_at)
          VALUES (${ind.varName}, ${ind.category}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${i}, CURRENT_TIMESTAMP)
          ON CONFLICT (var_name)
          DO UPDATE SET
            category = EXCLUDED.category,
            definition = EXCLUDED.definition,
            type = EXCLUDED.type,
            aggregation = EXCLUDED.aggregation,
            sort_order = EXCLUDED.sort_order,
            updated_at = CURRENT_TIMESTAMP
        `;
      }
      const uploadedVarNames = new Set(indicators.map((i) => i.varName));
      for (const varName of uploadedVarNames) {
        await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${varName}`;
      }
      for (const c of code) {
        if (!c.rCode.trim()) continue;
        await sql`
          INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
          VALUES (${c.varName}, ${c.timePoint}, ${c.rCode}, ${c.rFilterCode ?? null})
        `;
      }
    });
    return { success: true };
  });
}

export async function saveHfaIndicatorFull(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
  code: { timePoint: string; rCode: string; rFilterCode: string | undefined }[],
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
        UPDATE hfa_indicators
        SET var_name = ${indicator.varName},
            category = ${indicator.category},
            definition = ${indicator.definition},
            type = ${indicator.type},
            aggregation = ${indicator.aggregation},
            sort_order = ${indicator.sortOrder},
            updated_at = CURRENT_TIMESTAMP
        WHERE var_name = ${oldVarName}
      `;
      // If varName changed, hfa_indicator_code FKs cascade the rename
      // Delete all code for this indicator and re-insert
      await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${indicator.varName}`;
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

export async function updateHfaIndicatorCode(
  mainDb: Sql,
  varName: string,
  timePoint: string,
  rCode: string,
  rFilterCode: string | undefined,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
      VALUES (${varName}, ${timePoint}, ${rCode}, ${rFilterCode ?? null})
      ON CONFLICT (var_name, time_point)
      DO UPDATE SET
        r_code = EXCLUDED.r_code,
        r_filter_code = EXCLUDED.r_filter_code
    `;
    return { success: true };
  });
}

// ============================================================================
// Dictionary for Validation
// ============================================================================

export async function getHfaDictionaryForValidation(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaDictionaryForValidation>> {
  return await tryCatchDatabaseAsync(async () => {
    const tpRows = await mainDb<{ time_point: string; time_point_label: string }[]>`
      SELECT time_point, time_point_label FROM dataset_hfa_dictionary_time_points ORDER BY time_point
    `;
    const varRows = await mainDb<{ time_point: string; var_name: string; var_label: string; var_type: string }[]>`
      SELECT time_point, var_name, var_label, var_type FROM dataset_hfa_dictionary_vars ORDER BY time_point, var_name
    `;
    const valRows = await mainDb<{ time_point: string; var_name: string; value: string; value_label: string }[]>`
      SELECT time_point, var_name, value, value_label FROM dataset_hfa_dictionary_values ORDER BY time_point, var_name, value
    `;

    const timePoints = tpRows.map((tp) => {
      return {
        timePoint: tp.time_point,
        timePointLabel: tp.time_point_label,
        vars: varRows
          .filter((v) => v.time_point === tp.time_point)
          .map((v) => ({ varName: v.var_name, varLabel: v.var_label, varType: v.var_type })),
        values: valRows
          .filter((v) => v.time_point === tp.time_point)
          .map((v) => ({ varName: v.var_name, value: v.value, valueLabel: v.value_label })),
      };
    });

    return { success: true, data: { timePoints } };
  });
}
