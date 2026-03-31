import { Sql } from "postgres";
import { APIResponseNoData, APIResponseWithData, type HfaIndicator } from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export type DBHfaIndicator = {
  var_name: string;
  category: string;
  definition: string;
  r_code: string;
  r_filter_code: string | null;
  type: "binary" | "numeric";
  sort_order: number;
  updated_at: string;
};

export function dbRowToHfaIndicator(row: DBHfaIndicator): HfaIndicator {
  return {
    varName: row.var_name,
    category: row.category,
    definition: row.definition,
    rCode: row.r_code,
    rFilterCode: row.r_filter_code ?? undefined,
    type: row.type,
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
  sortOrder: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO hfa_indicators (var_name, category, definition, r_code, r_filter_code, type, sort_order, updated_at)
      VALUES (${indicator.varName}, ${indicator.category}, ${indicator.definition}, ${indicator.rCode}, ${indicator.rFilterCode ?? null}, ${indicator.type}, ${sortOrder}, CURRENT_TIMESTAMP)
    `;
    return { success: true };
  });
}

export async function updateHfaIndicator(
  mainDb: Sql,
  oldVarName: string,
  indicator: HfaIndicator,
  sortOrder: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      UPDATE hfa_indicators
      SET var_name = ${indicator.varName},
          category = ${indicator.category},
          definition = ${indicator.definition},
          r_code = ${indicator.rCode},
          r_filter_code = ${indicator.rFilterCode ?? null},
          type = ${indicator.type},
          sort_order = ${sortOrder},
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
          INSERT INTO hfa_indicators (var_name, category, definition, r_code, r_filter_code, type, sort_order, updated_at)
          VALUES (${ind.varName}, ${ind.category}, ${ind.definition}, ${ind.rCode}, ${ind.rFilterCode ?? null}, ${ind.type}, ${i}, CURRENT_TIMESTAMP)
          ON CONFLICT (var_name)
          DO UPDATE SET
            category = EXCLUDED.category,
            definition = EXCLUDED.definition,
            r_code = EXCLUDED.r_code,
            r_filter_code = EXCLUDED.r_filter_code,
            type = EXCLUDED.type,
            sort_order = EXCLUDED.sort_order,
            updated_at = CURRENT_TIMESTAMP
        `;
      }
    });
    return { success: true };
  });
}
