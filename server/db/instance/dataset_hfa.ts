import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  HfaTaxonomyForAI,
  hfaTimePointsForAI,
  ItemsHolderDatasetHfaDisplay,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export async function getHfaTimePointOrder(mainDb: Sql): Promise<string[]> {
  const rows = await mainDb<{ label: string }[]>`
    SELECT label FROM hfa_time_points ORDER BY sort_order
  `;
  return rows.map((r) => r.label);
}

// Time points are instance-wide (not run content: every run of an instance
// shares its survey rounds); hfaTimePointsForAI keeps the imported ones.
export async function getHfaTimePointsForAI(
  mainDb: Sql,
): Promise<HfaTaxonomyForAI["timePoints"]> {
  const rows = await mainDb<
    {
      label: string;
      period_id: string;
      sort_order: number;
      imported_at: string | null;
    }[]
  >`
    SELECT label, period_id, sort_order, imported_at FROM hfa_time_points
    ORDER BY sort_order
  `;
  return hfaTimePointsForAI(rows.map((r) => ({
    label: r.label,
    periodId: r.period_id,
    sortOrder: r.sort_order,
    importedAt: r.imported_at ?? undefined,
  })));
}

export function computeHfaCacheHash(
  timePointRows: {
    label: string;
    sort_order: number;
    imported_at: string | null;
  }[],
): string {
  return timePointRows
    .map((r) => `${r.label}:${r.sort_order}:${r.imported_at ?? ""}`)
    .join("|");
}

////////////////////////////////////////////////////////////////////////////////
//  __     __                               __                                //
// /  |   /  |                             /  |                               //
// $$ |   $$ | ______    ______    _______ $$/   ______   _______    _______  //
// $$ |   $$ |/      \  /      \  /       |/  | /      \ /       \  /       | //
// $$  \ /$$//$$$$$$  |/$$$$$$  |/$$$$$$$/ $$ |/$$$$$$  |$$$$$$$  |/$$$$$$$/  //
//   $$  /$$/ $$    $$ |$$ |  $$/ $$      \ $$ |$$ |  $$ |$$ |  $$ |$$      \  //
//   $$ $$/  $$$$$$$$/ $$ |       $$$$$$  |$$ |$$ \__$$ |$$ |  $$ | $$$$$$  | //
//    $$$/   $$       |$$ |      /     $$/ $$ |$$    $$/ $$ |  $$ |/     $$/  //
//     $/     $$$$$$$/ $$/       $$$$$$$/  $$/  $$$$$$/  $$/   $$/ $$$$$$$/   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export async function deleteDatasetHfaData(
  mainDb: Sql,
  timePoint?: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Deletes data + dictionary only. Time points, sampling weights, and
    // indicator code are kept: rounds are managed via the time points page.
    await mainDb.begin(async (sql) => {
      if (timePoint) {
        await sql`DELETE FROM hfa_data WHERE time_point = ${timePoint}`;
        await sql`DELETE FROM hfa_variable_values WHERE time_point = ${timePoint}`;
        await sql`DELETE FROM hfa_variables WHERE time_point = ${timePoint}`;
        await sql`UPDATE hfa_time_points SET imported_at = NULL WHERE label = ${timePoint}`;
      } else {
        await sql`DELETE FROM hfa_data`;
        await sql`DELETE FROM hfa_variable_values`;
        await sql`DELETE FROM hfa_variables`;
        await sql`UPDATE hfa_time_points SET imported_at = NULL`;
      }
    });
    return { success: true };
  });
}

////////////////////////////////////////////////////////
//  ______  __                                        //
// /      |/  |                                       //
// $$$$$$/_$$ |_     ______   _____  ____    _______  //
//   $$ |/ $$   |   /      \ /     \/    \  /       | //
//   $$ |$$$$$$/   /$$$$$$  |$$$$$$ $$$$  |/$$$$$$$/  //
//   $$ |  $$ | __ $$    $$ |$$ | $$ | $$ |$$      \  //
//  _$$ |_ $$ |/  |$$$$$$$$/ $$ | $$ | $$ | $$$$$$  | //
// / $$   |$$  $$/ $$       |$$ | $$ | $$ |/     $$/  //
// $$$$$$/  $$$$/   $$$$$$$/ $$/  $$/  $$/ $$$$$$$/   //
//                                                    //
////////////////////////////////////////////////////////

///////////////////////
//                   //
//    FOR DISPLAY    //
//                   //
///////////////////////

export async function getDatasetHfaItemsForDisplay(
  mainDb: Sql,
): Promise<APIResponseWithData<ItemsHolderDatasetHfaDisplay>> {
  return await tryCatchDatabaseAsync(async () => {
    // Time points for cache hash
    const timePointRows = await mainDb<
      { label: string; sort_order: number; imported_at: string | null }[]
    >`
      SELECT label, sort_order, imported_at
      FROM hfa_time_points
      ORDER BY sort_order
    `;

    // Variable labels per (time_point, variable_id)
    const dictVariableRows = await mainDb<
      {
        time_point: string;
        variable_id: string;
        variable_label: string;
        variable_type: string;
      }[]
    >`
      SELECT time_point, variable_id, variable_label, variable_type
      FROM hfa_variables
      ORDER BY variable_id, time_point
    `;

    // Questionnaire values per (time_point, variable_id): only for select variables
    const dictValueRows = await mainDb<
      {
        time_point: string;
        variable_id: string;
        value: string;
        value_label: string;
      }[]
    >`
      SELECT time_point, variable_id, value, value_label
      FROM hfa_variable_values
      ORDER BY variable_id, time_point, value
    `;
    // Build map: "tp|variable_id" → "1: Yes, 2: No, ..."
    const questionnaireValuesMap = new Map<string, string>();
    {
      const grouped = new Map<string, string[]>();
      for (const r of dictValueRows) {
        const key = `${r.time_point}|${r.variable_id}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(`${r.value}: ${r.value_label}`);
      }
      for (const [key, parts] of grouped) {
        questionnaireValuesMap.set(key, parts.join(", "));
      }
    }

    // Counts and missing per (variable_id, time_point)
    const statsRows = await mainDb<{
      variable_id: string;
      time_point: string;
      total_count: string;
      missing_count: string;
    }[]>`
      SELECT
        variable_id,
        time_point,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE value = '') AS missing_count
      FROM hfa_data
      GROUP BY variable_id, time_point
      ORDER BY variable_id, time_point
    `;

    // Distinct data values for ALL variables
    const dataValueRows = await mainDb<
      { time_point: string; variable_id: string; value: string }[]
    >`
      SELECT DISTINCT d.time_point, d.variable_id, d.value
      FROM hfa_data d
      WHERE d.value != ''
      ORDER BY d.variable_id, d.time_point, d.value
    `;
    const dataValuesMap = new Map<string, string>();
    {
      const grouped = new Map<string, string[]>();
      for (const r of dataValueRows) {
        const key = `${r.time_point}|${r.variable_id}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(r.value);
      }
      for (const [key, vals] of grouped) {
        const allNumeric = vals.every((v) => /^-?\d*\.?\d+$/.test(v));
        if (allNumeric) {
          vals.sort((a, b) => Number(a) - Number(b));
        }
        if (vals.length <= 10) {
          dataValuesMap.set(key, vals.join(", "));
        } else {
          const first = vals.slice(0, 3).join(", ");
          const last = vals[vals.length - 1];
          dataValuesMap.set(key, `${first}... ${last}`);
        }
      }
    }

    // Build stats lookup
    const statsMap = new Map<string, { count: number; missing: number }>();
    for (const r of statsRows) {
      const key = `${r.time_point}|${r.variable_id}`;
      statsMap.set(key, {
        count: Number(r.total_count),
        missing: Number(r.missing_count),
      });
    }

    // Build rows: use dictionary variables if available, otherwise fall back to stats
    const rows: import("lib").HfaVariableRow[] = [];

    if (dictVariableRows.length > 0) {
      for (const dv of dictVariableRows) {
        const key = `${dv.time_point}|${dv.variable_id}`;
        const stats = statsMap.get(key);

        rows.push({
          variableId: dv.variable_id,
          variableType: dv.variable_type,
          timePoint: dv.time_point,
          variableLabel: dv.variable_label,
          count: stats?.count ?? 0,
          missing: stats?.missing ?? 0,
          questionnaireValues: questionnaireValuesMap.get(key) ?? "",
          dataValues: dataValuesMap.get(key) ?? "",
        });
      }
    } else {
      for (const r of statsRows) {
        const key = `${r.time_point}|${r.variable_id}`;
        rows.push({
          variableId: r.variable_id,
          variableType: "",
          timePoint: r.time_point,
          variableLabel: r.variable_id,
          count: Number(r.total_count),
          missing: Number(r.missing_count),
          questionnaireValues: "",
          dataValues: dataValuesMap.get(key) ?? "",
        });
      }
    }

    const cacheHash = computeHfaCacheHash(timePointRows);
    return { success: true, data: { rows, cacheHash } };
  });
}
